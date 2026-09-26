/**
 * GET /api/admin/model-diagnostics — Calibration + drift snapshot for the MSP research model.
 *
 * Scores come from two places:
 *   - `admin_research_cases.score` (saved research cases; that table has no outcome column, so cases only
 *     fill the bucket counts / average score, never the hit rate);
 *   - `ai_signal_log` (migrations/048), workspace 'operator-terminal' (same as /api/admin/signals/stats):
 *     `confidence` (0–100) is the score and `outcome` (pending / correct / wrong / neutral / expired) the label.
 *
 * Only outcomes measured by the fixed labeller (outcome_measured_at >= LABELLER_FIX_AT) count as labelled.
 * Verdicts written by the old labelling method are reported separately (`oldMethodLabelled`), not mixed in.
 *
 * It used to read `signal_outcomes` / `signals_outcomes` with `score` / `created_at` columns that don't exist,
 * so the outcome side was always empty.
 *
 * BOUNDARY: read-only model telemetry. No re-training, no parameter mutation. This is a diagnostics window only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/db";
import { wrapTruth } from "@/lib/admin";
import { LABELLER_FIX_AT } from "@/app/api/admin/signals/stats/route";
import { computeCalibration, type OutcomeRow } from "@/lib/admin/modelDiagnostics";

export const runtime = "nodejs";

const SIGNAL_WORKSPACE = "operator-terminal";

async function loadCases(): Promise<OutcomeRow[]> {
  try {
    const rows = await q<OutcomeRow>(
      "SELECT score, NULL::text AS outcome FROM admin_research_cases ORDER BY created_at DESC LIMIT 1000",
    );
    return rows ?? [];
  } catch {
    return [];
  }
}

interface SignalLoad {
  rows: OutcomeRow[];
  oldMethodLabelled: number;
  error: string | null;
}

async function loadSignalOutcomes(): Promise<SignalLoad> {
  try {
    const [rows, old] = await Promise.all([
      // Verdicts from before the labeller fix are nulled so they don't count as labelled.
      q<OutcomeRow>(
        `SELECT confidence AS score,
                CASE WHEN outcome IN ('correct', 'wrong', 'neutral', 'expired') AND (outcome_measured_at IS NULL OR outcome_measured_at < $2::timestamptz)
                     THEN NULL ELSE outcome END AS outcome
           FROM ai_signal_log
          WHERE workspace_id = $1 AND confidence IS NOT NULL
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

  const cases = await loadCases();
  const signals = await loadSignalOutcomes();
  const merged = [...cases, ...signals.rows];
  const { buckets, totalLabelled, overallHitRate, drift } = computeCalibration(merged);
  const totalCases = merged.length;

  let note: string | null = null;
  if (totalCases === 0) {
    note = "No research cases or ai_signal_log signals recorded yet — save research cases from the Symbol Research terminal or let the shared scan log signals to populate this view.";
  } else if (totalLabelled === 0) {
    note = `No outcomes labelled by the fixed labeller yet (since ${LABELLER_FIX_AT}). Hit rates stay empty until signals are measured` +
      (signals.oldMethodLabelled > 0 ? `; ${signals.oldMethodLabelled} old-method verdict(s) are excluded.` : ".");
  } else if (signals.oldMethodLabelled > 0) {
    note = `${signals.oldMethodLabelled} verdict(s) from the old labelling method (before ${LABELLER_FIX_AT}) are excluded from hit rates.`;
  }

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    totalCases,
    totalLabelled,
    overallHitRate,
    buckets,
    drift,
    sources: {
      researchCases: cases.length,
      aiSignalLog: signals.rows.length,
      aiSignalLogError: signals.error,
      labelledSince: LABELLER_FIX_AT,
      oldMethodLabelled: signals.oldMethodLabelled,
    },
    note,
    truth: wrapTruth({}, { source: 'admin:postgres', freshness: 'real-time' }),
  });
}
