import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';
import { q } from '@/lib/db';
import { logger, generateTraceId } from '@/lib/logger';

export const runtime = 'nodejs';

async function authorized(req: NextRequest) {
  const adminAuth = (await requireAdmin(req)).ok;
  if (adminAuth) return true;
  const session = await getSessionFromCookie();
  return Boolean(session && isOperator(session.cid, session.workspaceId));
}

export async function GET(req: NextRequest) {
  const traceId = generateTraceId();
  const log = logger.withTrace(traceId);

  if (!(await authorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const minSample = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get('minSample') || 3)));

  try {
    const rows = await q(
      `SELECT
         COALESCE(decision_trace->>'playbook', decision_trace->>'playbookId', decision_trace->>'setup', 'UNKNOWN') AS playbook,
         symbol,
         regime,
         COUNT(*)::int AS sample,
         COUNT(*) FILTER (WHERE outcome IN ('correct', 'worked', 'target_hit'))::int AS wins,
         COUNT(*) FILTER (WHERE outcome IN ('wrong', 'failed', 'stop_hit'))::int AS losses,
         ROUND((100.0 * COUNT(*) FILTER (WHERE outcome IN ('correct', 'worked', 'target_hit')) / NULLIF(COUNT(*), 0))::numeric, 1) AS win_rate,
         ROUND(AVG(expectancy_r)::numeric, 3) AS avg_r,
         ROUND(AVG(elite_score)::numeric, 1) AS avg_elite_score,
         MAX(signal_at) AS last_signal_at
       FROM ai_signal_log
       WHERE signal_at >= NOW() - INTERVAL '90 days'
       GROUP BY 1, symbol, regime
       HAVING COUNT(*) >= $1
       ORDER BY win_rate DESC NULLS LAST, sample DESC
       LIMIT 150`,
      [minSample],
    );

    return NextResponse.json({ ok: true, traceId, minSample, rows });
  } catch (err) {
    log.error('admin signal scorecard failed', err);
    return NextResponse.json({ ok: false, traceId, error: 'Failed to load signal scorecard' }, { status: 500 });
  }
}
