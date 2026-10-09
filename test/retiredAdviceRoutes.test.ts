/**
 * Public routes retired by the 2026-10-08 AI endpoint audit (and analyst-context / explain on 2026-10-09): each checks access first, then returns 410 with a
 * private, detail-free body. No database, governor or provider is touched. Auth is a fake.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ session: { workspaceId: 'ws-a', tier: 'pro' } as any, paid: true }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => h.session) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => h.paid }));
vi.mock('@/lib/db', () => ({ q: vi.fn(() => { throw new Error('database must not be touched'); }) }));

const req = (path: string, method = 'POST') => new NextRequest(`https://msp.test${path}`, { method, ...(method === 'GET' ? {} : { body: JSON.stringify({ mode: 'PAPER', proposal: { proposal_id: 'p1' } }) }) });
type Case = { path: string; method: string; paid: boolean; load: () => Promise<any> };
const CASES: Case[] = [
  { path: '/api/trade-proposal', method: 'POST', paid: true, load: () => import('@/app/api/trade-proposal/route') },
  { path: '/api/ai-signals', method: 'POST', paid: true, load: () => import('@/app/api/ai-signals/route') },
  { path: '/api/ai-signals', method: 'GET', paid: true, load: () => import('@/app/api/ai-signals/route') },
  { path: '/api/ai/suggest', method: 'GET', paid: false, load: () => import('@/app/api/ai/suggest/route') },
  { path: '/api/ai/suggest', method: 'POST', paid: false, load: () => import('@/app/api/ai/suggest/route') },
  { path: '/api/ai/suggest', method: 'PATCH', paid: false, load: () => import('@/app/api/ai/suggest/route') },
  { path: '/api/execute-trade', method: 'POST', paid: false, load: () => import('@/app/api/execute-trade/route') },
  { path: '/api/ai-market-focus', method: 'GET', paid: true, load: () => import('@/app/api/ai-market-focus/route') },
  { path: '/api/ai/analyst-context', method: 'POST', paid: false, load: () => import('@/app/api/ai/analyst-context/route') },
  { path: '/api/ai/explain', method: 'GET', paid: false, load: () => import('@/app/api/ai/explain/route') },
  { path: '/api/ai/explain', method: 'POST', paid: false, load: () => import('@/app/api/ai/explain/route') },
];
const run = async (c: Case) => { const mod = await c.load(); const r = await mod[c.method](req(c.path, c.method)); return { status: r.status as number, headers: r.headers as Headers, body: await r.json() }; };
beforeEach(() => { h.session = { workspaceId: 'ws-a', tier: 'pro' }; h.paid = true; });

describe('retired public advice routes', () => {
  it.each(CASES)('$method $path returns 410 with no detail for an entitled caller', async (c) => {
    const r = await run(c);
    expect(r.status).toBe(410);
    expect(r.body).toEqual({ error: 'This endpoint has been retired.', retired: true });
    expect(r.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });
  it.each(CASES)('$method $path still refuses callers without access', async (c) => {
    h.session = null;
    expect((await run(c)).status).toBe(401);
    if (c.paid) { h.session = { workspaceId: 'ws-a', tier: 'free' }; h.paid = false; expect((await run(c)).status).toBe(403); }
  });
});
