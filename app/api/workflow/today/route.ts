import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [eventRows, autoAlertRows, autoDraftRows, latestCoachRows, coachJournalRows] = await Promise.all([
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
      q(
        `SELECT event_data->'payload' AS payload, created_at
         FROM ai_events
         WHERE workspace_id = $1
           AND event_type = 'coach.analysis.generated'
           AND created_at >= CURRENT_DATE
         ORDER BY created_at DESC
         LIMIT 1`,
        [session.workspaceId]
      ),
      q(
        `SELECT COUNT(*)::int AS count
         FROM journal_entries
         WHERE workspace_id = $1
           AND updated_at >= CURRENT_DATE
           AND notes ILIKE '%Coach Analysis ID:%'`,
        [session.workspaceId]
      ),
    ]);

    const row = eventRows[0] || {};
    const latestCoach = latestCoachRows[0] as { payload?: Record<string, any>; created_at?: string } | undefined;
    const coachPayload = latestCoach?.payload || null;
    const coachSummary = (coachPayload?.summary || {}) as Record<string, any>;
    const recommendations = Array.isArray(coachPayload?.recommendations)
      ? (coachPayload.recommendations as Array<Record<string, any>>)
      : [];
    const topRecommendation = recommendations[0] || null;

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
        coachJournalEnrichments: Number(coachJournalRows[0]?.count || 0),
        lastCoachInsight: coachPayload
          ? {
              analysisId: coachPayload.analysis_id || null,
              createdAt: latestCoach?.created_at || null,
              winRate: Number(coachSummary.win_rate ?? 0),
              avgWin: Number(coachSummary.avg_win ?? 0),
              avgLoss: Number(coachSummary.avg_loss ?? 0),
              expectancy: Number(coachSummary.expectancy ?? 0),
              recommendation: topRecommendation?.detail || topRecommendation?.action || null,
            }
          : null,
        lastEventAt: row.last_event_at || null,
      },
    });
  } catch (error) {
    console.error('Workflow today API error:', error);
    return NextResponse.json({ error: 'Failed to fetch workflow summary' }, { status: 500 });
  }
}
