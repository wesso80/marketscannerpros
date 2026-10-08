/**
 * /api/research-case: live generation (?symbol=…) is retired (410 after sign-in); saved cases still list and save;
 * server errors return a generic message (validation messages stay). Database and state store are fakes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ session: { workspaceId: 'ws-a', tier: 'pro' } as any, queries: [] as string[], failDb: false }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => h.session) }));
vi.mock('@/lib/state-machine-store', () => ({ getLatestStateMachineBySymbol: vi.fn(async () => null) }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async (sql: string) => {
  h.queries.push(sql);
  if (h.failDb) throw new Error('relation "saved_research_cases" does not exist at internal-host:5432');
  return [];
}) }));
import { GET, POST } from '@/app/api/research-case/route';

const get = async (qs: string) => { const r = await GET(new NextRequest(`https://msp.test/api/research-case?${qs}`)); return { status: r.status, body: await r.json() }; };
const post = async (body: unknown) => { const r = await POST(new NextRequest('https://msp.test/api/research-case', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };
beforeEach(() => { h.session = { workspaceId: 'ws-a', tier: 'pro' }; h.queries = []; h.failDb = false; });

describe('/api/research-case', () => {
  it('live generation is retired: 410 with no detail, nothing computed or queried', async () => {
    const r = await get('symbol=AAPL&assetClass=equity');
    expect(r.status).toBe(410);
    expect(r.body).toEqual({ error: 'This endpoint has been retired.', retired: true });
    expect(h.queries).toEqual([]);
    h.session = null;
    expect((await get('symbol=AAPL')).status).toBe(401);
  });
  it('saved cases still list for the signed-in workspace', async () => {
    const r = await get('saved=true&symbol=AAPL&limit=10');
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(h.queries.length).toBe(1);
  });
  it('save keeps validation messages but hides server error detail', async () => {
    const bad = await post({ researchCase: { symbol: '' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('valid symbol is required');
    h.failDb = true;
    const err = await post({ researchCase: { symbol: 'AAPL', assetClass: 'equity', title: 'AAPL case' } });
    expect(err.status).toBe(500);
    expect(err.body.error).toBe('Failed to save research case');
    expect(JSON.stringify(err.body)).not.toMatch(/relation|internal-host/);
  });
});
