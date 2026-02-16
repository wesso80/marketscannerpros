import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [eventRows, autoAlertRows, autoDraftRows] = await Promise.all([
      q(
        `SELECT
           COUNT(*) FILTER (WHERE event_type = 'signal.created')::int AS signals,
           COUNT(*) FILTER (WHERE event_type = 'candidate.created')::int AS candidates,
           COUNT(*) FILTER (WHERE event_type = 'trade.plan.created')::int AS plans,
           COUNT(*) FILTER (WHERE event_type = 'trade.executed')::int AS executions,
           COUNT(*) FILTER (WHERE event_type = 'trade.closed')::int AS closed,
           COUNT(*) FILTER (WHERE event_type = 'coach.analysis.generated')::int AS coach_analyses,
           MAX(created_at) AS last_event_at
         FROM ai_events
         WHERE workspace_id = $1
           AND created_at >= CURRENT_DATE
           AND event_type IN ('signal.created', 'candidate.created', 'trade.plan.created', 'trade.executed', 'trade.closed', 'coach.analysis.generated')`,
        [session.workspaceId]
      ),
      q(
        `SELECT COUNT(*)::int AS count
         FROM alerts
         WHERE workspace_id = $1
           AND created_at >= CURRENT_DATE
           AND is_smart_alert = true
           AND smart_alert_context->>'source' = 'workflow.auto'`,
        [session.workspaceId]
      ),
      q(
        `SELECT COUNT(*)::int AS count
         FROM journal_entries
         WHERE workspace_id = $1
           AND created_at >= CURRENT_DATE
           AND COALESCE(tags, ARRAY[]::text[]) @> ARRAY['auto_plan_draft']::text[]`,
        [session.workspaceId]
      ),
    ]);

    const row = eventRows[0] || {};

    return NextResponse.json({
      today: {
        signals: Number(row.signals || 0),
        candidates: Number(row.candidates || 0),
        plans: Number(row.plans || 0),
        executions: Number(row.executions || 0),
        closed: Number(row.closed || 0),
        coachAnalyses: Number(row.coach_analyses || 0),
        autoAlerts: Number(autoAlertRows[0]?.count || 0),
        autoJournalDrafts: Number(autoDraftRows[0]?.count || 0),
        lastEventAt: row.last_event_at || null,
      },
    });
  } catch (error) {
    console.error('Workflow today API error:', error);
    return NextResponse.json({ error: 'Failed to fetch workflow summary' }, { status: 500 });
  }
}
