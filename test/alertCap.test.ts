import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ACTIVE_ALERT_CAP_COUNT_SQL,
  countActiveAlertsForCap,
  countsTowardAlertCap,
} from '@/lib/alerts/activeCount';
import { ACTIVE_WORKFLOW_AUTO_ORPHAN_SQL, PRICE_ALERT_WITHOUT_LEVEL_SQL, isActiveWorkflowAutoOrphan } from '@/lib/alerts/priceOrphan';
import { ALERT_LIMITS, alertCapSkipReason, alertLimitReachedPayload } from '@/lib/alerts/planLimits';
import { focusAlertCreateFeedback, skippedAlertDraftReason } from '@/lib/alerts/capFeedback';

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

/** Independent reading of the cap SQL: active, except price alerts with no level. */
function sqlCapWouldCount(row: {
  is_active: boolean;
  condition_type: string;
  condition_value: number | string | null;
}): boolean {
  if (row.is_active !== true) return false;
  const price = row.condition_type === 'price_above' || row.condition_type === 'price_below';
  const raw = row.condition_value;
  const parsed = raw == null || raw === '' ? 0 : Number(raw);
  const missingLevel = !Number.isFinite(parsed) || parsed <= 0;
  return !(price && missingLevel);
}

function putAlert(body: Record<string, unknown>) {
  return updateAlert(new NextRequest('https://example.test/api/alerts', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
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

  it('keeps the SQL count and countsTowardAlertCap on the same orphan rule', () => {
    expect(ACTIVE_ALERT_CAP_COUNT_SQL).toContain(PRICE_ALERT_WITHOUT_LEVEL_SQL.trim());
    expect(ACTIVE_ALERT_CAP_COUNT_SQL).toMatch(/is_active IS TRUE/);
    expect(ACTIVE_ALERT_CAP_COUNT_SQL).toMatch(/AND NOT \(/);
    expect(ACTIVE_ALERT_CAP_COUNT_SQL).not.toMatch(/is_smart_alert/);

    const samples: Row[] = [
      { is_active: true, condition_type: 'scanner_buy_signal', condition_value: 0 },
      { is_active: true, condition_type: 'strategy_buy_signal', condition_value: 0 },
      { is_active: true, condition_type: 'price_above', condition_value: 12 },
      { is_active: true, condition_type: 'price_below', condition_value: 0 },
      { is_active: true, condition_type: 'price_above', condition_value: null },
      { is_active: true, condition_type: 'price_above', condition_value: '0' as unknown as number },
      { is_active: false, condition_type: 'price_above', condition_value: 50 },
    ];
    for (const row of samples) {
      expect(countsTowardAlertCap(row), JSON.stringify(row)).toBe(sqlCapWouldCount(row));
    }
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

  it('create-from-focus blocks a level that counts, and allows a level-0 row at the cap', async () => {
    state.capCount = 100;
    const blocked = await createFromFocus(new NextRequest('https://example.test/api/alerts/create-from-focus', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: 'AAPL', direction: 'bullish', level: 190 }),
    }));
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual(alertLimitReachedPayload('pro', 100));
    expect(wroteAlert()).toBe(false);

    state.queries = [];
    const empty = await createFromFocus(new NextRequest('https://example.test/api/alerts/create-from-focus', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: 'AAPL', direction: 'bullish', level: 0 }),
    }));
    expect(empty.status).toBe(200);
    expect(wroteAlert()).toBe(true);
  });

  it('blocks re-activation at the cap and leaves pause, edit, and already-active rows alone', async () => {
    state.capCount = 100;
    const blocked = await postAlert({ symbol: 'MSFT', assetType: 'equity', conditionType: 'price_below', conditionValue: 400 });
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).message).toBe(
      `You have ${ALERT_LIMITS.pro} active alerts, the most Pro allows. Pause or delete one to add a new one.`,
    );
    expect(alertLimitReachedPayload('free', 3).message).toBe(
      'Your free plan allows 3 active alerts. Upgrade to create more.',
    );

    state.rows = [{ is_active: false, condition_type: 'price_above', condition_value: 180 }];
    state.queries = [];
    const reactivated = await putAlert({ id: 'paused', isActive: true });
    expect(reactivated.status).toBe(403);
    expect(await reactivated.json()).toEqual(alertLimitReachedPayload('pro', 100));
    expect(state.queries.some((sql) => /UPDATE alerts/i.test(sql))).toBe(false);

    state.queries = [];
    const paused = await putAlert({ id: 'live', isActive: false });
    expect(paused.status).toBe(200);
    expect(state.queries.some((sql) => /UPDATE alerts/i.test(sql) && /is_active/.test(sql))).toBe(true);

    state.queries = [];
    const edited = await putAlert({ id: 'live', name: 'Renamed' });
    expect(edited.status).toBe(200);
    expect(state.queries.some((sql) => /UPDATE alerts/i.test(sql))).toBe(true);

    state.rows = [{ is_active: true, condition_type: 'price_above', condition_value: 180 }];
    state.queries = [];
    const alreadyActive = await putAlert({ id: 'live', isActive: true });
    expect(alreadyActive.status).toBe(200);
    expect(state.queries.some((sql) => /UPDATE alerts/i.test(sql))).toBe(true);

    state.rows = [{ is_active: false, condition_type: 'price_above', condition_value: 0 }];
    state.queries = [];
    const orphan = await putAlert({ id: 'orphan', isActive: true });
    expect(orphan.status).toBe(200);

    state.rows = [{ is_active: true, condition_type: 'price_above', condition_value: 0 }];
    state.queries = [];
    const giveLevel = await putAlert({ id: 'empty', conditionValue: 25 });
    expect(giveLevel.status).toBe(403);
    expect(await giveLevel.json()).toEqual(alertLimitReachedPayload('pro', 100));
    expect(state.queries.some((sql) => /UPDATE alerts/i.test(sql))).toBe(false);

    state.rows = [{ is_active: false, condition_type: 'price_below', condition_value: 0 }];
    state.queries = [];
    const pausedWithLevel = await putAlert({ id: 'paused-empty', isActive: true, conditionValue: 40 });
    expect(pausedWithLevel.status).toBe(403);
    expect(state.queries.some((sql) => /UPDATE alerts/i.test(sql))).toBe(false);

    state.capCount = 99;
    state.rows = [{ is_active: true, condition_type: 'price_above', condition_value: 0 }];
    state.queries = [];
    const underCap = await putAlert({ id: 'empty', conditionValue: 25 });
    expect(underCap.status).toBe(200);

    paid.value = false;
    state.capCount = 3;
    state.rows = [{ is_active: true, condition_type: 'price_above', condition_value: 0 }];
    const freeLevel = await putAlert({ id: 'empty', conditionValue: 9 });
    expect(freeLevel.status).toBe(403);
    expect(await freeLevel.json()).toEqual(alertLimitReachedPayload('free', 3));

    paid.value = false;
    state.capCount = 3;
    state.rows = [{ is_active: false, condition_type: 'price_below', condition_value: 40 }];
    const freeBlocked = await putAlert({ id: 'paused', isActive: true });
    expect(freeBlocked.status).toBe(403);
    expect(await freeBlocked.json()).toEqual(alertLimitReachedPayload('free', 3));

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

  it('auto plan alerts skip at the cap without throwing', async () => {
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

    expect(alertCapSkipReason('free', 3)).toBe("Alert not created: you're at your plan's limit of 3 active alerts.");
    expect(focusAlertCreateFeedback(false, alertLimitReachedPayload('pro', 100), 'AAPL')).toEqual({
      message: 'You have 100 active alerts, the most Pro allows. Pause or delete one to add a new one.',
      proceed: false,
    });
    expect(skippedAlertDraftReason({ kind: 'alert_draft', created: false, reason: alertCapSkipReason('pro', 100) })).toBe(alertCapSkipReason('pro', 100));
  });

  it('an inactive draft is created at the cap because it does not count', async () => {
    state.capCount = 100;
    const seen: unknown[][] = [];
    mocks.q.mockImplementation(async (sql: string, params: unknown[] = []) => {
      state.queries.push(sql);
      seen.push(params);
      if (isCapCount(sql)) return [{ count: state.capCount }];
      if (/alerts_last_hour/i.test(sql)) return [{ alerts_last_hour: 0, alerts_today: 0 }];
      if (/INSERT INTO operator_action_executions/i.test(sql)) return [{ id: 1 }];
      if (/INSERT INTO alerts/i.test(sql)) return [{ id: 'draft-1' }];
      return [];
    });
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
    expect(draftBody.result.created).toBe(true);
    expect(draftBody.result.reason).toBeNull();
    const insert = state.queries.findIndex((sql) => /INSERT INTO alerts/i.test(sql));
    expect(insert).toBeGreaterThanOrEqual(0);
    expect(seen[insert][8]).toBe(false);
  });

  it('stores a draft created at the cap, and a repeat of that key does not insert again', async () => {
    const executions = new Map<string, { status: string; result?: unknown }>();
    state.capCount = 100;
    const body = {
      actionType: 'alert.create',
      idempotencyKey: 'cap-draft-retry',
      params: { symbol: 'AAPL', threshold: 100 },
    };
    let alertInserts = 0;
    mocks.q.mockImplementation(async (sql: string, params: unknown[] = []) => {
      state.queries.push(sql);
      if (isCapCount(sql)) return [{ count: state.capCount }];
      if (/alerts_last_hour/i.test(sql)) return [{ alerts_last_hour: 0, alerts_today: 0 }];
      if (/INSERT INTO operator_action_executions/i.test(sql)) {
        const key = String(params[1]);
        if (executions.has(key)) return [];
        executions.set(key, { status: 'processing' });
        return [{ id: 1 }];
      }
      if (/DELETE FROM operator_action_executions/i.test(sql)) {
        executions.delete(String(params[1]));
        return [];
      }
      if (/UPDATE operator_action_executions/i.test(sql) && /completed/i.test(sql)) {
        executions.set(String(params[1]), { status: 'completed', result: params[3] });
        return [];
      }
      if (/SELECT status, result/i.test(sql)) {
        const row = executions.get(String(params[1]));
        return row ? [row] : [];
      }
      if (/INSERT INTO alerts/i.test(sql)) {
        alertInserts += 1;
        return [{ id: 'new-alert' }];
      }
      return [];
    });

    const first = await executeAction(new NextRequest('https://example.test/api/actions/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    expect(first.status).toBe(200);
    expect((await first.json()).result.created).toBe(true);
    expect(executions.get('cap-draft-retry')?.status).toBe('completed');
    expect(alertInserts).toBe(1);

    const second = await executeAction(new NextRequest('https://example.test/api/actions/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    expect(second.status).toBe(200);
    expect((await second.json()).replay).toBe(true);
    expect(alertInserts).toBe(1);
    expect(readFileSync(resolve(__dirname, '../app/api/actions/execute/route.ts'), 'utf8')).toContain('DELETE FROM operator_action_executions');
  });

  it('bulk cleanup switches off only active smart workflow.auto rows with value 0', async () => {
    expect(isActiveWorkflowAutoOrphan({
      is_active: true,
      is_smart_alert: true,
      condition_value: 0,
      smart_alert_context: { source: 'workflow.auto' },
    })).toBe(true);
    expect(isActiveWorkflowAutoOrphan({
      is_active: false,
      is_smart_alert: true,
      condition_value: 0,
      smart_alert_context: { source: 'workflow.auto' },
    })).toBe(false);
    expect(isActiveWorkflowAutoOrphan({
      is_active: true,
      is_smart_alert: false,
      condition_value: 0,
      smart_alert_context: { source: 'focus.creator' },
    })).toBe(false);
    expect(isActiveWorkflowAutoOrphan({
      is_active: true,
      is_smart_alert: true,
      condition_value: 12,
      smart_alert_context: { source: 'workflow.auto' },
    })).toBe(false);

    mocks.q.mockImplementation(async (sql: string) => {
      state.queries.push(sql);
      if (/UPDATE alerts/i.test(sql) && /is_active = false/i.test(sql)) return [{ id: 'auto-on' }];
      return [];
    });

    const res = await deleteAlerts(new NextRequest('https://example.test/api/alerts?bulk=auto-orphaned', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.switchedOffCount).toBe(1);
    expect(body.deletedCount).toBe(1);

    const cleanup = state.queries.find((sql) => /UPDATE alerts/i.test(sql) && /is_active = false/i.test(sql));
    expect(cleanup).toBeTruthy();
    expect(cleanup).toContain(ACTIVE_WORKFLOW_AUTO_ORPHAN_SQL);
    expect(cleanup).toMatch(/is_smart_alert = true/);
    expect(cleanup).toMatch(/condition_value = 0/);
    expect(cleanup).toMatch(/workflow\.auto/);
    expect(cleanup).toMatch(/is_active IS TRUE/);
    expect(state.queries.some((sql) => /DELETE FROM alerts/i.test(sql))).toBe(false);
    expect(state.queries.some((sql) => /UPDATE alert_quotas/i.test(sql))).toBe(true);

    const page = readFileSync(resolve(__dirname, '../app/tools/alerts/page.tsx'), 'utf8');
    expect(page).toContain('isActiveWorkflowAutoOrphan');
    expect(page).toContain('alert.is_active && !isPriceAlertWithoutLevel');
    const toggle = page.slice(page.indexOf('const toggleAlert'), page.indexOf('const deleteAlert'));
    expect(toggle).toContain('setActionError');
    expect(toggle).not.toContain('status === 403');
  });
});
