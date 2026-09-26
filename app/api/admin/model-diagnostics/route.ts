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
import { requireAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/db";
import { wrapTruth } from "@/lib/admin";
import { LABELLER_FIX_AT } from "@/lib/admin/signalStats";
import { computeCalibration, type OutcomeRow } from "@/lib/admin/modelDiagnostics";

export const runtime = "nodejs";

const SIGNAL_WORKSPACE = "operator-terminal";

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

export function parseScoreField(v: string | null | undefined): ScoreField {
  const s = String(v ?? "").toLowerCase();
  return s === "elite" || s === "confidence" ? s : "confluence";
}

interface SignalLoad {
  rows: OutcomeRow[];
  oldMethodLabelled: number;
  error: string | null;
}

async function loadSignalOutcomes(field: ScoreField): Promise<SignalLoad> {
  try {
    const [rows, old] = await Promise.all([
      // Verdicts from before the labeller fix are nulled so they don't count as labelled.
      q<OutcomeRow>(
        `SELECT ${SCORE_SQL[field]} AS score,
                CASE WHEN outcome IN ('correct', 'wrong', 'neutral', 'expired') AND (outcome_measured_at IS NULL OR outcome_measured_at < $2::timestamptz)
                     THEN NULL ELSE outcome END AS outcome
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
    return { rows: [], oldMethodLabelled: 0, error: err instanceof Error ? err.message : String(err) };
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
    truth: wrapTruth({}, { source: 'admin:postgres', freshness: 'real-time' }),
  });
}
