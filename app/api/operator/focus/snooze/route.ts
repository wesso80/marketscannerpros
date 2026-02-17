import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

function toContextObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, any>;
    } catch {
      return {};
    }
  }
  return {};
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

    const body = (await req.json()) as { symbol?: string; ttlMinutes?: number; reason?: string };
    const symbol = sanitizeSymbol(body.symbol);
    if (!symbol) return NextResponse.json({ error: 'symbol is required' }, { status: 400 });

    const ttlMinutes = Math.max(5, Math.min(24 * 60, Number(body.ttlMinutes || 20)));
    const snoozeUntilTs = new Date(Date.now() + ttlMinutes * 60_000).toISOString();

    const rows = await q<{ context_state: Record<string, unknown> | null }>(
      `SELECT context_state FROM operator_state WHERE workspace_id = $1 LIMIT 1`,
      [session.workspaceId]
    );

    const contextState = toContextObject(rows[0]?.context_state);
    const currentMemory = toContextObject(contextState.neural_attention_state || {});
    const memory = {
      currentPrimary: symbol,
      lockedUntilTs: typeof currentMemory.lockedUntilTs === 'string' ? currentMemory.lockedUntilTs : null,
      pinnedSymbol: typeof currentMemory.pinnedSymbol === 'string' ? currentMemory.pinnedSymbol : null,
      pinnedUntilTs: typeof currentMemory.pinnedUntilTs === 'string' ? currentMemory.pinnedUntilTs : null,
      cooldownUntil: toContextObject(currentMemory.cooldownUntil || {}),
      ignoredCounts7d: toContextObject(currentMemory.ignoredCounts7d || {}),
      snoozeUntilTs,
    };

    const nextContext = {
      ...contextState,
      neural_attention_state: memory,
      neural_attention_controls: {
        updatedAt: new Date().toISOString(),
        action: 'snooze',
        symbol,
        ttlMinutes,
      },
    };

    await q(
      `INSERT INTO operator_state (workspace_id, context_state, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (workspace_id)
       DO UPDATE SET context_state = $2::jsonb, updated_at = NOW()`,
      [session.workspaceId, JSON.stringify(nextContext)]
    );

    const eventType = 'focus.snoozed';
    const eventData = {
      event_id: `evt_focus_snoozed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      event_type: eventType,
      event_version: 1,
      occurred_at: new Date().toISOString(),
      actor: { actor_type: 'user', user_id: session.cid || null, anonymous_id: null, session_id: null },
      context: { tenant_id: 'msp', app: { name: 'MarketScannerPros', env: 'prod' }, page: { route: '/operator', module: 'neural_attention' } },
      entity: { entity_type: 'focus', entity_id: `focus_${Date.now()}`, symbol, asset_class: 'mixed' },
      correlation: { workflow_id: `wf_attention_${Date.now()}`, parent_event_id: null },
      payload: { source: 'neural_attention', symbol, snoozeUntilTs, reason: body.reason || null },
    };

    await q(
      `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
      [session.workspaceId, eventType, JSON.stringify(eventData), JSON.stringify({ route: '/operator', module: 'neural_attention' })]
    );

    return NextResponse.json({ ok: true, symbol, snoozeUntilTs });
  } catch (error) {
    console.error('Operator focus snooze POST error:', error);
    return NextResponse.json({ error: 'Failed to snooze focus' }, { status: 500 });
  }
}
