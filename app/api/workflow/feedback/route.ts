import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

type FeedbackTag = 'validated' | 'ignored' | 'wrong_context' | 'timing_issue';

function isFeedbackTag(value: unknown): value is FeedbackTag {
  return value === 'validated' || value === 'ignored' || value === 'wrong_context' || value === 'timing_issue';
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as {
      feedbackTag?: FeedbackTag;
      decisionPacketId?: string;
      symbol?: string;
      confidence?: number;
      workflowId?: string;
      notes?: string;
    };

    if (!isFeedbackTag(body.feedbackTag)) {
      return NextResponse.json({ error: 'Invalid feedbackTag' }, { status: 400 });
    }

    const symbol = String(body.symbol || '').trim().toUpperCase();
    const decisionPacketId = String(body.decisionPacketId || '').trim();
    const workflowId = String(body.workflowId || `wf_feedback_${Date.now()}`).trim();
    const notes = String(body.notes || '').trim();
    const confidence = Number.isFinite(body.confidence) ? Number(body.confidence) : null;

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
        source: 'consciousness_loop',
        feedback_tag: body.feedbackTag,
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Workflow feedback POST error:', error);
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 });
  }
}
