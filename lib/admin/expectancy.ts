import { q } from "@/lib/db";
import type { ScannerHit } from "./types";

export type ExpectancyProfile = {
  sample: number;
  winRate: number | null;
  avgR: number;
  totalR: number;
  profitFactor: number | null;
  note: string;
};

const EMPTY_PROFILE: ExpectancyProfile = {
  sample: 0,
  winRate: null,
  avgR: 0,
  totalR: 0,
  profitFactor: null,
  note: "No expectancy sample yet.",
};

function profileFromRow(row: any): ExpectancyProfile {
  if (!row) return EMPTY_PROFILE;
  const sample = Number(row.sample ?? 0);
  const wins = Number(row.wins ?? 0);
  const totalR = Number(row.total_r ?? 0);
  const grossWin = Number(row.gross_win_r ?? 0);
  const grossLoss = Math.abs(Number(row.gross_loss_r ?? 0));
  const winRate = sample > 0 ? wins / sample : null;
  const avgR = sample > 0 ? totalR / sample : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? null : 0;
  const note = sample < 10
    ? "Small sample; use scanner evidence first."
    : avgR > 0
      ? `Positive expectancy: ${avgR.toFixed(2)}R avg over ${sample} trades.`
      : `Negative expectancy: ${avgR.toFixed(2)}R avg over ${sample} trades.`;
  return { sample, winRate, avgR: Math.round(avgR * 100) / 100, totalR: Math.round(totalR * 100) / 100, profitFactor, note };
}

export async function loadExpectancyProfiles(symbols: string[], playbooks: string[] = []): Promise<{ bySymbol: Map<string, ExpectancyProfile>; byPlaybook: Map<string, ExpectancyProfile> }> {
  const bySymbol = new Map<string, ExpectancyProfile>();
  const byPlaybook = new Map<string, ExpectancyProfile>();
  const uniqueSymbols = [...new Set(symbols.filter(Boolean).map((s) => s.toUpperCase()))];
  const uniquePlaybooks = [...new Set(playbooks.filter(Boolean))];
  if (!uniqueSymbols.length && !uniquePlaybooks.length) return { bySymbol, byPlaybook };

  try {
    if (uniqueSymbols.length) {
      const rows = await q<any>(`
        SELECT
          symbol,
          COUNT(*)::int AS sample,
          COUNT(*) FILTER (WHERE outcome = 'correct')::int AS wins,
          COALESCE(SUM(CASE
            WHEN outcome = 'correct' THEN 1
            WHEN outcome = 'wrong' THEN -1
            ELSE 0
          END), 0)::float AS total_r,
          COALESCE(SUM(CASE WHEN outcome = 'correct' THEN 1 ELSE 0 END), 0)::float AS gross_win_r,
          COALESCE(SUM(CASE WHEN outcome = 'wrong' THEN -1 ELSE 0 END), 0)::float AS gross_loss_r
        FROM ai_signal_log
        WHERE workspace_id = 'operator-terminal'
          AND symbol = ANY($1::text[])
          AND outcome != 'pending'
          AND signal_at > NOW() - INTERVAL '120 days'
        GROUP BY symbol
      `, [uniqueSymbols]);
      rows.forEach((row) => bySymbol.set(String(row.symbol).toUpperCase(), profileFromRow(row)));
    }

    if (uniquePlaybooks.length) {
      const rows = await q<any>(`
        SELECT
          COALESCE(decision_trace->>'playbook', 'Unknown') AS playbook,
          COUNT(*)::int AS sample,
          COUNT(*) FILTER (WHERE outcome = 'correct')::int AS wins,
          COALESCE(SUM(CASE
            WHEN outcome = 'correct' THEN 1
            WHEN outcome = 'wrong' THEN -1
            ELSE 0
          END), 0)::float AS total_r,
          COALESCE(SUM(CASE WHEN outcome = 'correct' THEN 1 ELSE 0 END), 0)::float AS gross_win_r,
          COALESCE(SUM(CASE WHEN outcome = 'wrong' THEN -1 ELSE 0 END), 0)::float AS gross_loss_r
        FROM ai_signal_log
        WHERE workspace_id = 'operator-terminal'
          AND COALESCE(decision_trace->>'playbook', 'Unknown') = ANY($1::text[])
          AND outcome != 'pending'
          AND signal_at > NOW() - INTERVAL '120 days'
        GROUP BY COALESCE(decision_trace->>'playbook', 'Unknown')
      `, [uniquePlaybooks]);
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
    const blendedAvgR = blendedSample > 0
      ? ((symbolProfile.avgR * symbolProfile.sample) + (playbookProfile.avgR * playbookProfile.sample)) / blendedSample
      : 0;
    const expectancyBoost = Math.max(-8, Math.min(8, blendedAvgR * 8));
    return {
      ...hit,
      expectancy: {
        symbol: symbolProfile,
        playbook: playbookProfile,
        blendedAvgR: Math.round(blendedAvgR * 100) / 100,
        scoreBoost: Math.round(expectancyBoost * 10) / 10,
      },
      eliteScore: hit.eliteScore == null ? hit.eliteScore : Math.max(0, Math.min(100, Math.round((hit.eliteScore + expectancyBoost) * 10) / 10)),
    };
  });
}
