import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

type CreateFromFocusBody = {
  focusId?: string;
  decisionPacketId?: string;
  symbol?: string;
  direction?: 'bullish' | 'bearish' | 'neutral';
  level?: number;
  expiry?: string;
  notes?: string;
};

function normalizeSymbol(value: unknown): string {
  return String(value || '').trim().toUpperCase().slice(0, 24);
}

function asFinite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function eventId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as CreateFromFocusBody;
    const requestedPacketId = String(body.decisionPacketId || body.focusId || '').trim();
    let symbol = normalizeSymbol(body.symbol);
    let decisionPacketId = requestedPacketId || null;

    if (decisionPacketId) {
      const rows = await q<{ packet_id: string; symbol: string; status: string }>(
        `SELECT packet_id, symbol, status
         FROM decision_packets
         WHERE workspace_id = $1
           AND (
             packet_id = $2
             OR packet_id = (
               SELECT packet_id FROM decision_packet_aliases
               WHERE workspace_id = $1 AND alias_id = $2
               LIMIT 1
             )
           )
         ORDER BY updated_at DESC
         LIMIT 1`,
        [session.workspaceId, decisionPacketId]
      );
      if (rows[0]) {
        decisionPacketId = rows[0].packet_id;
        if (!symbol) symbol = normalizeSymbol(rows[0].symbol);
      }
    }

    if (!symbol) {
      const latestPacket = await q<{ packet_id: string; symbol: string }>(
        `SELECT packet_id, symbol
         FROM decision_packets
         WHERE workspace_id = $1
         ORDER BY updated_at DESC
         LIMIT 1`,
        [session.workspaceId]
      );
      if (latestPacket[0]) {
        symbol = normalizeSymbol(latestPacket[0].symbol);
        decisionPacketId = decisionPacketId || latestPacket[0].packet_id;
      }
    }

    if (!symbol) {
      return NextResponse.json({ error: 'symbol or decisionPacketId is required' }, { status: 400 });
    }

    const packetRows = decisionPacketId
      ? await q<{ entry_zone: number | null; status: string; packet_id: string }>(
          `SELECT entry_zone, status, packet_id
           FROM decision_packets
           WHERE workspace_id = $1 AND packet_id = $2
           LIMIT 1`,
          [session.workspaceId, decisionPacketId]
        )
      : [];

    const conditionValue = asFinite(body.level) ?? asFinite(packetRows[0]?.entry_zone) ?? 0;
    const conditionType =
      body.direction === 'bearish' ? 'price_below'
      : body.direction === 'neutral' ? 'price_above'
      : 'price_above';
    const alertName = `Focus Alert • ${symbol}`;

    const smartAlertContext = {
      source: 'focus.creator',
      workflowId: `wf_focus_${Date.now()}`,
      decisionPacketId,
      createdFrom: 'operator.focus',
    };

    const inserted = await q<{ id: string }>(
      `INSERT INTO alerts (
        workspace_id, symbol, asset_type, condition_type, condition_value, condition_timeframe,
        name, notes, is_active, is_recurring, notify_email, notify_push, expires_at,
        is_smart_alert, cooldown_minutes, smart_alert_context
      ) VALUES (
        $1, $2, 'equity', $3, $4, NULL,
        $5, $6, true, true, false, true, $7,
        true, 30, $8::jsonb
      )
      RETURNING id`,
      [
        session.workspaceId,
        symbol,
        conditionType,
        conditionValue,
        alertName,
        body.notes || null,
        body.expiry ? new Date(body.expiry) : null,
        JSON.stringify(smartAlertContext),
      ]
    );

    const alertId = inserted[0]?.id;
    if (!alertId) {
      return NextResponse.json({ error: 'Failed to create alert' }, { status: 500 });
    }

    if (decisionPacketId) {
      await q(
        `UPDATE decision_packets
         SET
           status = CASE
             WHEN status IN ('executed', 'closed') THEN status
             ELSE 'alerted'
           END,
           updated_at = NOW()
         WHERE workspace_id = $1 AND packet_id = $2`,
        [session.workspaceId, decisionPacketId]
      );
    }

    const actionEventId = eventId('evt_attention_action_taken');
    const alertEventId = eventId('evt_alert_created');

    const actionEvent = {
      event_id: actionEventId,
      event_type: 'attention.action.taken',
      event_version: 1,
      occurred_at: new Date().toISOString(),
      actor: { actor_type: 'user', user_id: session.cid || null, anonymous_id: null, session_id: null },
      context: { tenant_id: 'msp', app: { name: 'MarketScannerPros', env: 'prod' }, page: { route: '/operator', module: 'focus_creator' } },
      entity: { entity_type: 'operator_context', entity_id: `focus_action_${Date.now()}`, symbol, asset_class: 'mixed' },
      correlation: { workflow_id: smartAlertContext.workflowId, parent_event_id: null },
      payload: {
        source: 'focus.creator',
        action_key: 'create_alert',
        symbol,
        focus_id: body.focusId || null,
        decision_packet_id: decisionPacketId,
        alert_id: alertId,
      },
    };

    const createdEvent = {
      event_id: alertEventId,
      event_type: 'alert.created',
      event_version: 1,
      occurred_at: new Date().toISOString(),
      actor: { actor_type: 'system', user_id: session.cid || null, anonymous_id: null, session_id: null },
      context: { tenant_id: 'msp', app: { name: 'MarketScannerPros', env: 'prod' }, page: { route: '/operator', module: 'focus_creator' } },
      entity: { entity_type: 'candidate', entity_id: alertId, symbol, asset_class: 'mixed' },
      correlation: { workflow_id: smartAlertContext.workflowId, parent_event_id: actionEventId },
      payload: {
        source: 'focus.creator',
        alert_id: alertId,
        focus_id: body.focusId || null,
        decision_packet_id: decisionPacketId,
        condition_type: conditionType,
        condition_value: conditionValue,
        direction: body.direction || null,
      },
    };

    await q(
      `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
       VALUES ($1, $2, $3::jsonb, $4::jsonb), ($1, $5, $6::jsonb, $7::jsonb)`,
      [
        session.workspaceId,
        'attention.action.taken',
        JSON.stringify(actionEvent),
        JSON.stringify({ route: '/operator', module: 'focus_creator' }),
        'alert.created',
        JSON.stringify(createdEvent),
        JSON.stringify({ route: '/operator', module: 'focus_creator' }),
      ]
    );

    return NextResponse.json({
      success: true,
      alertId,
      decisionPacketId,
      eventIds: [actionEventId, alertEventId],
    });
  } catch (error) {
    console.error('Create from focus alert error:', error);
    return NextResponse.json({ error: 'Failed to create alert from focus' }, { status: 500 });
  }
}
