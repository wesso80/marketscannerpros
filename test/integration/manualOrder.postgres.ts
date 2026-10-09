import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => ({ ok: true, workspace: '11111111-1111-4111-8111-111111111111' }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => ({ ok: h.ok, workspaceId: h.workspace }) }));
import { getPool } from '@/lib/db';
import { POST } from '@/app/api/admin/portfolio-lab/create-sim-order/route';
import { ARCA_DEFAULT_SETTINGS } from '@/lib/admin/portfolio-lab/constants';
const URL_VALUE = process.env.DATABASE_URL;
if (!URL_VALUE)
    throw Error('An isolated local PostgreSQL fixture is required');
const dbUrl = new URL(URL_VALUE);
if (dbUrl.hostname !== '127.0.0.1' || dbUrl.pathname !== '/msp_manual_order_test')
    throw Error('Refusing to run outside the dedicated local fixture database');
const query = (sql: string, args: unknown[] = []) => getPool().query(sql, args);
const W1 = '11111111-1111-4111-8111-111111111111', W2 = '22222222-2222-4222-8222-222222222222';
const input = { symbol: 'AAPL', assetClass: 'equity', side: 'LONG', entry: 100, stop: 90 };
const req = (key = 'request-key-000001', body: unknown = input, origin = 'https://marketscannerpros.app') => new NextRequest('https://marketscannerpros.app/api/admin/portfolio-lab/create-sim-order', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) });
async function account(workspace: string) { return (await query(`INSERT INTO arca_portfolios(workspace_id,name,mode,starting_balance,current_cash,total_equity,settings_json) VALUES ($1,'ARCA Internal Fund','SIMULATED',10000,10000,10000,$2::jsonb) RETURNING id`, [workspace, JSON.stringify({ ...ARCA_DEFAULT_SETTINGS, riskPerTradePct: 1, maxSingleTradeRiskPct: 1, maxOpenPortfolioRiskPct: 1, feesPctEstimate: 0, slippagePctEstimate: 0 })])).rows[0].id; }
async function count(table: string) { if (!['arca_simulated_orders', 'admin_manual_order_requests', 'arca_trade_journal'].includes(table))
    throw Error('Unexpected table'); return Number((await query(`SELECT COUNT(*) n FROM ${table}`)).rows[0].n); }
beforeAll(async () => { await query(readFileSync('migrations/095_arca_portfolio_lab.sql', 'utf8').replace(/^\uFEFF/, '')); await query(readFileSync('migrations/130_admin_manual_order_requests.sql', 'utf8').replace(/^\uFEFF/, '')); });
beforeEach(async () => { await query('DROP TRIGGER IF EXISTS fixture_journal_failure ON arca_trade_journal'); await query('TRUNCATE admin_manual_order_requests,arca_portfolios CASCADE'); h.ok = true; h.workspace = W1; await account(W1); });
afterAll(async () => { await getPool().end(); });
it('two simultaneous confirmations create one order, one journal and one durable receipt', async () => { const [a, b] = await Promise.all([POST(req()), POST(req())]); expect([a.status, b.status]).toEqual([200, 200]); expect(await a.json()).toEqual(await b.json()); expect(new Set([a.headers.get('idempotency-replayed'), b.headers.get('idempotency-replayed')])).toEqual(new Set(['false', 'true'])); expect(await count('arca_simulated_orders')).toBe(1); expect(await count('arca_trade_journal')).toBe(1); expect(await count('admin_manual_order_requests')).toBe(1); });
it('different keys serialize pending-risk admission so only one request consumes the risk budget', async () => { const results = await Promise.all([POST(req('different-key-001')), POST(req('different-key-002'))]); expect(results.map(r => r.status).sort()).toEqual([200, 422]); expect(await count('arca_simulated_orders')).toBe(1); const risk = Number((await query("SELECT SUM(ABS(planned_entry-stop_loss)*quantity) r FROM arca_simulated_orders")).rows[0].r); expect(risk).toBe(100); });
it('same key with changed input conflicts without another order', async () => { expect((await POST(req())).status).toBe(200); expect((await POST(req(undefined, { ...input, entry: 101 }))).status).toBe(409); expect(await count('arca_simulated_orders')).toBe(1); });
it('an accepted result can be retrieved after response loss and after account reset', async () => { const first = await (await POST(req())).json(); await query("UPDATE arca_portfolios SET name='Archived',status='ARCHIVED' WHERE workspace_id=$1", [W1]); await account(W1); const replay = await POST(req()); expect(replay.headers.get('idempotency-replayed')).toBe('true'); expect(await replay.json()).toEqual(first); expect(await count('arca_simulated_orders')).toBe(1); });
it('a journal failure rolls back the order and receipt; safe same-key retry works', async () => { await query("CREATE OR REPLACE FUNCTION fixture_fail_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$"); await query('CREATE TRIGGER fixture_journal_failure BEFORE INSERT ON arca_trade_journal FOR EACH ROW EXECUTE FUNCTION fixture_fail_journal()'); expect((await POST(req())).status).toBe(503); expect(await count('arca_simulated_orders')).toBe(0); expect(await count('admin_manual_order_requests')).toBe(0); await query('DROP TRIGGER fixture_journal_failure ON arca_trade_journal'); expect((await POST(req())).status).toBe(200); expect(await count('arca_simulated_orders')).toBe(1); });
it('a rejected receipt remains rejected when later capacity changes', async () => { await POST(req('capacity-first-001')); expect((await POST(req('capacity-second-01'))).status).toBe(422); await query("UPDATE arca_simulated_orders SET status='CANCELLED'"); const replay = await POST(req('capacity-second-01')); expect(replay.status).toBe(422); expect(replay.headers.get('idempotency-replayed')).toBe('true'); expect(await count('arca_simulated_orders')).toBe(1); });
it('the same key is independent across authenticated workspaces', async () => { expect((await POST(req())).status).toBe(200); h.workspace = W2; await account(W2); expect((await POST(req())).status).toBe(200); expect(await count('admin_manual_order_requests')).toBe(2); expect((await query('SELECT DISTINCT workspace_id FROM arca_simulated_orders')).rows).toHaveLength(2); });
it('missing keys and foreign origins do no work', async () => { expect((await POST(req(''))).status).toBe(400); expect((await POST(req(undefined, input, 'https://foreign.example'))).status).toBe(403); expect(await count('arca_simulated_orders')).toBe(0); expect(await count('admin_manual_order_requests')).toBe(0); });
it('unauthenticated callers cannot retrieve a saved receipt', async () => {
    expect((await POST(req())).status).toBe(200);
    h.ok = false;
    const response = await POST(req());
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(await count('arca_simulated_orders')).toBe(1);
});
it('fails closed when pending orders exceed the shared capacity reader limit', async () => {
    await query(`INSERT INTO arca_simulated_orders(workspace_id,portfolio_id,symbol,asset_class,side,order_type,status,planned_entry,quantity,notional_value,stop_loss)
    SELECT workspace_id,id,'FIXTURE','equity','LONG','LIMIT_SIM','PLANNED',100,1,100,99
    FROM arca_portfolios CROSS JOIN generate_series(1,201)`);
    const response = await POST(req());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Pending order capacity requires review' });
    expect(await count('arca_simulated_orders')).toBe(201);
});
