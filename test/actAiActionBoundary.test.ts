/**
 * ACT01–ACT04 acceptance (AI action execution boundary), against a fake database that applies each statement in turn
 * with an await between statements, so concurrent requests interleave as they would against Postgres:
 *   ACT01 a dry run never executes or writes;
 *   ACT02 a confirmation must match a pending proposal (same workspace, tool and parameters) and runs the stored one;
 *   ACT03 concurrent confirmations or repeats execute once;
 *   ACT04 the response flag is updated only within the caller's workspace.
 * No real database, provider or notification is used; every write is captured.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({
  actions: [] as Array<Record<string, any>>,
  alerts: [] as Array<Record<string, any>>,
  watch: [] as Array<Record<string, any>>,
  responses: [] as Array<{ id: string; workspace_id: string; user_took_action: boolean }>,
  sql: [] as string[],
  seq: 0,
  failAlertInsert: false,
  failFinalUpdate: false,
  failWatchInsert: false,
}));
const ws = vi.hoisted(() => ({ id: 'ws-a' }));
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v: any): any { return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v; }
const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: ws.id, tier: 'pro' })) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => true }));
vi.mock('@/lib/db', () => ({
  q: vi.fn(async (text: string, p: any[] = []) => {
    await new Promise((r) => setTimeout(r, 1)); // every statement yields, like a network round trip
    const t = text.replace(/\s+/g, ' ').trim();
    db.sql.push(t);
    const A = db.actions;
    if (t.startsWith('SELECT id, status, result_data, error_message') && t.includes('FROM ai_actions')) {
      return A.filter((r) => r.workspace_id === p[0] && r.idempotency_key === p[1] && (!t.includes("status IN") || ['executed', 'pending', 'confirmed'].includes(r.status))).slice(-1);
    }
    if (t.startsWith('SELECT id, result_data FROM ai_actions')) return [];
    if (t.includes('increment_rate_limit')) return [{ minute_count: 1, hour_count: 1 }];
    if (t.startsWith('SELECT id FROM ai_responses WHERE id = $1 AND workspace_id = $2')) return db.responses.filter((r) => r.id === p[0] && r.workspace_id === p[1]).map((r) => ({ id: r.id }));
    if (t.startsWith('INSERT INTO ai_actions') && t.includes("'pending', true")) {
      const hit = A.find((r) => r.workspace_id === p[0] && r.idempotency_key === p[4]);
      if (hit) {
        if (t.includes("WHERE ai_actions.status = 'pending'")) return hit.status === 'pending' ? [{ id: hit.id, status: hit.status }] : [];
        if (!['executed', 'confirmed'].includes(hit.status)) hit.status = 'pending'; return [{ id: hit.id, status: hit.status }]; // old statement
      }
      const row = { id: `act-${++db.seq}`, workspace_id: p[0], response_id: p[1], action_type: p[2], action_params: parse(p[3]), idempotency_key: p[4], status: 'pending' };
      A.push(row); return [{ id: row.id, status: row.status }];
    }
    if (t.startsWith('INSERT INTO ai_actions') && t.includes("'confirmed', false, true")) { // new: atomic claim for no-confirmation tools
      if (A.some((r) => r.workspace_id === p[0] && r.idempotency_key === p[4])) return [];
      const row = { id: `act-${++db.seq}`, workspace_id: p[0], action_type: p[2], action_params: parse(p[3]), idempotency_key: p[4], status: 'confirmed' };
      A.push(row); return [{ id: row.id }];
    }
    if (t.startsWith('INSERT INTO ai_actions')) { // old: executed row inserted after the fact
      if (A.some((r) => r.workspace_id === p[0] && r.idempotency_key === p[4])) throw new Error('duplicate key value violates unique constraint');
      const row = { id: `act-${++db.seq}`, workspace_id: p[0], action_type: p[2], action_params: parse(p[3]), idempotency_key: p[4], status: p[7] };
      A.push(row); return [{ id: row.id }];
    }
    if (t.startsWith("UPDATE ai_actions SET status = 'confirmed', user_confirmed = true, confirmed_at = NOW() WHERE workspace_id = $1 AND status = 'pending'")) {
      const keyed = t.includes('AND idempotency_key = $5 AND ($4::text IS NULL OR id::text = $4::text)');
      const row = A.find((r) => r.workspace_id === p[0] && r.status === 'pending' && r.action_type === p[1] && same(r.action_params, parse(p[2])) && (keyed ? r.idempotency_key === p[4] && (p[3] == null || r.id === p[3]) : (p[3] != null ? r.id === p[3] : r.idempotency_key === p[4])));
      if (!row) return []; row.status = 'confirmed'; return [{ id: row.id, action_params: row.action_params }];
    }
    if (t.startsWith("UPDATE ai_actions SET status = 'confirmed', user_confirmed = true, confirmed_at = NOW() WHERE id = $1")) { // old
      const row = A.find((r) => r.id === p[0] && r.workspace_id === p[1]); if (row) row.status = 'confirmed'; return [];
    }
    if (t.startsWith("UPDATE ai_actions SET status = 'confirmed' WHERE workspace_id = $1 AND idempotency_key = $2 AND status = 'failed'")) {
      const row = A.find((r) => r.workspace_id === p[0] && r.idempotency_key === p[1] && r.status === 'failed'); if (!row) return []; row.status = 'confirmed'; return [{ id: row.id }];
    }
    if (t.startsWith('UPDATE ai_actions SET success') && db.failFinalUpdate) throw new Error('connection lost');
    if (t.startsWith('UPDATE ai_actions SET success')) { const row = A.find((r) => r.id === p[0] && r.workspace_id === p[1]); if (row) row.status = p[3]; return row ? [{ id: row.id }] : []; }
    if (t.startsWith('INSERT INTO user_alerts') && db.failAlertInsert) throw new Error('alerts table unavailable');
    if (t.startsWith('INSERT INTO user_alerts')) { const row = { id: `alert-${db.alerts.length + 1}`, workspace_id: p[0], symbol: p[1], value: p[3] }; db.alerts.push(row); return [{ id: row.id }]; }
    if (t.startsWith('SELECT COUNT(*)::INT AS count FROM user_watchlist')) return [{ count: db.watch.filter((w) => w.workspace_id === p[0]).length }];
    if (t.startsWith('INSERT INTO user_watchlist') && db.failWatchInsert) throw new Error('watchlist table unavailable');
    if (t.startsWith('INSERT INTO user_watchlist')) { db.watch.push({ workspace_id: p[0], symbol: p[1] }); return []; }
    if (t.startsWith('UPDATE ai_responses')) {
      for (const r of db.responses) if (r.id === p[0] && (!t.includes('AND workspace_id') || r.workspace_id === p[2])) r.user_took_action = true;
      return [];
    }
    if (t.startsWith('INSERT INTO ai_events')) return [];
    throw new Error(`Unexpected SQL in test: ${t.slice(0, 120)}`);
  }),
}));

import { POST } from '@/app/api/ai/actions/route';

const alert = { symbol: 'AAPL', alertType: 'price_above', value: 250 };
const call = async (body: Record<string, unknown>) => { const r = await POST(new NextRequest('https://msp.test/api/ai/actions', { method: 'POST', body: JSON.stringify({ skill: 'scanner', ...body }) })); return { status: r.status, body: await r.json() }; };

beforeEach(() => { db.actions = []; db.alerts = []; db.watch = []; db.responses = []; db.sql = []; db.seq = 0; db.failAlertInsert = false; db.failFinalUpdate = false; db.failWatchInsert = false; ws.id = 'ws-a'; });

describe('ACT01: a dry run never executes', () => {
  it.each([['create_alert', alert], ['add_to_watchlist', { symbol: 'MSFT' }]] as const)('%s with dryRun:true writes nothing', async (tool, parameters) => {
    const r = await call({ tool, parameters, dryRun: true });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ dryRun: true, executed: false });
    expect(db.alerts).toHaveLength(0);
    expect(db.watch).toHaveLength(0);
    expect(db.actions).toHaveLength(0);
  });
  it('dryRun together with confirm still executes nothing', async () => {
    await call({ tool: 'create_alert', parameters: alert });
    const r = await call({ tool: 'create_alert', parameters: alert, confirm: true, dryRun: true });
    expect(r.body.executed).toBe(false);
    expect(db.alerts).toHaveLength(0);
    expect(db.actions[0].status).toBe('pending');
  });
});

describe('ACT02: a confirmation is bound to its proposal', () => {
  it('confirm without any pending proposal does not execute', async () => {
    const r = await call({ tool: 'create_alert', parameters: alert, confirm: true });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('No matching pending proposal to confirm');
    expect(db.alerts).toHaveLength(0);
  });
  it('confirm naming a proposal with different parameters does not execute either', async () => {
    const p = await call({ tool: 'create_alert', parameters: alert });
    const r = await call({ tool: 'create_alert', parameters: { ...alert, value: 1 }, confirm: true, actionId: p.body.actionId });
    expect(r.status).toBe(409);
    expect(db.alerts).toHaveLength(0);
    expect(db.actions.find((a) => a.id === p.body.actionId)!.status).toBe('pending');
  });
  it('propose then confirm the same proposal: executes once, with the stored parameters', async () => {
    const p = await call({ tool: 'create_alert', parameters: alert });
    expect(p.body.status).toBe('pending');
    expect(db.alerts).toHaveLength(0);
    const c = await call({ tool: 'create_alert', parameters: alert, confirm: true, actionId: p.body.actionId });
    expect(c.status).toBe(200);
    expect(c.body.status).toBe('executed');
    expect(db.alerts).toEqual([{ id: 'alert-1', workspace_id: 'ws-a', symbol: 'AAPL', value: 250 }]);
    const again = await call({ tool: 'create_alert', parameters: alert, confirm: true, actionId: p.body.actionId });
    expect(again.body.duplicate).toBe(true);
    expect(db.alerts).toHaveLength(1);
  });
  it("another workspace cannot confirm this workspace's proposal", async () => {
    const p = await call({ tool: 'create_alert', parameters: alert });
    ws.id = 'ws-b';
    const r = await call({ tool: 'create_alert', parameters: alert, confirm: true, actionId: p.body.actionId, idempotencyKey: p.body.idempotencyKey });
    expect(r.status).toBe(409);
    expect(db.alerts).toHaveLength(0);
  });
});

describe('ACT03: concurrent requests execute once', () => {
  it('two concurrent confirmations of one proposal create one alert', async () => {
    const p = await call({ tool: 'create_alert', parameters: alert });
    const [a, b] = await Promise.all([
      call({ tool: 'create_alert', parameters: alert, confirm: true, actionId: p.body.actionId }),
      call({ tool: 'create_alert', parameters: alert, confirm: true, actionId: p.body.actionId }),
    ]);
    expect(db.alerts).toHaveLength(1);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });
  it('two concurrent identical no-confirmation writes execute once', async () => {
    const [a, b] = await Promise.all([call({ tool: 'add_to_watchlist', parameters: { symbol: 'MSFT' } }), call({ tool: 'add_to_watchlist', parameters: { symbol: 'MSFT' } })]);
    expect(db.watch).toHaveLength(1);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });
});

describe('ACT04 / ACT-R2: response ownership is checked before any effect', () => {
  it("another workspace's responseId is rejected before any proposal, claim or effect, even with a skill supplied", async () => {
    db.responses = [{ id: 'resp-b', workspace_id: 'ws-b', user_took_action: false }];
    const r = await call({ tool: 'add_to_watchlist', parameters: { symbol: 'TSLA' }, responseId: 'resp-b' });
    expect(r.status).toBe(404);
    expect(db.watch).toHaveLength(0);
    expect(db.actions).toHaveLength(0);
    expect(db.responses[0].user_took_action).toBe(false);
  });
  it("this workspace's response is accepted, linked and flagged, scoped to the workspace", async () => {
    db.responses = [{ id: 'resp-a', workspace_id: 'ws-a', user_took_action: false }];
    const r = await call({ tool: 'add_to_watchlist', parameters: { symbol: 'NVDA' }, responseId: 'resp-a' });
    expect(r.status).toBe(200);
    expect(db.watch).toHaveLength(1);
    expect(db.responses[0].user_took_action).toBe(true);
    expect(db.sql.filter((q) => q.startsWith('UPDATE ai_responses')).every((q) => q.includes('AND workspace_id = $3'))).toBe(true);
  });
});

describe('ACT-R1: an idempotency key and an actionId identify one action', () => {
  it('an executed key reused with different parameters is rejected, not answered with the old result', async () => {
    const key = 'k-exec';
    expect((await call({ tool: 'add_to_watchlist', parameters: { symbol: 'AMD' }, idempotencyKey: key })).status).toBe(200);
    const r = await call({ tool: 'add_to_watchlist', parameters: { symbol: 'INTC' }, idempotencyKey: key });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('Idempotency key already used for a different action');
    expect(r.body.executedResult).toBeUndefined();
    expect(db.watch.map((w) => w.symbol)).toEqual(['AMD']);
  });
  it('a failed key reused for another operation is rejected and nothing runs', async () => {
    db.failAlertInsert = true;
    const key = 'k-fail';
    const p = await call({ tool: 'create_alert', parameters: alert, idempotencyKey: key });
    expect((await call({ tool: 'create_alert', parameters: alert, confirm: true, actionId: p.body.actionId, idempotencyKey: key })).body.status).toBe('failed');
    db.failAlertInsert = false;
    const other = await call({ tool: 'create_alert', parameters: { ...alert, value: 300 }, confirm: true, idempotencyKey: key });
    expect(other.status).toBe(409);
    expect(db.alerts).toHaveLength(0);
  });
  it('a failed no-confirmation write: its key cannot be reclaimed to run different parameters', async () => {
    db.failWatchInsert = true;
    expect((await call({ tool: 'add_to_watchlist', parameters: { symbol: 'AMD' }, idempotencyKey: 'k-w' })).body.status).toBe('failed');
    db.failWatchInsert = false;
    const reuse = await call({ tool: 'add_to_watchlist', parameters: { symbol: 'INTC' }, idempotencyKey: 'k-w' });
    expect(reuse.status).toBe(409);
    expect(db.watch).toHaveLength(0);
    expect(db.actions.find((r) => r.idempotency_key === 'k-w')!.action_params).toEqual({ symbol: 'AMD' });
  });
  it("an actionId paired with another proposal's key is rejected", async () => {
    const a = await call({ tool: 'create_alert', parameters: alert, idempotencyKey: 'k-a' });
    await call({ tool: 'create_alert', parameters: alert, idempotencyKey: 'k-b' });
    const r = await call({ tool: 'create_alert', parameters: alert, confirm: true, actionId: a.body.actionId, idempotencyKey: 'k-b' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('actionId does not match the action for this idempotency key');
    expect(db.alerts).toHaveLength(0);
  });
});

describe('ACT-R3: lifecycle and interrupted execution', () => {
  it('a cancelled proposal is not revived under the same key', async () => {
    const p = await call({ tool: 'create_alert', parameters: alert, idempotencyKey: 'k-c' });
    db.actions.find((r) => r.id === p.body.actionId)!.status = 'cancelled';
    const again = await call({ tool: 'create_alert', parameters: alert, idempotencyKey: 'k-c' });
    expect(again.status).toBe(409);
    expect(db.actions.find((r) => r.id === p.body.actionId)!.status).toBe('cancelled');
    expect((await call({ tool: 'create_alert', parameters: alert, confirm: true, idempotencyKey: 'k-c' })).status).toBe(409);
    expect(db.alerts).toHaveLength(0);
  });
  it('a failed attempt is terminal: the same request is not replayed (it may have had partial effects)', async () => {
    db.failAlertInsert = true;
    const p = await call({ tool: 'create_alert', parameters: alert, idempotencyKey: 'k-f' });
    await call({ tool: 'create_alert', parameters: alert, confirm: true, actionId: p.body.actionId, idempotencyKey: 'k-f' });
    db.failAlertInsert = false;
    const retry = await call({ tool: 'create_alert', parameters: alert, confirm: true, actionId: p.body.actionId, idempotencyKey: 'k-f' });
    expect(retry.status).toBe(409);
    expect(retry.body.status).toBe('failed');
    expect(db.alerts).toHaveLength(0);
  });
  it('a crash after the effect but before the outcome is recorded reads "outcome unknown" and is not re-run', async () => {
    const p = await call({ tool: 'create_alert', parameters: alert, idempotencyKey: 'k-x' });
    db.failFinalUpdate = true;
    const crashed = await call({ tool: 'create_alert', parameters: alert, confirm: true, actionId: p.body.actionId, idempotencyKey: 'k-x' });
    expect(crashed.status).toBe(500);
    expect(db.alerts).toHaveLength(1);
    db.failFinalUpdate = false;
    const retry = await call({ tool: 'create_alert', parameters: alert, confirm: true, actionId: p.body.actionId, idempotencyKey: 'k-x' });
    expect(retry.status).toBe(409);
    expect(retry.body.outcome).toBe('unknown');
    expect(db.alerts).toHaveLength(1);
  });
});
