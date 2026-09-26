import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { q } from '@/lib/db';
import { logger, generateTraceId } from '@/lib/logger';
import { wrapTruth } from '@/lib/admin';
import { LABELLER_FIX_AT, saneMoveSql, signedMoveSql } from '@/lib/admin/signalStats';

export const runtime = 'nodejs';

/**
 * Playbook scorecard: playbook × direction × regime over the last 90 days.
 *
 * - Shared-scan signals only (workspace 'operator-terminal'), LONG/SHORT calls only.
 * - Only outcomes measured by the fixed labeller (outcome_measured_at >= LABELLER_FIX_AT) count; older labels were
 *   made with stale prices / default-long and would pollute the win rate.
 * - win_rate = wins ÷ (wins + losses); neutral (moved less than the threshold) is reported separately.
 * - avg_move_pct = average 24h move in the call's direction (a correct SHORT counts positive). This replaces the old
 *   avg_r, which averaged a fake ±1 "expectancy" written by the old labeller.
 * - Grouped by direction instead of symbol so each cell can reach a useful sample.
 */
const SIGNED = signedMoveSql('pct_move_24h');
const SANE = saneMoveSql('pct_move_24h');

export async function GET(req: NextRequest) {
  const traceId = generateTraceId();
  const log = logger.withTrace(traceId);

  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const minSample = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get('minSample') || 10) || 10));

  try {
    const rows = await q(
      `SELECT
         COALESCE(decision_trace->>'playbook', decision_trace->>'playbookId', decision_trace->>'setup', 'UNKNOWN') AS playbook,
         UPPER(trade_bias) AS direction,
         COALESCE(regime, 'UNKNOWN') AS regime,
         COUNT(*)::int AS sample,
         COUNT(*) FILTER (WHERE outcome = 'correct')::int AS wins,
         COUNT(*) FILTER (WHERE outcome = 'wrong')::int AS losses,
         COUNT(*) FILTER (WHERE outcome = 'neutral')::int AS neutral,
         ROUND((100.0 * COUNT(*) FILTER (WHERE outcome = 'correct')
           / NULLIF(COUNT(*) FILTER (WHERE outcome IN ('correct', 'wrong')), 0))::numeric, 1) AS win_rate,
         ROUND(AVG(${SIGNED}) FILTER (WHERE ${SANE})::numeric, 3) AS avg_move_pct,
         ROUND(AVG(elite_score)::numeric, 1) AS avg_elite_score,
         MAX(signal_at) AS last_signal_at
       FROM ai_signal_log
       WHERE workspace_id = $2
         AND signal_at >= NOW() - INTERVAL '90 days'
         AND UPPER(trade_bias) IN ('LONG', 'SHORT')
         AND outcome IN ('correct', 'wrong', 'neutral')
         AND outcome_measured_at >= $3::timestamptz
         AND pct_move_24h IS NOT NULL
       GROUP BY 1, 2, 3
       HAVING COUNT(*) >= $1
       ORDER BY win_rate DESC NULLS LAST, sample DESC
       LIMIT 150`,
      [minSample, 'operator-terminal', LABELLER_FIX_AT],
    );

    return NextResponse.json({
      ok: true, traceId, minSample, rows,
      since: LABELLER_FIX_AT,
      note: 'Shared-scan LONG/SHORT signals, fixed-labeller outcomes only (last 90 days). Win rate = wins ÷ (wins + losses); '
        + 'avg move is the 24h move in the call\'s direction.',
      truth: wrapTruth({ rows }, { source: 'admin:postgres', freshness: 'real-time' }),
    });
  } catch (err) {
    log.error('admin signal scorecard failed', err);
    return NextResponse.json({ ok: false, traceId, error: 'Failed to load signal scorecard' }, { status: 500 });
  }
}
