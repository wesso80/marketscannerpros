import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { canEditLevel } from '@/lib/alerts/consoleList';
import { isSmartConsoleAlert } from '@/lib/alerts/consoleStatus';

const mocks = vi.hoisted(() => ({
  q: vi.fn(),
  push: vi.fn(),
  email: vi.fn(),
  crypto: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/auth', () => ({
  getSessionFromCookie: async () => ({ workspaceId: 'ws_1', cid: 'user_1', is_admin: true, tier: 'pro' }),
}));
vi.mock('@/lib/engine/jobQueue', () => ({ enqueueEngineJob: async () => ({ enqueued: false }) }));
vi.mock('@/lib/execution/runPipeline', () => ({ runExecutionPipeline: async () => ({ ok: false }) }));
vi.mock('@/lib/coingecko', () => ({ getPriceBySymbol: mocks.crypto }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));
vi.mock('@/lib/alerts/emailControls', () => ({ deliverUserAlertEmail: mocks.email }));
vi.mock('@/lib/pushServer', () => ({ sendPushToUser: mocks.push, PushTemplates: {} }));

import { POST as createFromFocus } from '@/app/api/alerts/create-from-focus/route';
import { POST as postWorkflowEvent } from '@/app/api/workflow/events/route';
import { GET as runCheck } from '@/app/api/alerts/check/route';
import { GET as runSmartCheck } from '@/app/api/alerts/smart-check/route';

type Query = { sql: string; params: unknown[] };
type StoredAlert = {
  id: string;
  is_active: boolean;
  is_smart_alert: boolean;
  workflowId: string;
  planId: string;
};

const state = {
  packets: [] as Array<Record<string, unknown>>,
  rows: [] as StoredAlert[],
  queries: [] as Query[],
};

function alertInserts() {
  return state.queries.filter((query) => /insert\s+into\s+alerts\b/i.test(query.sql));
}

function contextOf(params: unknown[]) {
  const raw = params.find((value) => typeof value === 'string' && value.includes('"source"'));
  return raw ? JSON.parse(String(raw)) as Record<string, unknown> : null;
}

function isPlanDedupe(sql: string) {
  return /from\s+alerts/i.test(sql)
    && /smart_alert_context->>'workflowId'/.test(sql)
    && /smart_alert_context->>'planId'/.test(sql);
}

beforeEach(() => {
  state.packets = [];
  state.rows = [];
  state.queries = [];
  mocks.push.mockReset();
  mocks.email.mockReset();
  mocks.crypto.mockReset();
  mocks.push.mockResolvedValue(undefined);
  mocks.email.mockResolvedValue({ action: 'skipped', reason: 'notify_email_false' });
  mocks.q.mockImplementation(async (sql: string, params: unknown[] = []) => {
    state.queries.push({ sql, params });
    if (/insert\s+into\s+alerts\b/i.test(sql)) {
      const context = contextOf(params);
      const flaggedSmart = /,\s*true,\s*\$\d+::jsonb,\s*60/.test(sql);
      state.rows.push({
        id: `new-${state.rows.length + 1}`,
        is_active: true,
        is_smart_alert: flaggedSmart,
        workflowId: String(context?.workflowId || ''),
        planId: String(context?.planId || ''),
      });
      return [{ id: state.rows[state.rows.length - 1].id }];
    }
    if (isPlanDedupe(sql)) {
      const workflowId = String(params[1] ?? '');
      const planId = String(params[2] ?? '');
      const requiresSmart = /is_smart_alert\s*=\s*true/i.test(sql);
      return state.rows.filter((row) =>
        row.is_active
        && row.workflowId === workflowId
        && row.planId === planId
        && (!requiresSmart || row.is_smart_alert)
      ).slice(0, 1);
    }
    if (/from\s+decision_packets/i.test(sql)) return state.packets;
    if (/alerts_last_hour/i.test(sql)) {
      const requiresSmart = /is_smart_alert\s*=\s*true/i.test(sql);
      const counted = state.rows.filter((row) => !requiresSmart || row.is_smart_alert).length;
      return [{ alerts_last_hour: counted, alerts_today: counted }];
    }
    return [];
  });
});

function focusRequest(body: Record<string, unknown>) {
  return createFromFocus(new NextRequest('https://example.test/api/alerts/create-from-focus', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

function planEvent(overrides: {
  eventId?: string;
  workflowId: string;
  planId: string;
  symbol?: string;
  direction?: string;
  side?: string;
  bias?: string;
  assetClass?: string;
}) {
  return {
    event_id: overrides.eventId || `evt_${overrides.planId}`,
    event_type: 'trade.plan.created',
    event_version: 1,
    occurred_at: '2026-10-05T14:30:00.000Z',
    actor: { actor_type: 'user', user_id: 'user_1', anonymous_id: null, session_id: null },
    context: {
      tenant_id: 'msp',
      app: { name: 'MarketScannerPros', env: 'test' },
      page: { route: '/tools/scanner', module: 'scanner' },
    },
    entity: {
      entity_type: 'trade_plan',
      entity_id: overrides.planId,
      symbol: overrides.symbol || 'AAPL',
      asset_class: overrides.assetClass || 'equity',
    },
    correlation: { workflow_id: overrides.workflowId, parent_event_id: null },
    payload: {
      plan_id: overrides.planId,
      symbol: overrides.symbol || 'AAPL',
      ...(overrides.direction ? { direction: overrides.direction } : {}),
      ...(overrides.side ? { side: overrides.side } : {}),
      ...(overrides.bias ? { setup: { bias: overrides.bias } } : {}),
      asset_class: overrides.assetClass || 'equity',
      decision_packet_id: 'dp_plan',
      entry: { zone: 100 },
      risk: { risk_score: 40 },
      timeframe: '1h',
    },
  };
}

function postPlan(event: ReturnType<typeof planEvent>) {
  return postWorkflowEvent(new NextRequest('https://example.test/api/workflow/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events: [event] }),
  }));
}

describe('Focus and MSP Auto Plan price alerts are basic alerts', () => {
  it('create-from-focus inserts is_smart_alert false with the same name, context and notify flags', async () => {
    state.packets = [{
      packet_id: 'dp_1',
      symbol: 'AAPL',
      status: 'planned',
      entry_zone: 180,
      asset_class: 'crypto',
      market: 'crypto',
    }];

    const response = await focusRequest({
      symbol: 'AAPL',
      decisionPacketId: 'dp_1',
      direction: 'bullish',
      level: 190,
      notes: 'watch the reclaim',
    });

    expect(response.status).toBe(200);
    const inserted = alertInserts();
    expect(inserted).toHaveLength(1);
    const { sql, params } = inserted[0];
    expect(sql).toContain('true, true, false, true');
    expect(sql).toMatch(/false,\s*30,\s*\$9::jsonb/);
    expect(sql).not.toMatch(/true,\s*30/);
    expect(params[1]).toBe('AAPL');
    expect(params[2]).toBe('crypto');
    expect(params[3]).toBe('price_above');
    expect(params[4]).toBe(190);
    expect(params[5]).toBe('Focus Alert • AAPL');
    expect(params[6]).toBe('watch the reclaim');
    expect(contextOf(params)).toMatchObject({
      source: 'focus.creator',
      decisionPacketId: 'dp_1',
      createdFrom: 'operator.focus',
    });
    expect(String(contextOf(params)?.workflowId)).toMatch(/^wf_focus_/);
  });

  it('uses the symbol helper when the packet has no asset class, and equity when the symbol is a stock', async () => {
    const btc = await focusRequest({ symbol: 'BTC', direction: 'bullish', level: 65000 });
    expect(btc.status).toBe(200);
    expect(alertInserts()[0].params[2]).toBe('crypto');

    state.queries = [];
    const aapl = await focusRequest({ symbol: 'AAPL', level: 190 });
    expect(aapl.status).toBe(200);
    expect(alertInserts()[0].params[2]).toBe('equity');
  });

  it('a bearish plan inserts price_below as a basic alert with the same name, context and notify flags', async () => {
    const response = await postPlan(planEvent({
      workflowId: 'wf_bear',
      planId: 'plan_bear',
      symbol: 'TSLA',
      direction: 'bearish',
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).autoAlertsCreated).toBe(1);

    const inserted = alertInserts();
    expect(inserted).toHaveLength(1);
    const { sql, params } = inserted[0];
    expect(sql).toContain('true, true, false, true');
    expect(sql).toMatch(/false,\s*\$9::jsonb,\s*60/);
    expect(params[2]).toBe('equity');
    expect(params[3]).toBe('price_below');
    expect(params[4]).toBe(100);
    expect(params[6]).toBe('MSP Auto Plan Alert • TSLA');
    expect(params[7]).toBe('Auto-generated from workflow plan plan_bear');
    expect(contextOf(params)).toMatchObject({
      source: 'workflow.auto',
      autoGenerated: true,
      workflowId: 'wf_bear',
      planId: 'plan_bear',
      decisionPacketId: 'dp_plan',
      eventType: 'trade.plan.created',
    });
    expect(state.rows[0].is_smart_alert).toBe(false);
  });

  it('long, short and an unknown side map to price_above, price_below and price_above', async () => {
    await postPlan(planEvent({ workflowId: 'wf_long', planId: 'plan_long', direction: 'long' }));
    await postPlan(planEvent({ workflowId: 'wf_short', planId: 'plan_short', side: 'SHORT' }));
    await postPlan(planEvent({ workflowId: 'wf_unknown', planId: 'plan_unknown' }));
    const types = alertInserts().map((query) => query.params[3]);
    expect(types).toEqual(['price_above', 'price_below', 'price_above']);
  });

  it('a second plan event does not insert again against a new false row or an old true row', async () => {
    const first = await postPlan(planEvent({ workflowId: 'wf_1', planId: 'plan_1', direction: 'bullish' }));
    expect((await first.json()).autoAlertsCreated).toBe(1);
    expect(alertInserts()).toHaveLength(1);
    expect(state.queries.some((query) => isPlanDedupe(query.sql) && /is_smart_alert\s*=\s*true/i.test(query.sql))).toBe(false);

    state.queries = [];
    const second = await postPlan(planEvent({
      eventId: 'evt_plan_1_again',
      workflowId: 'wf_1',
      planId: 'plan_1',
      direction: 'bullish',
    }));
    expect(second.status).toBe(200);
    expect((await second.json()).autoAlertsCreated).toBe(0);
    expect(alertInserts()).toHaveLength(0);

    state.queries = [];
    state.rows = [{
      id: 'legacy-true',
      is_active: true,
      is_smart_alert: true,
      workflowId: 'wf_old',
      planId: 'plan_old',
    }];
    const legacy = await postPlan(planEvent({
      workflowId: 'wf_old',
      planId: 'plan_old',
      direction: 'bearish',
    }));
    expect(legacy.status).toBe(200);
    expect((await legacy.json()).autoAlertsCreated).toBe(0);
    expect(alertInserts()).toHaveLength(0);
  });

  it('the hourly auto-alert cap still counts basic plan rows', async () => {
    state.rows = Array.from({ length: 4 }, (_, index) => ({
      id: `cap-${index}`,
      is_active: true,
      is_smart_alert: false,
      workflowId: `wf_cap_${index}`,
      planId: `plan_cap_${index}`,
    }));
    const response = await postPlan(planEvent({ workflowId: 'wf_new', planId: 'plan_new', direction: 'long' }));
    expect(response.status).toBe(200);
    expect((await response.json()).autoAlertsCreated).toBe(0);
    expect(alertInserts()).toHaveLength(0);
  });
});

describe('a former smart price row is checked as a basic alert', () => {
  const NOW = Date.parse('2026-09-24T15:00:00Z');
  const alert = {
    id: 'former-smart',
    workspace_id: 'ws_1',
    symbol: 'AAPL',
    asset_type: 'equity',
    condition_type: 'price_above',
    condition_value: '100',
    is_recurring: true,
    notify_email: false,
    notify_push: true,
    name: 'Focus Alert • AAPL',
    last_price: null as number | string | null,
    triggered_at: null as string | null,
    cooldown_minutes: 30,
  };

  function quote(price: string) {
    return new Response(JSON.stringify({
      'Global Quote': {
        '05. price': price,
        '08. previous close': '100',
        '07. latest trading day': '2026-09-24',
      },
    }));
  }

  beforeEach(() => {
    alert.last_price = null;
    alert.triggered_at = null;
    process.env.ALPHA_VANTAGE_API_KEY = 'test';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mocks.q.mockImplementation(async (sql: string, params: unknown[] = []) => {
      state.queries.push({ sql, params });
      if (/from\s+alerts/i.test(sql) && /is_smart_alert = false/i.test(sql)) return [alert];
      if (/set last_price/i.test(sql)) {
        alert.last_price = params[0] as number;
        return [];
      }
      return [];
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function run() {
    const headers: Record<string, string> = {};
    if (process.env.CRON_SECRET) headers['x-cron-secret'] = process.env.CRON_SECRET;
    return runCheck(new NextRequest('https://example.test/api/alerts/check', { headers }));
  }

  it('arms on the first check and sends one push and no email on a later cross', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => quote('150')));
    const armed = await (await run()).json();
    expect(armed.checked).toBe(1);
    expect(armed.triggered).toBe(0);
    expect(alert.last_price).toBe(150);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
    expect(state.queries.some((query) => /is_smart_alert = false OR is_smart_alert IS NULL/i.test(query.sql))).toBe(true);

    vi.stubGlobal('fetch', vi.fn(async () => quote('90')));
    const retreated = await (await run()).json();
    expect(retreated.triggered).toBe(0);
    expect(alert.last_price).toBe(90);
    expect(mocks.push).not.toHaveBeenCalled();

    vi.stubGlobal('fetch', vi.fn(async () => quote('110')));
    const crossed = await (await run()).json();
    expect(crossed.triggeredIds).toEqual(['former-smart']);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.email).not.toHaveBeenCalled();
  });
});

describe('smart-check does not evaluate price alerts', () => {
  beforeEach(() => {
    mocks.q.mockImplementation(async (sql: string) => {
      if (/from\s+alerts/i.test(sql) && /is_smart_alert = true/i.test(sql) && /condition_type/i.test(sql)) {
        return [
          {
            id: 'price-above',
            workspace_id: 'ws_1',
            symbol: 'AAPL',
            condition_type: 'price_above',
            condition_value: 100,
            is_recurring: true,
            notify_email: false,
            notify_push: true,
            name: 'Focus Alert • AAPL',
            cooldown_minutes: 30,
            triggered_at: null,
          },
          {
            id: 'price-below',
            workspace_id: 'ws_1',
            symbol: 'TSLA',
            condition_type: 'price_below',
            condition_value: 200,
            is_recurring: true,
            notify_email: false,
            notify_push: true,
            name: 'MSP Auto Plan Alert • TSLA',
            cooldown_minutes: 60,
            triggered_at: null,
          },
        ];
      }
      return [];
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns triggered false for price_above and price_below and does not throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ coins: [] }), { status: 200 })));
    const headers: Record<string, string> = {};
    if (process.env.CRON_SECRET) headers['x-cron-secret'] = process.env.CRON_SECRET;
    const response = await runSmartCheck(new NextRequest('https://example.test/api/alerts/smart-check', { headers }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).not.toBe(false);
    expect(body.checked).toBe(2);
    expect(body.triggered).toBe(0);
    expect(body.triggeredIds ?? []).toEqual([]);
    expect(body.errors).toBeUndefined();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
  });
});

describe('flipped price rows still render as editable basic alerts', () => {
  const row = {
    id: 'former-smart',
    symbol: 'AAPL',
    name: 'Focus Alert • AAPL',
    condition_type: 'price_above',
    condition_value: 190,
    is_active: true,
    is_recurring: true,
    trigger_count: 0,
    is_smart_alert: false,
  };

  it('moves to the basic group and can edit the level', () => {
    expect(isSmartConsoleAlert(row)).toBe(false);
    expect(canEditLevel(row)).toBe(true);
    expect(canEditLevel({ ...row, condition_type: 'price_below' })).toBe(true);
    expect(canEditLevel({ ...row, is_smart_alert: true })).toBe(false);
  });
});
