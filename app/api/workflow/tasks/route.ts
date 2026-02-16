import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

type TaskDecision = 'accepted' | 'rejected';

function buildEventId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'pending';
    const requestedLimit = Number(url.searchParams.get('limit') || 5);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(20, requestedLimit)) : 5;

    const rows = await q(
      `WITH suggested AS (
         SELECT
           event_data,
           created_at,
           event_data->>'event_id' AS suggested_event_id,
           event_data->'payload'->>'task_id' AS task_id,
           event_data->'payload'->>'action' AS action,
           event_data->'payload'->>'detail' AS detail,
           event_data->'payload'->>'priority' AS priority,
           event_data->'correlation'->>'workflow_id' AS workflow_id,
           event_data->'entity'->>'symbol' AS symbol,
           ROW_NUMBER() OVER (
             PARTITION BY event_data->'payload'->>'task_id'
             ORDER BY created_at DESC
           ) AS rn
         FROM ai_events
         WHERE workspace_id = $1
           AND event_type = 'strategy.rule.suggested'
       ),
       applied AS (
         SELECT DISTINCT event_data->'payload'->>'task_id' AS task_id
         FROM ai_events
         WHERE workspace_id = $1
           AND event_type = 'strategy.rule.applied'
       )
       SELECT
         s.task_id,
         s.suggested_event_id,
         s.workflow_id,
         s.symbol,
         s.action,
         s.detail,
         s.priority,
         s.created_at,
         (a.task_id IS NOT NULL) AS is_applied
       FROM suggested s
       LEFT JOIN applied a ON a.task_id = s.task_id
       WHERE s.rn = 1
         AND s.task_id IS NOT NULL
         AND s.task_id <> ''
         AND (
           $2 = 'all'
           OR ($2 = 'pending' AND a.task_id IS NULL)
           OR ($2 = 'resolved' AND a.task_id IS NOT NULL)
         )
       ORDER BY s.created_at DESC
       LIMIT $3`,
      [session.workspaceId, status, limit]
    );

    const tasks = rows.map((row: any) => ({
      taskId: String(row.task_id || ''),
      suggestedEventId: String(row.suggested_event_id || ''),
      workflowId: String(row.workflow_id || ''),
      symbol: row.symbol ? String(row.symbol) : null,
      action: row.action ? String(row.action) : 'action',
      detail: row.detail ? String(row.detail) : '',
      priority: row.priority ? String(row.priority) : 'medium',
      suggestedAt: row.created_at,
      resolved: Boolean(row.is_applied),
    }));

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Workflow tasks GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch workflow tasks' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const taskId = String(body?.taskId || '').trim();
    const decision = String(body?.decision || '').trim() as TaskDecision;

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }
    if (decision !== 'accepted' && decision !== 'rejected') {
      return NextResponse.json({ error: 'decision must be accepted or rejected' }, { status: 400 });
    }

    const existing = await q(
      `SELECT id
       FROM ai_events
       WHERE workspace_id = $1
         AND event_type = 'strategy.rule.applied'
         AND event_data->'payload'->>'task_id' = $2
       LIMIT 1`,
      [session.workspaceId, taskId]
    );

    if (existing.length > 0) {
      return NextResponse.json({ success: true, alreadyResolved: true });
    }

    const suggestedRows = await q(
      `SELECT event_data, created_at
       FROM ai_events
       WHERE workspace_id = $1
         AND event_type = 'strategy.rule.suggested'
         AND event_data->'payload'->>'task_id' = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [session.workspaceId, taskId]
    );

    if (suggestedRows.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const suggested = suggestedRows[0]?.event_data as Record<string, any>;
    const nowIso = new Date().toISOString();
    const action = String(suggested?.payload?.action || 'action');
    const detail = String(suggested?.payload?.detail || '');

    const appliedEvent = {
      event_id: buildEventId('evt'),
      event_type: 'strategy.rule.applied',
      event_version: 1,
      occurred_at: nowIso,
      actor: {
        actor_type: 'user',
        user_id: null,
        anonymous_id: null,
        session_id: null,
      },
      context: {
        tenant_id: suggested?.context?.tenant_id || 'msp',
        app: {
          name: suggested?.context?.app?.name || 'MarketScannerPros',
          env: suggested?.context?.app?.env || 'prod',
          build: suggested?.context?.app?.build,
        },
        page: {
          route: '/operator',
          module: 'coach_task_queue',
        },
        device: {},
        geo: {},
      },
      entity: {
        entity_type: 'coach',
        entity_id: taskId,
        symbol: suggested?.entity?.symbol,
        asset_class: suggested?.entity?.asset_class,
      },
      correlation: {
        workflow_id: suggested?.correlation?.workflow_id || buildEventId('wf'),
        parent_event_id: suggested?.event_id || null,
      },
      payload: {
        task_id: taskId,
        action,
        detail,
        decision,
        status: decision === 'accepted' ? 'applied' : 'rejected',
        decided_at: nowIso,
        source_suggested_event_id: suggested?.event_id || null,
      },
    };

    await q(
      `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context, session_id)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)`,
      [
        session.workspaceId,
        'strategy.rule.applied',
        JSON.stringify(appliedEvent),
        JSON.stringify(appliedEvent.context?.page || {}),
        null,
      ]
    );

    return NextResponse.json({ success: true, taskId, decision });
  } catch (error) {
    console.error('Workflow tasks POST error:', error);
    return NextResponse.json({ error: 'Failed to update workflow task' }, { status: 500 });
  }
}
