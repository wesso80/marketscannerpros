/**
 * /api/scanner/bulk and /api/catalyst/events are exempt from the middleware quota, so each limits itself per workspace
 * and per IP. Auth, tier, database and limiter state are local fakes; no scan or provider call runs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ ws: 'ws-a', queries: 0, admin: true, authFails: false, adaptive: vi.fn() }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => { if (h.authFails) throw Error('PRIVATE_AUTH_DETAIL'); return {ok:h.admin}; }) }));
vi.mock('@/lib/adaptiveTrader', () => ({getAdaptiveLayer:h.adaptive}));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: h.ws, tier: 'pro', cid: 'c1' })) }));
vi.mock('@/lib/entitlements', async (orig) => ({ ...(await orig<typeof import('@/lib/entitlements')>()), getEffectiveTier: vi.fn(async () => 'pro') }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async () => { h.queries++; return []; }) }));
import { bulkScanLimiter, catalystLimiter } from '@/lib/rateLimit';
import { POST as bulk } from '@/app/api/scanner/bulk/route';
import { GET as catalyst } from '@/app/api/catalyst/events/route';

let n = 0;
beforeEach(() => { h.ws = `ws-${n++}`; h.queries = 0; h.admin = true; h.authFails = false; h.adaptive.mockClear(); });
const ipReq = (url: string, ip: string, init?: RequestInit) => new NextRequest(url, { ...init, headers: { 'x-forwarded-for': ip, ...(init?.headers as any) } });

describe('self-imposed rate limits on quota-exempt routes', () => {
  it('refuses non-admin bulk callers before scanning or consuming admin rate capacity', async () => {
    h.admin = false;
    const r = await bulk(ipReq('https://msp.test/api/scanner/bulk', `10.3.0.${n}`, {method:'POST',body:'{}'}));
    expect(r.status).toBe(403); expect(h.queries).toBe(0); expect(h.adaptive).not.toHaveBeenCalled();
    for(let i=0;i<6;i++) expect(bulkScanLimiter.check(`ws:${h.ws}`).allowed).toBe(true);
  });
  it('fails closed on admin verification errors before the limiter or scan', async () => {
    h.authFails = true;
    const r = await bulk(ipReq('https://msp.test/api/scanner/bulk', `10.4.0.${n}`, {method:'POST',body:'{}'}));
    expect(r.status).toBe(503); expect(await r.text()).not.toContain('PRIVATE_AUTH_DETAIL'); expect(h.queries).toBe(0); expect(h.adaptive).not.toHaveBeenCalled();
  });
  it('bulk scan: refuses with 429 + Retry-After once the workspace has used its 6 scans a minute, before any scan', async () => {
    for (let i = 0; i < 6; i++) bulkScanLimiter.check(`ws:${h.ws}`);
    const r = await bulk(ipReq('https://msp.test/api/scanner/bulk', `10.0.0.${n}`, { method: 'POST', body: JSON.stringify({ type: 'equity', timeframe: '1d' }) }));
    expect(r.status).toBe(429);
    expect(h.adaptive).not.toHaveBeenCalled();
    expect(r.headers.get('cache-control')).toContain('private, no-store');
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await r.json()).error).toMatch(/Too many bulk scans/);
  });
  it('bulk scan: an exhausted IP is refused even for a fresh workspace', async () => {
    const ip = `10.1.0.${n}`;
    for (let i = 0; i < 6; i++) bulkScanLimiter.check(`ip:${ip}`);
    const r = await bulk(ipReq('https://msp.test/api/scanner/bulk', ip, { method: 'POST', body: JSON.stringify({ type: 'equity', timeframe: '1d' }) }));
    expect(r.status).toBe(429);
    expect(h.adaptive).not.toHaveBeenCalled();
  });
  it('catalyst events: 60 reads a minute per workspace, then 429 without querying', async () => {
    const ip = `10.2.0.${n}`;
    for (let i = 0; i < 60; i++) expect((await catalyst(ipReq(`https://msp.test/api/catalyst/events?ticker=AAPL`, ip))).status).toBe(200);
    const before = h.queries;
    const r = await catalyst(ipReq(`https://msp.test/api/catalyst/events?ticker=AAPL`, ip));
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBeTruthy();
    expect(h.queries).toBe(before);
    expect(catalystLimiter).toBeDefined();
  });
});
