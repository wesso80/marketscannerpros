import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import {
  WorkflowFeedbackResponseV1Schema,
  parseWorkflowFeedbackRequestV1WithLegacy,
  buildPersistedEventFromFeedback,
} from '@/lib/operator/feedback.v1';

export async function POST(req: NextRequest) {
  const fallbackCorrelationId = `corr_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;

  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = parseWorkflowFeedbackRequestV1WithLegacy(await req.json());

    const symbol = String(parsed.symbol || '').trim().toUpperCase();
    const decisionPacketId = String(parsed.decisionPacketId || '').trim();
    const workflowId = String(parsed.workflowId || `wf_feedback_${Date.now()}`).trim();
    const notes = String(parsed.notes || '').trim();
    const confidence = Number.isFinite(parsed.confidence) ? Number(parsed.confidence) : null;
    const nowIso = new Date().toISOString();
    const built = buildPersistedEventFromFeedback(parsed, nowIso);

    const eventData = {
      event_id: `evt_feedback_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      event_type: 'label.explicit.created',
      event_version: 1,
      occurred_at: new Date().toISOString(),
      actor: {
        actor_type: 'user',
        user_id: session.cid || null,
        anonymous_id: null,
        session_id: null,
      },
      context: {
        tenant_id: 'msp',
        app: {
          name: 'MarketScannerPros',
          env: 'prod',
        },
        page: {
          route: '/operator',
          module: 'operator_dashboard',
        },
      },
      entity: {
        entity_type: 'candidate',
        entity_id: decisionPacketId || `dp_feedback_${Date.now()}`,
        symbol: symbol || undefined,
        asset_class: 'mixed',
      },
      correlation: {
        workflow_id: workflowId,
        parent_event_id: null,
      },
      payload: {
        ...built.event_data.payload,
        symbol: symbol || undefined,
        confidence,
        notes: notes || null,
      },
    };

    await q(
      `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
      [
        session.workspaceId,
        'label.explicit.created',
        JSON.stringify(eventData),
        JSON.stringify({ route: '/operator', module: 'operator_dashboard' }),
      ]
    );

    const responseBody = WorkflowFeedbackResponseV1Schema.parse({
      ok: true,
      correlationId: parsed.correlationId ?? fallbackCorrelationId,
      persistedEventId: String(eventData.event_id),
      message: 'Feedback persisted',
    });

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error('Workflow feedback POST error:', error);
    const responseBody = WorkflowFeedbackResponseV1Schema.parse({
      ok: false,
      correlationId: fallbackCorrelationId,
      message: error instanceof Error ? error.message : 'Failed to save feedback',
    });
    return NextResponse.json(responseBody, { status: 400 });
  }
}
