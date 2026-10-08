/**
 * /api/ai-scanner/alerts and /api/ai-scanner/test are private: admin auth is checked before any database read or
 * webhook call, the alert list limit is bounded, responses are private/no-store, errors are generic, and the test
 * route never returns the webhook secret. pg, auth and fetch are fakes; no network or database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ admin: { ok: true } as any, queries: [] as any[][], fail: false, alertBodies: [] as any[] }));
vi.mock('@/app/api/ai-scanner/alert/route', () => ({ POST: vi.fn(async (req: Request) => { h.alertBodies.push(await req.json()); return new Response(JSON.stringify({ ok: true, id: 1 }), { status: 200 }); }) }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => h.admin) }));
vi.mock('pg', () => ({
  Pool: class { async query(sql: string, params: any[]) { if (h.fail) throw new Error('relation "secret_internal" does not exist'); h.queries.push(params); return { rows: [] }; } },
}));
import { GET as listAlerts } from '@/app/api/ai-scanner/alerts/route';
import { POST as testAlert } from '@/app/api/ai-scanner/test/route';

const SECRET = 'whsec-CANARY-123';
const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
beforeEach(() => {
  h.admin = { ok: true }; h.queries = []; h.fail = false; h.alertBodies = []; fetchMock.mockClear();
  vi.stubEnv('TRADINGVIEW_WEBHOOK_SECRET', SECRET);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const list = (qs = '') => listAlerts(new Request(`https://msp.test/api/ai-scanner/alerts${qs}`));
const runTest = () => testAlert(new Request('https://msp.test/api/ai-scanner/test', { method: 'POST' }));

describe('/api/ai-scanner private routes', () => {
  it('refuse unauthenticated callers before touching the database or webhook', async () => {
    h.admin = { ok: false };
    for (const r of [await list(), await runTest()]) {
      expect(r.status).toBe(401);
      expect(r.headers.get('cache-control')).toContain('no-store');
    }
    expect(h.queries).toEqual([]);
    expect(h.alertBodies).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('bound the alert list limit', async () => {
    for (const [qs, expected] of [['', 50], ['?limit=100000', 200], ['?limit=-5', 1], ['?limit=abc', 50], ['?limit=25&symbol=BTC-USD', 25]] as const) {
      const r = await list(qs);
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      expect(h.queries.at(-1)!.at(-1)).toBe(expected);
    }
  });
  it('return a generic error without the database message', async () => {
    h.fail = true;
    const r = await list();
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toMatch(/secret_internal|relation/);
  });
  it('the test route signs the alert in-process (no network call, no Host-derived URL) and never returns the secret', async () => {
    const r = await testAlert(new Request('https://msp.test/api/ai-scanner/test', { method: 'POST', headers: { host: 'attacker.example' } }));
    expect(r.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.alertBodies).toHaveLength(1);
    expect(h.alertBodies[0].secret).toBe(SECRET);
    const body = await r.json();
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(body.testPayload).not.toHaveProperty('secret');
    expect(r.headers.get('cache-control')).toContain('no-store');
  });
});
