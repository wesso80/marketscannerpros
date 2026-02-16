import type { MSPEvent, WorkflowEventType } from './types';

const APP_NAME = 'MarketScannerPros';

type EventInput<TPayload> = {
  eventType: WorkflowEventType;
  payload: TPayload;
  workflowId: string;
  route?: string;
  module?: string;
  entity?: MSPEvent['entity'];
  parentEventId?: string | null;
  sessionId?: string | null;
  actorType?: 'user' | 'system';
};

function appEnv(): 'dev' | 'staging' | 'prod' {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (host.includes('localhost') || host.includes('127.0.0.1')) return 'dev';
  if (host.includes('staging')) return 'staging';
  return 'prod';
}

export function createWorkflowEvent<TPayload>(input: EventInput<TPayload>): MSPEvent<TPayload> {
  const eventId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `evt_${crypto.randomUUID()}`
    : `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const traceId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `trc_${crypto.randomUUID()}`
    : `trc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  return {
    event_id: eventId,
    event_type: input.eventType,
    event_version: 1,
    occurred_at: new Date().toISOString(),
    actor: {
      actor_type: input.actorType || 'user',
      user_id: null,
      anonymous_id: null,
      session_id: input.sessionId || null,
    },
    context: {
      tenant_id: 'msp',
      app: {
        name: APP_NAME,
        env: appEnv(),
      },
      page: {
        route: input.route || (typeof window !== 'undefined' ? window.location.pathname : undefined),
        module: input.module,
      },
      device: {
        platform: 'web',
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      },
      geo: {
        tz: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined,
      },
    },
    entity: input.entity,
    correlation: {
      workflow_id: input.workflowId,
      trace_id: traceId,
      parent_event_id: input.parentEventId || null,
    },
    payload: input.payload,
  };
}

export async function emitWorkflowEvents(events: MSPEvent[]) {
  if (!events.length) return;

  try {
    await fetch('/api/workflow/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
  } catch {
  }
}
