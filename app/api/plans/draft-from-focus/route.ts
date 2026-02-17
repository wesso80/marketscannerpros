import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

type DraftFromFocusBody = {
  focusId?: string;
  decisionPacketId?: string;
  symbol?: string;
  timeframe?: string;
  riskPct?: number;
  notes?: string;
  entryStyle?: string;
  invalidation?: number;
  targets?: number[];
};

function normalizeSymbol(value: unknown): string {
  return String(value || '').trim().toUpperCase().slice(0, 24);
}

function toFinite(value: unknown): number | null {
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

    const body = (await req.json()) as DraftFromFocusBody;
    const requestedPacketId = String(body.decisionPacketId || body.focusId || '').trim();
    let decisionPacketId = requestedPacketId || null;
    let symbol = normalizeSymbol(body.symbol);

    let packet: {
      packet_id: string;
      symbol: string;
      bias: string | null;
      risk_score: number | null;
      entry_zone: number | null;
      invalidation: number | null;
      targets: unknown;
    } | null = null;

    if (decisionPacketId) {
      const rows = await q<any>(
        `SELECT packet_id, symbol, bias, risk_score, entry_zone, invalidation, targets
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
        packet = rows[0];
        decisionPacketId = rows[0].packet_id;
      }
    }

    if (!packet && symbol) {
      const rows = await q<any>(
        `SELECT packet_id, symbol, bias, risk_score, entry_zone, invalidation, targets
         FROM decision_packets
         WHERE workspace_id = $1 AND symbol = $2
         ORDER BY updated_at DESC
         LIMIT 1`,
        [session.workspaceId, symbol]
      );
      if (rows[0]) {
        packet = rows[0];
        decisionPacketId = rows[0].packet_id;
      }
    }

    if (packet && !symbol) {
      symbol = normalizeSymbol(packet.symbol);
    }

    if (!symbol) {
      return NextResponse.json({ error: 'symbol or decisionPacketId is required' }, { status: 400 });
    }

    const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const setupTargets = Array.isArray(packet?.targets)
      ? (packet?.targets as unknown[]).filter((v) => Number.isFinite(Number(v))).map((v) => Number(v))
      : [];

    const draft = {
      plan_id: planId,
      symbol,
      timeframe: body.timeframe || '1h',
      setup: {
        thesis: `Focus-driven plan for ${symbol} aligned with active operator mode.`,
        bias: String(packet?.bias || 'neutral'),
        focus_id: body.focusId || null,
        decision_packet_id: decisionPacketId,
        signal_source: 'focus.creator',
        notes: body.notes || null,
      },
      entry: {
        style: body.entryStyle || 'breakout_retest',
        zone: toFinite(packet?.entry_zone) ?? null,
      },
      risk: {
        risk_pct: Number(toFinite(body.riskPct) ?? 1),
        invalidation: toFinite(body.invalidation) ?? toFinite(packet?.invalidation),
        targets: (body.targets && body.targets.length ? body.targets : setupTargets).slice(0, 4),
        risk_score: toFinite(packet?.risk_score),
      },
      checklist: [
        'Confirm regime alignment and volatility context',
        'Validate invalidation before order placement',
        'Set execution size by risk_pct and stop distance',
      ],
      journal_prompts: {
        did_well: '',
        did_wrong: '',
        one_rule_next: '',
      },
      status: 'draft',
      created_at: new Date().toISOString(),
    };

    await q(
      `INSERT INTO trade_plans (workspace_id, plan_id, decision_packet_id, symbol, status, draft_payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'draft', $5::jsonb, NOW(), NOW())`,
      [session.workspaceId, planId, decisionPacketId, symbol, JSON.stringify(draft)]
    );

    if (decisionPacketId) {
      await q(
        `UPDATE decision_packets
         SET
           status = CASE
             WHEN status IN ('alerted', 'executed', 'closed') THEN status
             ELSE 'planned'
           END,
           planned_event_id = COALESCE(planned_event_id, $3),
           updated_at = NOW()
         WHERE workspace_id = $1 AND packet_id = $2`,
        [session.workspaceId, decisionPacketId, `evt_plan_draft_${Date.now()}`]
      );
    }

    const actionEventId = eventId('evt_attention_action_taken');
    const draftEventId = eventId('evt_plan_draft_created');
    const workflowId = `wf_focus_${Date.now()}`;

    const actionEvent = {
      event_id: actionEventId,
      event_type: 'attention.action.taken',
      event_version: 1,
      occurred_at: new Date().toISOString(),
      actor: { actor_type: 'user', user_id: session.cid || null, anonymous_id: null, session_id: null },
      context: { tenant_id: 'msp', app: { name: 'MarketScannerPros', env: 'prod' }, page: { route: '/operator', module: 'focus_creator' } },
      entity: { entity_type: 'operator_context', entity_id: `focus_action_${Date.now()}`, symbol, asset_class: 'mixed' },
      correlation: { workflow_id: workflowId, parent_event_id: null },
      payload: {
        source: 'focus.creator',
        action_key: 'prepare_plan',
        symbol,
        focus_id: body.focusId || null,
        plan_id: planId,
        decision_packet_id: decisionPacketId,
      },
    };

    const draftEvent = {
      event_id: draftEventId,
      event_type: 'plan.draft.created',
      event_version: 1,
      occurred_at: new Date().toISOString(),
      actor: { actor_type: 'system', user_id: session.cid || null, anonymous_id: null, session_id: null },
      context: { tenant_id: 'msp', app: { name: 'MarketScannerPros', env: 'prod' }, page: { route: '/operator', module: 'focus_creator' } },
      entity: { entity_type: 'trade_plan', entity_id: planId, symbol, asset_class: 'mixed' },
      correlation: { workflow_id: workflowId, parent_event_id: actionEventId },
      payload: {
        source: 'focus.creator',
        focus_id: body.focusId || null,
        plan_id: planId,
        decision_packet_id: decisionPacketId,
        timeframe: body.timeframe || '1h',
        risk_pct: Number(toFinite(body.riskPct) ?? 1),
        trade_plan: draft,
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
        'plan.draft.created',
        JSON.stringify(draftEvent),
        JSON.stringify({ route: '/operator', module: 'focus_creator' }),
      ]
    );

    return NextResponse.json({
      success: true,
      planId,
      draft,
      decisionPacketId,
      eventIds: [actionEventId, draftEventId],
    });
  } catch (error) {
    console.error('Draft from focus plan error:', error);
    return NextResponse.json({ error: 'Failed to draft plan from focus' }, { status: 500 });
  }
}
