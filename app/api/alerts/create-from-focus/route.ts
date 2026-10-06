import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { detectAssetClass } from '@/lib/detectAssetClass';
import { enqueueEngineJob } from '@/lib/engine/jobQueue';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { ALERT_LIMITS, alertLimitReachedPayload } from '@/lib/alerts/planLimits';
import { countActiveAlertsForCap } from '@/lib/alerts/activeCount';

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

type FocusAssetType = 'crypto' | 'equity' | 'forex';

/** Packet asset class when it names a market the price checker can use; otherwise null. */
function assetTypeFromPacket(assetClass: unknown, market: unknown): FocusAssetType | null {
  const raw = String(assetClass || market || '').trim().toLowerCase();
  if (raw === 'crypto' || raw === 'coin' || raw === 'coins') return 'crypto';
  if (raw === 'forex' || raw === 'fx') return 'forex';
  if (raw === 'equity' || raw === 'stock' || raw === 'stocks') return 'equity';
  return null;
}

/** Packet market first (crypto when the packet says crypto), else the symbol helper. Default equity. */
function resolveFocusAssetType(
  packet: { asset_class?: string | null; market?: string | null } | undefined,
  symbol: string,
): FocusAssetType {
  return assetTypeFromPacket(packet?.asset_class, packet?.market) ?? detectAssetClass(symbol);
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
    let packetAsset: { asset_class?: string | null; market?: string | null } | undefined;

    if (decisionPacketId) {
      const rows = await q<{ packet_id: string; symbol: string; status: string; asset_class: string | null; market: string | null }>(
        `SELECT packet_id, symbol, status, asset_class, market
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
        packetAsset = { asset_class: rows[0].asset_class, market: rows[0].market };
      }
    }

    if (!symbol) {
      const latestPacket = await q<{ packet_id: string; symbol: string; asset_class: string | null; market: string | null }>(
        `SELECT packet_id, symbol, asset_class, market
         FROM decision_packets
         WHERE workspace_id = $1
         ORDER BY updated_at DESC
         LIMIT 1`,
        [session.workspaceId]
      );
      if (latestPacket[0]) {
        symbol = normalizeSymbol(latestPacket[0].symbol);
        decisionPacketId = decisionPacketId || latestPacket[0].packet_id;
        packetAsset = packetAsset || { asset_class: latestPacket[0].asset_class, market: latestPacket[0].market };
      }
    }

    if (!symbol) {
      return NextResponse.json({ error: 'symbol or decisionPacketId is required' }, { status: 400 });
    }

    const packetRows = decisionPacketId
      ? await q<{ entry_zone: number | null; status: string; packet_id: string; asset_class: string | null; market: string | null }>(
          `SELECT entry_zone, status, packet_id, asset_class, market
           FROM decision_packets
           WHERE workspace_id = $1 AND packet_id = $2
           LIMIT 1`,
          [session.workspaceId, decisionPacketId]
        )
      : [];
    if (packetRows[0]) {
      packetAsset = {
        asset_class: packetRows[0].asset_class ?? packetAsset?.asset_class ?? null,
        market: packetRows[0].market ?? packetAsset?.market ?? null,
      };
    }

    const conditionValue = asFinite(body.level) ?? asFinite(packetRows[0]?.entry_zone) ?? 0;
    const assetType = resolveFocusAssetType(packetAsset, symbol);
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

    const tier = hasPaidSessionAccess(session) ? 'pro' : 'free';
    const activeCount = await countActiveAlertsForCap(session.workspaceId);
    if (activeCount >= ALERT_LIMITS[tier]) {
      return NextResponse.json(alertLimitReachedPayload(tier, activeCount), { status: 403 });
    }

    const inserted = await q<{ id: string }>(
      `INSERT INTO alerts (
        workspace_id, symbol, asset_type, condition_type, condition_value, condition_timeframe,
        name, notes, is_active, is_recurring, notify_email, notify_push, expires_at,
        is_smart_alert, cooldown_minutes, smart_alert_context
      ) VALUES (
        $1, $2, $3, $4, $5, NULL,
        $6, $7, true, true, false, true, $8,
        false, 30, $9::jsonb
      )
      RETURNING id`,
      [
        session.workspaceId,
        symbol,
        assetType,
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

    try {
      const dedupeBase = `${session.workspaceId}:${decisionPacketId || symbol}:${alertId}`;
      await Promise.all([
        enqueueEngineJob({
          workspaceId: session.workspaceId,
          jobType: 'coach.recompute',
          dedupeKey: `coach:${dedupeBase}`,
          priority: 40,
          payload: {
            source: 'focus.creator',
            action: 'create_alert',
            symbol,
            alertId,
            decisionPacketId,
          },
        }),
        enqueueEngineJob({
          workspaceId: session.workspaceId,
          jobType: 'operator.recompute_presence',
          dedupeKey: `presence:${dedupeBase}`,
          priority: 20,
          payload: {
            source: 'focus.creator',
            action: 'create_alert',
            symbol,
            alertId,
            decisionPacketId,
          },
        }),
      ]);
    } catch (enqueueError) {
      console.warn('Engine enqueue warning (create-from-focus alert):', enqueueError);
    }

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
