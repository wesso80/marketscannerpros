/**
 * GET /api/admin/model-diagnostics — Calibration + drift snapshot for the MSP research model.
 *
 * Reads `ai_signal_log` (migrations/048), workspace 'operator-terminal' (the shared-scan signals, same as
 * /api/admin/signals/stats). `outcome` (pending / correct / wrong / neutral / expired) is the label.
 *
 * Score used for the buckets (`?score=`):
 *   - `confluence` (default): `confluence_score` 0–100 — the scanner's directional confluence, i.e. what the
 *     calibration question ("do higher scores hit more often?") is actually about;
 *   - `elite`: `elite_score` (rounded) — the operator composite shown on the Priority Desk;
 *   - `confidence`: `confidence` 0–100 (the old default; it's the verdict confidence, not the ranking score).
 *
 * Only outcomes measured by the fixed labeller (outcome_measured_at >= LABELLER_FIX_AT) count as labelled.
 * Verdicts written by the old labelling method are reported separately (`oldMethodLabelled`), not mixed in.
 *
 * Saved research cases used to be merged in; they have no outcome, so they only padded the bucket counts.
 * They are no longer included.
 *
 * BOUNDARY: read-only model telemetry. No re-training, no parameter mutation. This is a diagnostics window only.
 */

import { NextRequest, NextResponse } from "next/server";
import { storedTruth } from '@/lib/admin/truthLayer';
import { requireAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/db";
import { LABELLER_FIX_AT, signedMoveSql } from "@/lib/admin/signalStats";
import { ASSUMED_ROUND_TRIP_COST_PCT, MIN_LABELLED_FOR_COMPARISON, computeCalibration, type OutcomeRow } from "@/lib/admin/modelDiagnostics";
import { OUTCOME_MOVE_THRESHOLD_PCT } from "@/lib/outcomes/aiOutcomeLabel";

import { adminErrorText } from '@/lib/admin/errorResponse';
export const runtime = "nodejs";

const SIGNAL_WORKSPACE = "operator-terminal";

/** Newest signal time for the truth stamp; null (shown as not recorded) if it cannot be read. */
async function latestSignalAt(): Promise<string | null> {
  try {
    const rows = await q<{ latest: string | null }>(`SELECT MAX(signal_at) AS latest FROM ai_signal_log WHERE workspace_id = $1`, [SIGNAL_WORKSPACE]);
    return rows?.[0]?.latest ?? null;
  } catch {
    return null;
  }
}

export type ScoreField = "confluence" | "elite" | "confidence";

/** Column expression per score option (whitelisted — never interpolate user input). */
const SCORE_SQL: Record<ScoreField, string> = {
  confluence: "confluence_score",
  elite: "ROUND(elite_score)",
  confidence: "confidence",
};

const SCORE_COLUMN: Record<ScoreField, string> = {
  confluence: "confluence_score",
  elite: "elite_score",
  confidence: "confidence",
};

function parseScoreField(v: string | null | undefined): ScoreField {
  const s = String(v ?? "").toLowerCase();
  return s === "elite" || s === "confidence" ? s : "confluence";
}

type SignalRow = OutcomeRow & { signal_at?: string | Date | null };

interface SignalLoad {
  rows: SignalRow[];
  oldMethodLabelled: number;
  error: string | null;
}

async function loadSignalOutcomes(field: ScoreField): Promise<SignalLoad> {
  try {
    const [rows, old] = await Promise.all([
      // Verdicts from before the labeller fix are nulled so they don't count as labelled.
      q<SignalRow>(
        `SELECT ${SCORE_SQL[field]} AS score, signal_at,
                CASE WHEN outcome IN ('correct', 'wrong', 'neutral', 'expired') AND (outcome_measured_at IS NULL OR outcome_measured_at < $2::timestamptz)
                     THEN NULL ELSE outcome END AS outcome,
                CASE WHEN outcome IN ('correct', 'wrong', 'neutral') AND outcome_measured_at >= $2::timestamptz
                     THEN ${signedMoveSql("pct_move_24h")} ELSE NULL END AS "signedMove"
           FROM ai_signal_log
          WHERE workspace_id = $1 AND ${SCORE_COLUMN[field]} IS NOT NULL
          ORDER BY signal_at DESC
          LIMIT 1000`,
        [SIGNAL_WORKSPACE, LABELLER_FIX_AT],
      ),
      q<{ n: string | number }>(
        `SELECT COUNT(*) AS n
           FROM ai_signal_log
          WHERE workspace_id = $1 AND outcome IN ('correct', 'wrong')
            AND (outcome_measured_at IS NULL OR outcome_measured_at < $2::timestamptz)`,
        [SIGNAL_WORKSPACE, LABELLER_FIX_AT],
      ),
    ]);
    return { rows: rows ?? [], oldMethodLabelled: Number(old?.[0]?.n ?? 0) || 0, error: null };
  } catch (err) {
    return { rows: [], oldMethodLabelled: 0, error: adminErrorText(err, '/api/admin/model-diagnostics') };
  }
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  const scoreField = parseScoreField(req.nextUrl.searchParams.get("score"));
  const signals = await loadSignalOutcomes(scoreField);
  const { buckets, totalLabelled, overallHitRate, drift } = computeCalibration(signals.rows);
  const totalSignals = signals.rows.length;
  const times = signals.rows.map((r) => (r.signal_at ? new Date(r.signal_at).getTime() : NaN)).filter(Number.isFinite);
  const zeroScore = signals.rows.filter((r) => Number(r.score) === 0).length;

  let note: string | null = null;
  if (totalSignals === 0) {
    note = "No ai_signal_log signals recorded yet — every shared-scan run logs its signals, so this fills after the next scan.";
  } else if (totalLabelled === 0) {
    note = `No outcomes labelled by the fixed labeller yet (since ${LABELLER_FIX_AT}). Hit rates stay empty until signals are measured` +
      (signals.oldMethodLabelled > 0 ? `; ${signals.oldMethodLabelled} old-method verdict(s) are excluded.` : ".");
  } else if (signals.oldMethodLabelled > 0) {
    note = `${signals.oldMethodLabelled} verdict(s) from the old labelling method (before ${LABELLER_FIX_AT}) are excluded from hit rates.`;
  }

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    scoreField,
    scoreColumn: SCORE_COLUMN[scoreField],
    totalSignals,
    /** @deprecated same as totalSignals (kept for older clients). */
    totalCases: totalSignals,
    totalLabelled,
    overallHitRate,
    buckets,
    drift,
    sources: {
      aiSignalLog: signals.rows.length,
      aiSignalLogError: signals.error,
      labelledSince: LABELLER_FIX_AT,
      oldMethodLabelled: signals.oldMethodLabelled,
    },
    note,
    /** What the numbers mean, so a hit rate is never read without its denominator, horizon and cost basis. */
    definition: {
      sample: `Latest ${totalSignals} shared-scan signals with a ${SCORE_COLUMN[scoreField]} value (newest first, capped at 1000)`,
      sampleFrom: times.length ? new Date(Math.min(...times)).toISOString() : null,
      sampleTo: times.length ? new Date(Math.max(...times)).toISOString() : null,
      label: `24h close vs price at signal, in the call's direction: correct >= +${OUTCOME_MOVE_THRESHOLD_PCT}%, wrong <= -${OUTCOME_MOVE_THRESHOLD_PCT}%, otherwise neutral`,
      hitRateDenominator: "correct + wrong per band (labelled); neutral, pending and old-method verdicts are left out",
      labelledSince: LABELLER_FIX_AT,
      costs: `Hit rates and avg moves are before costs; 'after cost' subtracts an assumed ${ASSUMED_ROUND_TRIP_COST_PCT}% round trip (not measured). No funding, sizing or overlap adjustment.`,
      minLabelledForComparison: MIN_LABELLED_FOR_COMPARISON,
      zeroScoreSignals: zeroScore,
      zeroScoreNote: zeroScore > 0
        ? "Score 0 rows predate the 2026-09-28 recorder rule that stopped logging score-0 signals; they are legacy rows, not missing values."
        : null,
      overlap: "Signals on the same symbol in the same window are counted separately and are not independent.",
    },
    truth: storedTruth({ source: 'ai_signal_log (Postgres)', dataAsOf: await latestSignalAt(), staleAfterMinutes: 24 * 60 }),
  });
}
