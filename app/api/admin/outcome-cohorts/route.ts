import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { q } from '@/lib/db';
import { EVIDENCE_SQL, parseCohort } from '@/lib/admin/verifiedOutcomes';
import { analyzeOutcomeCohort, type AnalysisRow, type AnalysisScope } from '@/lib/admin/outcomeCohortAnalysis';
import { LABELLER_FIX_AT } from '@/lib/admin/signalStats';
import { adminErrorText } from '@/lib/admin/errorResponse';

export const runtime = 'nodejs';
const MAX_COHORT_RECORDS = 20000;
const headers = { 'Cache-Control': 'private, no-store' };
const groups: Record<AnalysisScope, string> = {
  signals: "UPPER(trade_bias) || ' / ' || COALESCE(regime, 'UNKNOWN')",
  scorecard: "COALESCE(decision_trace->>'playbook', decision_trace->>'playbookId', decision_trace->>'setup', 'UNKNOWN') || ' / ' || UPPER(trade_bias) || ' / ' || COALESCE(regime, 'UNKNOWN')",
  backtest: "(CASE WHEN workspace_id LIKE 'admin-call:%' THEN UPPER(substr(workspace_id, 12)) ELSE UPPER(COALESCE(decision_trace->>'playbook', decision_trace->>'setup', 'UNKNOWN')) END) || ' / ' || UPPER(COALESCE(asset_type, 'UNKNOWN'))",
};
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) return NextResponse.json({ok: false, error: 'Unauthorized'}, {status: 403, headers});
  const scope = req.nextUrl.searchParams.get('scope') ?? 'signals';
  const days = Number(req.nextUrl.searchParams.get('days') ?? 90);
  if (!Object.hasOwn(groups, scope) || ![7, 30, 90].includes(days)) {
    return NextResponse.json({ok: false, error: 'Choose a supported scope and 7, 30 or 90 days.'}, {status: 400, headers});
  }
  const cohort = parseCohort(req.nextUrl.searchParams.get('cohort'));
  try {
    // One database snapshot supplies both counts and aggregates; never silently truncate the cohort.
    const rows = await q<AnalysisRow>(
      `SELECT ${groups[scope as AnalysisScope]} AS group_name, signal_at, ${EVIDENCE_SQL}
       FROM ai_signal_log
       WHERE (workspace_id = 'operator-terminal' OR ($1 = 'backtest' AND workspace_id LIKE 'admin-call:%'))
         AND signal_at >= NOW() - make_interval(days => $2::int)
         AND UPPER(trade_bias) IN ('LONG', 'SHORT')
         AND outcome IN ('correct', 'wrong', 'neutral')
         AND outcome_measured_at >= $3::timestamptz
         AND pct_move_24h IS NOT NULL
       ORDER BY signal_at DESC, id DESC LIMIT $4`,
      [scope, days, LABELLER_FIX_AT, MAX_COHORT_RECORDS + 1],
    );
    if (rows.length > MAX_COHORT_RECORDS) {
      return NextResponse.json({ok: false, error: 'This window exceeds 20,000 eligible measurements. Choose a shorter window; no partial statistics are shown.'}, {status: 422, headers});
    }
    return NextResponse.json({ok: true, scope, days, ...analyzeOutcomeCohort(rows, cohort),
      definition: {
        population: 'Recorded LONG/SHORT 24h correct/wrong/neutral outcomes with a move and measurement timestamp at or after the legacy cutoff. That cutoff does not establish provenance.',
        workspace: scope === 'backtest' ? 'operator-terminal + admin-call:*' : 'operator-terminal',
        rate: 'Correct / (correct + wrong); neutral excluded from hit-rate denominator. Signed move includes neutral and excludes missing/non-finite or absolute moves over 100%.',
        limits: 'No group minimum or group truncation. Groups are alphabetical, not ranked. Pending, expired and other horizons are outside this panel. Repeated calls may overlap and are not independent.',
        comparison: 'Fixed-horizon price moves, not executed P&L or target-before-stop outcomes. No fees or slippage deducted.',
      },
    }, {headers});
  } catch (error) {
    adminErrorText(error, '/api/admin/outcome-cohorts');
    return NextResponse.json({ok: false, error: 'Measurement cohorts are unavailable.'}, {status: 503, headers});
  }
}
