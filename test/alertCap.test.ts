import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ACTIVE_ALERT_CAP_COUNT_SQL,
  countActiveAlertsForCap,
  countsTowardAlertCap,
} from '@/lib/alerts/activeCount';
import { ALERT_LIMITS, alertCapSkipReason, alertLimitReachedPayload } from '@/lib/alerts/planLimits';

const paid = vi.hoisted(() => ({ value: true }));
const mocks = vi.hoisted(() => ({ q: vi.fn() }));

vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/auth', () => ({
  getSessionFromCookie: async () => ({ workspaceId: 'ws-1', cid: 'user-1', tier: paid.value ? 'pro' : 'free' }),
}));
vi.mock('@/lib/proTraderAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/proTraderAccess')>();
  return { ...actual, hasPaidSessionAccess: () => paid.value };
});
vi.mock('@/lib/engine/jobQueue', () => ({ enqueueEngineJob: async () => ({ enqueued: false }) }));
vi.mock('@/lib/execution/runPipeline', () => ({ runExecutionPipeline: async () => ({ ok: false }) }));

import { DELETE as deleteAlerts, GET as listAlerts, POST as createAlert, PUT as updateAlert } from '@/app/api/alerts/route';
import { POST as createFromFocus } from '@/app/api/alerts/create-from-focus/route';
import { POST as postWorkflowEvent } from '@/app/api/workflow/events/route';
import { POST as executeAction } from '@/app/api/actions/execute/route';

type Row = {
  is_active: boolean;
  is_smart_alert?: boolean;
  condition_type: string;
  condition_value: number | null;
};

const state = {
  capCount: 0,
  rows: [] as Row[],
  queries: [] as string[],
};

function isCapCount(sql: string) {
  return /condition_type IN \('price_above', 'price_below'\)/i.test(sql)
    && /COALESCE\(condition_value, 0\) <= 0/i.test(sql);
}

beforeEach(() => {
  paid.value = true;
  state.capCount = 0;
  state.rows = [];
  state.queries = [];
  mocks.q.mockReset();
  mocks.q.mockImplementation(async (sql: string) => {
    state.queries.push(sql);
    if (isCapCount(sql)) return [{ count: state.capCount }];
    if (/alerts_last_hour/i.test(sql)) return [{ alerts_last_hour: 0, alerts_today: 0 }];
    if (/INSERT INTO alerts/i.test(sql)) return [{ id: 'new-alert' }];
    if (/INSERT INTO operator_action_executions/i.test(sql)) return [{ id: 1 }];
    if (/UPDATE alerts/i.test(sql)) return [{ id: 'kept', is_active: true }];
    if (/FROM alerts/i.test(sql) && /SELECT/i.test(sql)) return state.rows;
    return [];
  });
});

function postAlert(body: Record<string, unknown>) {
  return createAlert(new NextRequest('https://example.test/api/alerts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

function wroteAlert() {
  return state.queries.some((sql) => /INSERT INTO alerts/i.test(sql) || /DELETE FROM alerts/i.test(sql));
}

describe('countActiveAlertsForCap', () => {
  it('counts smart alerts that store 0, and excludes only price alerts with no level', () => {
    const scanner = {
      is_active: true,
      is_smart_alert: true,
      condition_type: 'scanner_buy_signal',
      condition_value: 0,
    };
    const priceWithLevel = {
      is_active: true,
      is_smart_alert: false,
      condition_type: 'price_above',
      condition_value: 190,
    };
    const priceAtZero = {
      is_active: true,
      is_smart_alert: true,
      condition_type: 'price_below',
      condition_value: 0,
    };
    const priceAtNull = {
      is_active: true,
      is_smart_alert: false,
      condition_type: 'price_above',
      condition_value: null,
    };
    const rows: Row[] = [
      scanner,
      { is_active: true, is_smart_alert: true, condition_type: 'strategy_buy_signal', condition_value: 0 },
      priceWithLevel,
      { is_active: true, is_smart_alert: true, condition_type: 'price_above', condition_value: 12 },
      priceAtZero,
      priceAtNull,
      { is_active: false, is_smart_alert: false, condition_type: 'price_above', condition_value: 50 },
    ];
    expect(countsTowardAlertCap(scanner)).toBe(true);
    expect(countsTowardAlertCap(priceWithLevel)).toBe(true);
    expect(countsTowardAlertCap(priceAtZero)).toBe(false);
    expect(countsTowardAlertCap(priceAtNull)).toBe(false);
    expect(countsTowardAlertCap({ ...priceAtZero, is_smart_alert: false, condition_value: '0' })).toBe(false);
    expect(rows.filter(countsTowardAlertCap)).toHaveLength(4);
    expect(ACTIVE_ALERT_CAP_COUNT_SQL).toMatch(/is_active IS TRUE/);
    expect(ACTIVE_ALERT_CAP_COUNT_SQL).toMatch(/condition_type IN \('price_above', 'price_below'\)/);
    expect(ACTIVE_ALERT_CAP_COUNT_SQL).toMatch(/COALESCE\(condition_value, 0\) <= 0/);
    expect(ACTIVE_ALERT_CAP_COUNT_SQL).not.toMatch(/is_smart_alert/);
    expect(ALERT_LIMITS).toEqual({ free: 3, pro: 100 });
  });

  it('reads the shared count for the workspace', async () => {
    state.capCount = 7;
    await expect(countActiveAlertsForCap('ws-1')).resolves.toBe(7);
    expect(state.queries.some(isCapCount)).toBe(true);
  });
});

describe('alert create paths at the Pro cap', () => {
  it('POST is blocked at 100 and allowed at 99', async () => {
    state.capCount = 100;
    const blocked = await postAlert({ symbol: 'AAPL', assetType: 'equity', conditionType: 'price_above', conditionValue: 200 });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual(alertLimitReachedPayload('pro', 100));
    expect(wroteAlert()).toBe(false);

    state.queries = [];
    state.capCount = 99;
    const allowed = await postAlert({ symbol: 'AAPL', assetType: 'equity', conditionType: 'price_above', conditionValue: 200 });
    expect(allowed.status).toBe(200);
    expect(wroteAlert()).toBe(true);
  });

  it('GET quota.used uses the shared count, not the raw active list', async () => {
    state.rows = [
      { is_active: true, is_smart_alert: true, condition_type: 'scanner_buy_signal', condition_value: 0 },
      { is_active: true, is_smart_alert: false, condition_type: 'price_above', condition_value: 180 },
    ];
    state.capCount = 1;
    const body = await (await listAlerts(new NextRequest('https://example.test/api/alerts'))).json();
    expect(body.alerts).toHaveLength(2);
    expect(body.quota.used).toBe(1);
    expect(body.quota.max).toBe(100);
  });

  it('create-from-focus returns the same 403 and does not insert', async () => {
    state.capCount = 100;
    const res = await createFromFocus(new NextRequest('https://example.test/api/alerts/create-from-focus', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: 'AAPL', direction: 'bullish', level: 190 }),
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(alertLimitReachedPayload('pro', 100));
    expect(wroteAlert()).toBe(false);
  });

  it('existing active alerts above the cap stay in place, including re-activation', async () => {
    state.capCount = 101;
    const blocked = await postAlert({ symbol: 'MSFT', assetType: 'equity', conditionType: 'price_below', conditionValue: 400 });
    expect(blocked.status).toBe(403);
    expect(state.queries.some((sql) => /DELETE FROM alerts/i.test(sql) || /INSERT INTO alerts/i.test(sql))).toBe(false);

    const reactivated = await updateAlert(new NextRequest('https://example.test/api/alerts', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'kept', isActive: true }),
    }));
    expect(reactivated.status).toBe(200);
    expect((await reactivated.json()).alert.is_active).toBe(true);
    expect(state.queries.some((sql) => /UPDATE alerts/i.test(sql) && /is_active/.test(sql))).toBe(true);

    const root = resolve(__dirname, '..');
    for (const file of [
      'app/api/alerts/check/route.ts',
      'app/api/alerts/smart-check/route.ts',
      'app/api/alerts/signal-check/route.ts',
      'app/api/alerts/strategy-check/route.ts',
    ]) {
      const src = readFileSync(resolve(root, file), 'utf8');
      expect(src, file).not.toContain('countActiveAlertsForCap');
      expect(src, file).not.toContain('ALERT_LIMITS');
    }
  });

  it('auto plan alerts and draft alerts skip at the cap without throwing', async () => {
    state.capCount = 100;
    const workflow = await postWorkflowEvent(new NextRequest('https://example.test/api/workflow/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        events: [{
          event_id: 'evt_cap',
          event_type: 'trade.plan.created',
          event_version: 1,
          occurred_at: '2026-10-06T00:00:00.000Z',
          actor: { actor_type: 'user', user_id: 'user-1', anonymous_id: null, session_id: null },
          context: { tenant_id: 'msp', app: { name: 'MarketScannerPros', env: 'test' }, page: { route: '/tools/scanner' } },
          entity: { entity_type: 'trade_plan', entity_id: 'plan_cap', symbol: 'AAPL', asset_class: 'equity' },
          correlation: { workflow_id: 'wf_cap', parent_event_id: null },
          payload: {
            plan_id: 'plan_cap',
            symbol: 'AAPL',
            direction: 'bullish',
            decision_packet_id: 'dp_cap',
            entry: { zone: 100 },
            risk: { risk_score: 40 },
          },
        }],
      }),
    }));
    expect(workflow.status).toBe(200);
    const workflowBody = await workflow.json();
    expect(workflowBody.autoAlertsCreated).toBe(0);
    expect(workflowBody.autoAlertsSkippedForCap).toBe(1);
    expect(workflowBody.autoAlertSkipReasons).toEqual([alertCapSkipReason('pro', 100)]);
    expect(wroteAlert()).toBe(false);

    state.queries = [];
    const draft = await executeAction(new NextRequest('https://example.test/api/actions/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actionType: 'alert.create',
        idempotencyKey: 'cap-draft-1',
        params: { symbol: 'AAPL', threshold: 100 },
      }),
    }));
    expect(draft.status).toBe(200);
    const draftBody = await draft.json();
    expect(draftBody.success).toBe(true);
    expect(draftBody.result.created).toBe(false);
    expect(draftBody.result.reason).toBe(alertCapSkipReason('pro', 100));
    expect(draftBody.result.reason).toBe("Alert not created: you're at your plan's limit of 100 active alerts.");
    expect(alertCapSkipReason('free', 3)).toBe("Alert not created: you're at your plan's limit of 3 active alerts.");
    expect(wroteAlert()).toBe(false);
    expect(draftBody.error).toBeUndefined();
  });

  it('bulk cleanup deletes price alerts with no level, including focus orphans', async () => {
    mocks.q.mockImplementation(async (sql: string) => {
      state.queries.push(sql);
      if (/DELETE FROM alerts/i.test(sql)) return [{ id: 'focus-orphan' }, { id: 'auto-orphan' }];
      return [];
    });

    const res = await deleteAlerts(new NextRequest('https://example.test/api/alerts?bulk=auto-orphaned', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect((await res.json()).deletedCount).toBe(2);

    const cleanup = state.queries.find((sql) => /DELETE FROM alerts/i.test(sql));
    expect(cleanup).toBeTruthy();
    expect(cleanup).toMatch(/condition_type IN \('price_above', 'price_below'\)/);
    expect(cleanup).toMatch(/COALESCE\(condition_value, 0\) <= 0/);
    expect(cleanup).not.toMatch(/is_smart_alert/);
    expect(cleanup).not.toMatch(/workflow\.auto/);
    expect(cleanup).not.toMatch(/focus\.creator/);
    expect(state.queries.some((sql) => /UPDATE alert_quotas/i.test(sql))).toBe(true);
  });
});
