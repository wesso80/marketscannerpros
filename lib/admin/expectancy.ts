import { q } from "@/lib/db";
import type { ScannerHit } from "./types";
import { LABELLER_FIX_AT, signedMoveSql } from "./signalStats";

/**
 * Track record per symbol / playbook from shared-scan signals, used to nudge a hit's elite score.
 *
 * Measured, not assumed: only fixed-labeller verdicts (outcome_measured_at >= LABELLER_FIX_AT) and the real 24h move
 * in the call's direction (%), not a fake ±1R per verdict. Old-method labels are excluded. The score nudge applies
 * only from MIN_SAMPLE_FOR_BOOST outcomes and is shrunk toward zero for small samples, after an assumed cost.
 */
export type ExpectancyProfile = {
  sample: number;
  /** correct ÷ (correct + wrong); neutral excluded. */
  winRate: number | null;
  /** Average 24h move in the call's direction, %, before costs. */
  avgMovePct: number;
  totalMovePct: number;
  /** Sum of favourable moves ÷ |sum of adverse moves|. */
  profitFactor: number | null;
  note: string;
};

export const MIN_SAMPLE_FOR_BOOST = 30;
const ASSUMED_COST_PCT = 0.2;

const EMPTY_PROFILE: ExpectancyProfile = {
  sample: 0,
  winRate: null,
  avgMovePct: 0,
  totalMovePct: 0,
  profitFactor: null,
  note: "No measured outcomes yet.",
};

export function profileFromRow(row: any): ExpectancyProfile {
  if (!row) return EMPTY_PROFILE;
  const sample = Number(row.sample ?? 0);
  const wins = Number(row.wins ?? 0);
  const losses = Number(row.losses ?? 0);
  const total = Number(row.total_move ?? 0);
  const grossWin = Number(row.gross_win ?? 0);
  const grossLoss = Math.abs(Number(row.gross_loss ?? 0));
  const winRate = wins + losses > 0 ? wins / (wins + losses) : null;
  const avg = sample > 0 ? total / sample : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? null : 0;
  const note = sample < MIN_SAMPLE_FOR_BOOST
    ? `Small sample (${sample} measured); no score adjustment.`
    : `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}% avg 24h move over ${sample} measured signals (before costs).`;
  return { sample, winRate, avgMovePct: Math.round(avg * 100) / 100, totalMovePct: Math.round(total * 100) / 100, profitFactor, note };
}

/** Score nudge in points: 0 under MIN_SAMPLE_FOR_BOOST, otherwise the after-cost average shrunk by sample size, ±8 max. */
export function expectancyScoreBoost(avgMovePct: number, sample: number): number {
  if (sample < MIN_SAMPLE_FOR_BOOST) return 0;
  const shrink = sample / (sample + MIN_SAMPLE_FOR_BOOST);
  return Math.max(-8, Math.min(8, (avgMovePct - ASSUMED_COST_PCT) * 4 * shrink));
}

const MEASURED_SQL = `outcome IN ('correct', 'wrong', 'neutral')
          AND outcome_measured_at >= $2::timestamptz
          AND pct_move_24h IS NOT NULL AND ABS(pct_move_24h) <= 100`;
const AGGREGATES_SQL = `COUNT(*)::int AS sample,
          COUNT(*) FILTER (WHERE outcome = 'correct')::int AS wins,
          COUNT(*) FILTER (WHERE outcome = 'wrong')::int AS losses,
          COALESCE(SUM(${signedMoveSql("pct_move_24h")}), 0)::float AS total_move,
          COALESCE(SUM(GREATEST(${signedMoveSql("pct_move_24h")}, 0)), 0)::float AS gross_win,
          COALESCE(SUM(LEAST(${signedMoveSql("pct_move_24h")}, 0)), 0)::float AS gross_loss`;

export async function loadExpectancyProfiles(symbols: string[], playbooks: string[] = []): Promise<{ bySymbol: Map<string, ExpectancyProfile>; byPlaybook: Map<string, ExpectancyProfile> }> {
  const bySymbol = new Map<string, ExpectancyProfile>();
  const byPlaybook = new Map<string, ExpectancyProfile>();
  const uniqueSymbols = [...new Set(symbols.filter(Boolean).map((s) => s.toUpperCase()))];
  const uniquePlaybooks = [...new Set(playbooks.filter(Boolean))];
  if (!uniqueSymbols.length && !uniquePlaybooks.length) return { bySymbol, byPlaybook };

  try {
    if (uniqueSymbols.length) {
      const rows = await q<any>(`
        SELECT symbol, ${AGGREGATES_SQL}
        FROM ai_signal_log
        WHERE workspace_id = 'operator-terminal'
          AND symbol = ANY($1::text[])
          AND ${MEASURED_SQL}
          AND signal_at > NOW() - INTERVAL '120 days'
        GROUP BY symbol
      `, [uniqueSymbols, LABELLER_FIX_AT]);
      rows.forEach((row) => bySymbol.set(String(row.symbol).toUpperCase(), profileFromRow(row)));
    }

    if (uniquePlaybooks.length) {
      const rows = await q<any>(`
        SELECT COALESCE(decision_trace->>'playbook', 'Unknown') AS playbook, ${AGGREGATES_SQL}
        FROM ai_signal_log
        WHERE workspace_id = 'operator-terminal'
          AND COALESCE(decision_trace->>'playbook', 'Unknown') = ANY($1::text[])
          AND ${MEASURED_SQL}
          AND signal_at > NOW() - INTERVAL '120 days'
        GROUP BY COALESCE(decision_trace->>'playbook', 'Unknown')
      `, [uniquePlaybooks, LABELLER_FIX_AT]);
      rows.forEach((row) => byPlaybook.set(String(row.playbook), profileFromRow(row)));
    }
  } catch (err) {
    console.error("[admin:expectancy] Failed to load expectancy profiles:", err);
  }

  return { bySymbol, byPlaybook };
}

export async function enrichHitsWithExpectancy<T extends ScannerHit>(hits: T[]): Promise<T[]> {
  if (!hits.length) return hits;
  const profiles = await loadExpectancyProfiles(
    hits.map((hit) => hit.symbol),
    hits.map((hit) => String(hit.playbook || hit.regime || "Unknown")),
  );
  return hits.map((hit) => {
    const symbolProfile = profiles.bySymbol.get(hit.symbol.toUpperCase()) ?? EMPTY_PROFILE;
    const playbookProfile = profiles.byPlaybook.get(String(hit.playbook || hit.regime || "Unknown")) ?? EMPTY_PROFILE;
    const blendedSample = symbolProfile.sample + playbookProfile.sample;
    const blendedAvgMovePct = blendedSample > 0
      ? ((symbolProfile.avgMovePct * symbolProfile.sample) + (playbookProfile.avgMovePct * playbookProfile.sample)) / blendedSample
      : 0;
    // Symbol and playbook samples overlap (same signals), so eligibility uses the larger one, never their sum.
    const expectancyBoost = expectancyScoreBoost(blendedAvgMovePct, Math.max(symbolProfile.sample, playbookProfile.sample));
    return {
      ...hit,
      expectancy: {
        symbol: symbolProfile,
        playbook: playbookProfile,
        blendedAvgMovePct: Math.round(blendedAvgMovePct * 100) / 100,
        scoreBoost: Math.round(expectancyBoost * 10) / 10,
      },
      eliteScore: hit.eliteScore == null ? hit.eliteScore : Math.max(0, Math.min(100, Math.round((hit.eliteScore + expectancyBoost) * 10) / 10)),
    };
  });
}
