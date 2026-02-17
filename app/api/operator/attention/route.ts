import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

type AttentionActionRequest = {
  action: 'pin' | 'snooze' | 'take_action' | 'clear_pin';
  symbol?: string;
  ttlMinutes?: number;
  actionKey?: 'create_alert' | 'prepare_plan' | 'wait' | 'reduce_risk' | 'journal';
  workflowId?: string;
  decisionPacketId?: string;
  reason?: string;
};

function toContextObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function nowPlusMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function sanitizeSymbol(symbol?: string): string {
  return String(symbol || '').trim().toUpperCase().slice(0, 20);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as AttentionActionRequest;
    const action = body?.action;
    if (!action || !['pin', 'snooze', 'take_action', 'clear_pin'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const symbol = sanitizeSymbol(body.symbol);
    const ttlMinutes = Math.max(5, Math.min(24 * 60, Number(body.ttlMinutes || 30)));
    let cooldownApplied = false;
    let cooldownUntilUnix: number | null = null;

    const stateRows = await q<{ context_state: Record<string, unknown> | null }>(
      `SELECT context_state
       FROM operator_state
       WHERE workspace_id = $1
       LIMIT 1`,
      [session.workspaceId]
    );

    const currentContext = toContextObject(stateRows[0]?.context_state);
    const neuralState = {
      currentPrimary: typeof currentContext?.neural_attention_state?.currentPrimary === 'string'
        ? currentContext.neural_attention_state.currentPrimary
        : null,
      lockedUntilTs: typeof currentContext?.neural_attention_state?.lockedUntilTs === 'string'
        ? currentContext.neural_attention_state.lockedUntilTs
        : null,
      pinnedSymbol: typeof currentContext?.neural_attention_state?.pinnedSymbol === 'string'
        ? currentContext.neural_attention_state.pinnedSymbol
        : null,
      pinnedUntilTs: typeof currentContext?.neural_attention_state?.pinnedUntilTs === 'string'
        ? currentContext.neural_attention_state.pinnedUntilTs
        : null,
      cooldownUntil: toContextObject(currentContext?.neural_attention_state?.cooldownUntil || {}),
      ignoredCounts7d: toContextObject(currentContext?.neural_attention_state?.ignoredCounts7d || {}),
      snoozeUntilTs: typeof currentContext?.neural_attention_state?.snoozeUntilTs === 'string'
        ? currentContext.neural_attention_state.snoozeUntilTs
        : null,
    };

    if (action === 'pin') {
      if (!symbol) return NextResponse.json({ error: 'symbol is required for pin' }, { status: 400 });
      neuralState.pinnedSymbol = symbol;
      neuralState.pinnedUntilTs = nowPlusMinutes(ttlMinutes);
    }

    if (action === 'clear_pin') {
      neuralState.pinnedSymbol = null;
      neuralState.pinnedUntilTs = null;
    }

    if (action === 'snooze') {
      if (!symbol) return NextResponse.json({ error: 'symbol is required for snooze' }, { status: 400 });
      neuralState.snoozeUntilTs = nowPlusMinutes(ttlMinutes);
      neuralState.currentPrimary = symbol;
    }

    if (action === 'take_action' && symbol) {
      const nextIgnored = Math.max(0, Number((neuralState.ignoredCounts7d || {})[symbol] || 0));
      neuralState.ignoredCounts7d = {
        ...(neuralState.ignoredCounts7d || {}),
        [symbol]: body.actionKey === 'wait' ? nextIgnored + 1 : 0,
      };

      if (body.actionKey === 'wait') {
        const ignoredCount = Number(neuralState.ignoredCounts7d[symbol] || 0);
        if (ignoredCount >= 3) {
          const cooldownUntil = Math.floor((Date.now() + 45 * 60_000) / 1000);
          neuralState.cooldownUntil = {
            ...(neuralState.cooldownUntil || {}),
            [symbol]: cooldownUntil,
          };
          cooldownApplied = true;
          cooldownUntilUnix = cooldownUntil;
        }
      }
    }

    const updatedContext = {
      ...currentContext,
      neural_attention_state: neuralState,
      neural_attention_controls: {
        updatedAt: new Date().toISOString(),
        action,
        symbol: symbol || null,
        ttlMinutes,
      },
    };

    await q(
      `INSERT INTO operator_state (workspace_id, context_state, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (workspace_id)
       DO UPDATE SET context_state = $2::jsonb, updated_at = NOW()`,
      [session.workspaceId, JSON.stringify(updatedContext)]
    );

    const eventName =
      action === 'pin' ? 'focus.pinned'
      : action === 'clear_pin' ? 'focus.unpinned'
      : action === 'snooze' ? 'focus.snoozed'
      : 'attention.action.taken';

    const eventData = {
      event_id: `evt_attention_action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      event_type: eventName,
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
        app: { name: 'MarketScannerPros', env: 'prod' },
        page: { route: '/operator', module: 'neural_attention' },
      },
      entity: {
        entity_type: 'focus',
        entity_id: `nal_action_${Date.now()}`,
        symbol: symbol || undefined,
        asset_class: 'mixed',
      },
      correlation: {
        workflow_id: String(body.workflowId || `wf_attention_${Date.now()}`),
        parent_event_id: null,
      },
      payload: {
        source: 'neural_attention',
        eventName,
        symbol: symbol || null,
        action,
        action_key: body.actionKey || null,
        ttl_minutes: ttlMinutes,
        decision_packet_id: body.decisionPacketId || null,
        reason: body.reason || null,
      },
    };

    await q(
      `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
      [
        session.workspaceId,
        eventName,
        JSON.stringify(eventData),
        JSON.stringify({ route: '/operator', module: 'neural_attention' }),
      ]
    );

    if (cooldownApplied && symbol) {
      const cooldownEventType = 'attention.cooldown.applied';
      const cooldownEventData = {
        event_id: `evt_attention_cooldown_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        event_type: cooldownEventType,
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
          app: { name: 'MarketScannerPros', env: 'prod' },
          page: { route: '/operator', module: 'neural_attention' },
        },
        entity: {
          entity_type: 'focus',
          entity_id: `nal_cooldown_${Date.now()}`,
          symbol,
          asset_class: 'mixed',
        },
        correlation: {
          workflow_id: String(body.workflowId || `wf_attention_${Date.now()}`),
          parent_event_id: eventData.event_id,
        },
        payload: {
          source: 'neural_attention',
          symbol,
          reason: 'ignored_prompts_threshold_reached',
          ignored_count: Number(neuralState.ignoredCounts7d[symbol] || 0),
          cooldown_until_unix: cooldownUntilUnix,
          cooldown_minutes: 45,
        },
      };

      await q(
        `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
         VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
        [
          session.workspaceId,
          cooldownEventType,
          JSON.stringify(cooldownEventData),
          JSON.stringify({ route: '/operator', module: 'neural_attention' }),
        ]
      );
    }

    return NextResponse.json({
      ok: true,
      eventName,
      neuralAttentionState: neuralState,
    });
  } catch (error) {
    console.error('Operator attention POST error:', error);
    return NextResponse.json({ error: 'Failed to apply attention action' }, { status: 500 });
  }
}
