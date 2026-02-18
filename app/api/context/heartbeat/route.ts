import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

type HeartbeatPayload = {
  sessionId?: string;
  page?: string;
  route?: string;
  symbols?: string[];
  timeframes?: string[];
  viewState?: Record<string, unknown>;
  attention?: {
    primarySymbol?: string;
    dwellMs?: number;
    scrollDepth?: number;
  };
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

function sanitizeSymbolList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim().toUpperCase().slice(0, 20))
    .filter(Boolean)
    .slice(0, 12);
}

function sanitizeTfList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim().toLowerCase().slice(0, 16))
    .filter(Boolean)
    .slice(0, 10);
}

function toFinite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as HeartbeatPayload;
    const sessionId = String(body?.sessionId || '').trim().slice(0, 80) || null;
    const route = String(body?.route || '').trim().slice(0, 200) || null;
    const page = String(body?.page || '').trim().slice(0, 60) || null;
    const symbols = sanitizeSymbolList(body?.symbols);
    const timeframes = sanitizeTfList(body?.timeframes);
    const primarySymbol = String(body?.attention?.primarySymbol || symbols[0] || '').trim().toUpperCase().slice(0, 20) || null;
    const dwellMs = Math.max(0, Math.min(30 * 60_000, toFinite(body?.attention?.dwellMs) || 0));
    const scrollDepthRaw = toFinite(body?.attention?.scrollDepth);
    const scrollDepth = scrollDepthRaw == null ? null : Math.max(0, Math.min(1, scrollDepthRaw));

    const stateRows = await q<{ context_state: Record<string, unknown> | null }>(
      `SELECT context_state
       FROM operator_state
       WHERE workspace_id = $1
       LIMIT 1`,
      [session.workspaceId]
    );

    const currentContext = toContextObject(stateRows[0]?.context_state);
    const previousHeartbeatAt = currentContext?.heartbeat?.lastAt
      ? Date.parse(String(currentContext.heartbeat.lastAt))
      : Number.NaN;
    const nowMs = Date.now();
    const shouldEmitEvent = !Number.isFinite(previousHeartbeatAt) || nowMs - previousHeartbeatAt >= 15_000;

    const nextContext = {
      ...currentContext,
      heartbeat: {
        ...(toContextObject(currentContext?.heartbeat)),
        lastAt: new Date(nowMs).toISOString(),
        sessionId,
        page,
        route,
        symbols,
        timeframes,
        attention: {
          primarySymbol,
          dwellMs,
          scrollDepth,
        },
        viewState: body?.viewState && typeof body.viewState === 'object' ? body.viewState : {},
      },
    };

    await q(
      `INSERT INTO operator_state (workspace_id, current_focus, active_candidates, context_state, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
       ON CONFLICT (workspace_id)
       DO UPDATE SET
         current_focus = COALESCE(EXCLUDED.current_focus, operator_state.current_focus),
         active_candidates = EXCLUDED.active_candidates,
         context_state = EXCLUDED.context_state,
         updated_at = NOW()`,
      [
        session.workspaceId,
        primarySymbol,
        JSON.stringify(symbols),
        JSON.stringify(nextContext),
      ]
    );

    if (shouldEmitEvent) {
      const eventData = {
        event_id: `evt_ctx_heartbeat_${nowMs}_${Math.random().toString(36).slice(2, 8)}`,
        event_type: 'context.heartbeat',
        event_version: 1,
        occurred_at: new Date(nowMs).toISOString(),
        actor: {
          actor_type: 'user',
          user_id: session.cid || null,
          anonymous_id: null,
          session_id: sessionId,
        },
        context: {
          tenant_id: 'msp',
          app: { name: 'MarketScannerPros', env: 'prod' },
          page: { route: route || '/unknown', module: page || 'unknown' },
          device: {},
          geo: {},
        },
        entity: {
          entity_type: 'attention_context',
          entity_id: `ctx_${nowMs}`,
          symbol: primarySymbol || undefined,
          asset_class: 'mixed',
        },
        correlation: {
          workflow_id: sessionId ? `wf_session_${sessionId}` : `wf_context_${nowMs}`,
          parent_event_id: null,
        },
        payload: {
          source: 'context_heartbeat',
          sessionId,
          page,
          route,
          symbols,
          timeframes,
          attention: {
            primarySymbol,
            dwellMs,
            scrollDepth,
          },
          viewState: body?.viewState && typeof body.viewState === 'object' ? body.viewState : {},
        },
      };

      await q(
        `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context, session_id)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)`,
        [
          session.workspaceId,
          'context.heartbeat',
          JSON.stringify(eventData),
          JSON.stringify({ route: route || '/unknown', module: page || 'unknown' }),
          sessionId,
        ]
      );
    }

    return NextResponse.json({
      success: true,
      emitted: shouldEmitEvent,
      currentFocus: primarySymbol,
      symbols,
      page,
      route,
    });
  } catch (error) {
    console.error('[context/heartbeat] POST error:', error);
    return NextResponse.json({ error: 'Failed to persist context heartbeat' }, { status: 500 });
  }
}