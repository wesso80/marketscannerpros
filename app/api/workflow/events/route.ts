import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import type { MSPEvent, WorkflowEventType } from '@/lib/workflow/types';

const ALLOWED_EVENT_TYPES = new Set<WorkflowEventType>([
  'operator.session.started',
  'operator.context.updated',
  'signal.created',
  'signal.updated',
  'candidate.created',
  'candidate.promoted',
  'candidate.evaluated',
  'trade.plan.created',
  'trade.plan.updated',
  'trade.executed',
  'trade.updated',
  'trade.closed',
  'journal.draft.created',
  'journal.updated',
  'journal.completed',
  'coach.analysis.generated',
  'strategy.rule.suggested',
  'strategy.rule.applied',
  'label.explicit.created',
  'trade.story.generated',
]);

function normalizeEvent(raw: MSPEvent): MSPEvent {
  const nowIso = new Date().toISOString();

  return {
    ...raw,
    event_id: raw.event_id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    event_version: Number.isFinite(raw.event_version) ? raw.event_version : 1,
    occurred_at: raw.occurred_at || nowIso,
    actor: {
      actor_type: raw.actor?.actor_type || 'user',
      user_id: raw.actor?.user_id ?? null,
      anonymous_id: raw.actor?.anonymous_id ?? null,
      session_id: raw.actor?.session_id ?? null,
    },
    context: {
      tenant_id: raw.context?.tenant_id || 'msp',
      app: {
        name: raw.context?.app?.name || 'MarketScannerPros',
        env: raw.context?.app?.env || 'prod',
        build: raw.context?.app?.build,
      },
      page: raw.context?.page || {},
      device: raw.context?.device || {},
      geo: raw.context?.geo || {},
    },
    correlation: {
      workflow_id: raw.correlation?.workflow_id || `wf_${Date.now()}`,
      trace_id: raw.correlation?.trace_id,
      parent_event_id: raw.correlation?.parent_event_id ?? null,
    },
    payload: raw.payload || {},
  };
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const events = Array.isArray(body?.events) ? (body.events as MSPEvent[]) : [];

    if (!events.length) {
      return NextResponse.json({ error: 'No events provided' }, { status: 400 });
    }

    const normalized = events.slice(0, 100).map(normalizeEvent);

    for (const event of normalized) {
      if (!ALLOWED_EVENT_TYPES.has(event.event_type)) {
        return NextResponse.json({ error: `Unsupported event type: ${event.event_type}` }, { status: 400 });
      }
      if (!event.event_id || !event.correlation?.workflow_id) {
        return NextResponse.json({ error: 'Invalid envelope: missing event_id/workflow_id' }, { status: 400 });
      }
    }

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let index = 1;

    for (const event of normalized) {
      placeholders.push(`($${index}, $${index + 1}, $${index + 2}::jsonb, $${index + 3}::jsonb, $${index + 4})`);
      values.push(
        session.workspaceId,
        event.event_type,
        JSON.stringify(event),
        JSON.stringify(event.context?.page || {}),
        event.actor?.session_id || null
      );
      index += 5;
    }

    await q(
      `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context, session_id)
       VALUES ${placeholders.join(', ')}`,
      values
    );

    return NextResponse.json({ success: true, eventsLogged: normalized.length });
  } catch (error) {
    console.error('Workflow events API error:', error);
    return NextResponse.json({ error: 'Failed to ingest workflow events' }, { status: 500 });
  }
}
