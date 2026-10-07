/** Opt-in real PostgreSQL test. Only connects to loopback using explicit ACT_TEST_* inputs.
 * Creates/drops a randomly named database; never reads DATABASE_URL. Business effects are fake.
 * ACT_TEST_POSTGRES_PORT=55439 ACT_TEST_POSTGRES_USER=act_test vitest run test/actPostgres.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ pool: null as any, effects: 0, failEffect: false, failOutcome: false,
  barrier: null as null | (() => Promise<void>), workspace: '00000000-0000-4000-8000-000000000001' }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: h.workspace, tier: 'pro' }) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => true }));
vi.mock('@/lib/db', () => ({ q: async (sql: string, args: unknown[] = []) => {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (text.startsWith('INSERT INTO user_alerts')) {
    if (h.failEffect) throw new Error('synthetic business failure');
    h.effects++;
    return [{ id: randomUUID() }];
  }
  if (text.startsWith('UPDATE ai_actions SET success') && h.failOutcome) throw new Error('synthetic outcome-write interruption');
  if (text.startsWith('UPDATE ai_actions SET status') && text.includes("status = 'pending'") && h.barrier) await h.barrier();
  return (await h.pool.query(sql, args)).rows;
} }));
import { POST } from '@/app/api/ai/actions/route';
const enabled = !!process.env.ACT_TEST_POSTGRES_PORT;
const alert = { symbol: 'AAPL', alertType: 'price_above', value: 250 };
const call = async (extra: Record<string, unknown> = {}) => {
  const r = await POST(new NextRequest('http://localhost/api/ai/actions', { method: 'POST', body: JSON.stringify({ skill: 'scanner', tool: 'create_alert', parameters: alert, idempotencyKey: 'test-action', ...extra }) }));
  return { status: r.status, body: await r.json() };
};

describe.skipIf(!enabled)('ACT on real PostgreSQL with fake business effects', () => {
  let admin: Pool;
  const database = `act_boundary_${randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    const port = Number(process.env.ACT_TEST_POSTGRES_PORT);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Explicit test port required');
    const config = { host: '127.0.0.1', port, user: process.env.ACT_TEST_POSTGRES_USER || 'act_test', password: process.env.ACT_TEST_POSTGRES_PASSWORD || '', connectionTimeoutMillis: 5000 };
    admin = new Pool({ ...config, database: 'postgres' });
    await admin.query(`CREATE DATABASE "${database}"`);
    h.pool = new Pool({ ...config, database, max: 5 });
    console.log('Isolated PostgreSQL:', (await h.pool.query('SELECT version()')).rows[0].version);
    const migration = (name: string) => readFileSync(`migrations/${name}`, 'utf8');
    // Exact core prerequisite table, then entire AI schemas and the exact hardening migration.
    const core = migration('000_FULL_SCHEMA_NEON.sql').match(/CREATE TABLE IF NOT EXISTS workspaces \([\s\S]*?\n\);/);
    if (!core) throw new Error('Workspace prerequisite migration not found');
    await h.pool.query(core[0]);
    await h.pool.query(migration('AI_PLATFORM_SCHEMA.sql'));
    await h.pool.query(migration('AI_PLATFORM_SCHEMA_V2.sql'));
    await h.pool.query(migration('016_ai_actions_executor_hardening.sql'));
    await h.pool.query(migration('016_ai_actions_executor_hardening.sql')); // migration repeatability
    await h.pool.query('INSERT INTO workspaces (id, stripe_customer_id) VALUES ($1, $2)', [h.workspace, 'synthetic-act']);
  }, 30000);
  afterAll(async () => {
    if (h.pool) await h.pool.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    h.effects = 0; h.failEffect = false; h.failOutcome = false; h.barrier = null;
    await h.pool.query('TRUNCATE ai_actions, ai_events, ai_rate_limits');
  });
  it('uses the real partial unique index for repeat proposals and JSONB matching', async () => {
    const p = await call(), again = await call();
    expect(p.status).toBe(200); expect(again.status).toBe(200);
    expect(again.body.actionId).toBe(p.body.actionId);
    expect((await h.pool.query('SELECT count(*)::int AS n FROM ai_actions')).rows[0].n).toBe(1);
    const confirmed = await call({ confirm: true, actionId: p.body.actionId, parameters: { value: 250, alertType: 'price_above', symbol: 'AAPL' } });
    expect(confirmed.body.status).toBe('executed'); expect(h.effects).toBe(1);
  });
  it('only one of two simultaneous confirmations claims the pending row', async () => {
    const p = await call();
    let arrived = 0, release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    h.barrier = async () => { if (++arrived === 2) release(); await gate; };
    const results = await Promise.all([call({ confirm: true, actionId: p.body.actionId }), call({ confirm: true, actionId: p.body.actionId })]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect(arrived).toBe(2); expect(h.effects).toBe(1);
    expect((await h.pool.query('SELECT status FROM ai_actions')).rows[0].status).toBe('executed');
  });
  it.each(['cancelled', 'failed'])('%s rows cannot be proposed or confirmed again', async status => {
    const p = await call();
    await h.pool.query('UPDATE ai_actions SET status = $1 WHERE id = $2', [status, p.body.actionId]);
    expect((await call()).status).toBe(409);
    expect((await call({ confirm: true, actionId: p.body.actionId })).status).toBe(409);
    expect(h.effects).toBe(0);
    expect((await h.pool.query('SELECT status FROM ai_actions')).rows[0].status).toBe(status);
  });
  it('records an executor failure as terminal', async () => {
    const p = await call(); h.failEffect = true;
    expect((await call({ confirm: true, actionId: p.body.actionId })).body.status).toBe('failed');
    h.failEffect = false;
    expect((await call({ confirm: true, actionId: p.body.actionId })).status).toBe(409);
    expect(h.effects).toBe(0);
  });
  it('reports unknown outcome after effect succeeds but outcome write is interrupted', async () => {
    const p = await call(); h.failOutcome = true;
    expect((await call({ confirm: true, actionId: p.body.actionId })).status).toBe(500);
    expect(h.effects).toBe(1); h.failOutcome = false;
    expect((await call({ confirm: true, actionId: p.body.actionId })).body.outcome).toBe('unknown');
    expect(h.effects).toBe(1);
    expect((await h.pool.query('SELECT status FROM ai_actions')).rows[0].status).toBe('confirmed');
  });
});
