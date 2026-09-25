/**
 * "Why don't I have options?" — regression tests for the options tools.
 *
 * 1. Access: the options API routes read the tier baked into the login cookie and required the literal legacy
 *    `pro_trader` tier, while the UI (/api/me) uses the effective tier (DB subscription + admin override).
 *    Pro subscribers (the only paid plan sold now) and admins whose cookie says `free` were refused with 403
 *    even though the pages showed as unlocked.
 * 2. Data: an Alpha Vantage key without the realtime-options entitlement gets an artificial sample chain
 *    ("XXYYZZ", expiry 2099-99-99) or an "Information" note from the realtime function. The sample must never
 *    be shown as a chain, and the route must fall back to HISTORICAL_OPTIONS (in every premium plan).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => {
  process.env.ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'test-key';
  return {
  session: null as null | { cid: string; tier: string; workspaceId: string; exp: number },
  admin: false,
  effectiveTier: 'free',
  av: {} as Record<string, unknown>, // function name → payload, or Error to throw
  calls: [] as string[],
  };
});

vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => m.session) }));
vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: vi.fn(async () => (m.admin ? { ok: true, source: 'app_session', cid: 'admin', workspaceId: 'ws-admin' } : { ok: false })),
}));
vi.mock('@/lib/db', () => ({ q: vi.fn(async () => []) }));
vi.mock('@/lib/entitlements', async (orig) => {
  const real = await orig<typeof import('@/lib/entitlements')>();
  return { ...real, getEffectiveTier: vi.fn(async () => m.effectiveTier) };
});
vi.mock('@/lib/redis', () => ({
  getCached: vi.fn(async () => null),
  setCached: vi.fn(async () => undefined),
  CACHE_KEYS: { optionsChain: (s: string) => `opt:chain:${s}` },
  CACHE_TTL: { optionsChain: 120 },
}));
vi.mock('@/lib/avRateGovernor', () => ({
  avTakeToken: vi.fn(async () => undefined),
  avFetch: vi.fn(async (url: string) => {
    const fn = new URL(url).searchParams.get('function') || '';
    m.calls.push(fn);
    const v = m.av[fn];
    if (v instanceof Error) throw v;
    return v ?? null;
  }),
}));

import { usableOptionRows, isAlphaVantageSampleChain } from '@/lib/options/avChain';
import { checkOptionsAccess } from '@/lib/options/access';
import { GET as chainGET } from '../app/api/options-chain/route';
import { clearSharedOptionsChainCache } from '../lib/options/chainCache';
import { GET as flowGET } from '../app/api/options-flow/route';
import { hasPaidTier } from '../app/v2/_components/ui';

function contract(symbol: string, type: 'call' | 'put', strike: number, expiration = '2030-01-18') {
  return {
    contractID: `${symbol}300118${type === 'call' ? 'C' : 'P'}${strike}`, symbol, expiration, strike: strike.toFixed(2), type,
    last: '5.00', mark: '5.00', bid: '4.90', ask: '5.10', volume: '100', open_interest: '1500', date: '2026-09-24',
    implied_volatility: '0.22', delta: type === 'call' ? '0.50' : '-0.50', gamma: '0.01', theta: '-0.1', vega: '0.2', rho: '0.01',
  };
}
const realChain = (symbol = 'SPY') => ({
  endpoint: 'Historical Options', message: 'success',
  data: [490, 500, 510].flatMap((k) => [contract(symbol, 'call', k), contract(symbol, 'put', k)]),
});
// Exactly what Alpha Vantage returns to a key that is not entitled to a premium options endpoint.
const samplePayload = {
  endpoint: 'Realtime Options',
  message: 'This is a premium endpoint. ***THE SAMPLE DATA SCHEMA BELOW IS ARTIFICIAL AND FOR ILLUSTRATION PURPOSES ONLY***.',
  data: [
    { ...contract('XXYYZZ', 'call', 20, '2099-99-99'), contractID: 'XXYYZZ999999C00020000', date: '2049-99-99' },
    { ...contract('XXYYZZ', 'put', 20, '2099-99-99'), contractID: 'XXYYZZ999999P00020000', date: '2049-99-99' },
  ],
};
const quote = { 'Global Quote': { '05. price': '500.00' } };

beforeEach(() => {
  m.session = null; m.admin = false; m.effectiveTier = 'free'; m.av = {}; m.calls = [];
  clearSharedOptionsChainCache();
});

describe('usableOptionRows / isAlphaVantageSampleChain', () => {
  it('rejects the artificial premium sample chain', () => {
    expect(usableOptionRows(samplePayload, 'SPY')).toBeNull();
    expect(isAlphaVantageSampleChain(samplePayload)).toBe(true);
    // Even without the message text, the XXYYZZ contracts give it away.
    expect(usableOptionRows({ data: samplePayload.data }, 'SPY')).toBeNull();
  });
  it('rejects contracts for a different symbol and empty chains', () => {
    expect(usableOptionRows(realChain('QQQ'), 'SPY')).toBeNull();
    expect(usableOptionRows({ data: [] }, 'SPY')).toBeNull();
    expect(usableOptionRows(null, 'SPY')).toBeNull();
  });
  it('accepts a real chain for the requested symbol', () => {
    expect(usableOptionRows(realChain('SPY'), 'spy')).toHaveLength(6);
    expect(isAlphaVantageSampleChain(realChain('SPY'))).toBe(false);
  });
});

describe('checkOptionsAccess (same rule as /api/me)', () => {
  const req = new Request('http://localhost/api/options-chain?symbol=SPY');
  it('logged out → 401', async () => {
    expect(await checkOptionsAccess(req)).toEqual({ ok: false, status: 401, reason: 'unauthenticated' });
  });
  it('free → 403', async () => {
    m.session = { cid: 'free_x@example.com', tier: 'free', workspaceId: 'w1', exp: 0 };
    expect(await checkOptionsAccess(req)).toEqual({ ok: false, status: 403, reason: 'paid_required' });
  });
  it.each(['pro', 'pro_trader'])('paid tier %s → allowed', async (tier) => {
    m.session = { cid: 'cus_1', tier, workspaceId: 'w1', exp: 0 };
    m.effectiveTier = tier;
    expect(await checkOptionsAccess(req)).toEqual({ ok: true, via: 'paid', tier, workspaceId: 'w1' });
  });
  it('admin/owner whose login cookie says free → allowed', async () => {
    m.session = { cid: 'free_owner@example.com', tier: 'free', workspaceId: 'w-owner', exp: 0 };
    m.admin = true;
    expect(await checkOptionsAccess(req)).toEqual({ ok: true, via: 'admin', tier: 'admin', workspaceId: 'w-owner' });
  });
});

describe('GET /api/options-chain', () => {
  const call = () => chainGET(new Request('http://localhost/api/options-chain?symbol=SPY') as any);

  it('a Pro subscriber is no longer refused as "requires Pro Trader"', async () => {
    m.session = { cid: 'cus_1', tier: 'pro', workspaceId: 'w1', exp: 0 };
    m.effectiveTier = 'pro';
    m.av = { REALTIME_OPTIONS: realChain(), GLOBAL_QUOTE: quote };
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.provider).toBe('REALTIME_OPTIONS');
  });

  it('free user → 403 without spending Alpha Vantage calls', async () => {
    m.session = { cid: 'free_x@example.com', tier: 'free', workspaceId: 'w1', exp: 0 };
    const res = await call();
    expect(res.status).toBe(403);
    expect(m.calls).toEqual([]);
  });

  it('realtime returns the artificial sample → falls back to HISTORICAL_OPTIONS (no fake 2099-99-99 chain)', async () => {
    m.session = { cid: 'cus_1', tier: 'pro', workspaceId: 'w1', exp: 0 };
    m.effectiveTier = 'pro';
    m.av = { REALTIME_OPTIONS: samplePayload, HISTORICAL_OPTIONS: realChain(), GLOBAL_QUOTE: quote };
    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.provider).toBe('HISTORICAL_OPTIONS');
    expect(body.expirations.map((e: { date: string }) => e.date)).toEqual(['2030-01-18']);
    expect(body.contracts.every((c: { contractId: string }) => !c.contractId.startsWith('XXYYZZ'))).toBe(true);
  });

  it('realtime answers an entitlement "Information" note → falls back to HISTORICAL_OPTIONS', async () => {
    m.admin = true;
    m.session = { cid: 'free_owner@example.com', tier: 'free', workspaceId: 'w-owner', exp: 0 };
    m.av = { REALTIME_OPTIONS: new Error('AV info error: premium endpoint'), HISTORICAL_OPTIONS: realChain(), GLOBAL_QUOTE: quote };
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).provider).toBe('HISTORICAL_OPTIONS');
  });

  it('when nothing is usable, says why per provider instead of a bare "no data"', async () => {
    m.admin = true;
    m.session = { cid: 'free_owner@example.com', tier: 'free', workspaceId: 'w-owner', exp: 0 };
    m.av = { REALTIME_OPTIONS: samplePayload, HISTORICAL_OPTIONS: new Error('AV info error: premium endpoint') };
    const res = await call();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.providerIssues).toHaveLength(2);
    expect(body.providerIssues[0]).toMatch(/REALTIME_OPTIONS: artificial sample/);
    expect(body.providerIssues[1]).toMatch(/HISTORICAL_OPTIONS: AV info error/);
    expect(JSON.stringify(body)).not.toMatch(/apikey/i);
  });
});

describe('GET /api/options-flow', () => {
  const call = () => flowGET(new NextRequest('http://localhost/api/options-flow?symbol=SPY'));

  it('Pro subscriber passes the gate; sample (not entitled) chain gets a clear 503, not fake flow', async () => {
    m.session = { cid: 'cus_1', tier: 'pro', workspaceId: 'w1', exp: 0 };
    m.effectiveTier = 'pro';
    m.av = { REALTIME_OPTIONS: samplePayload, GLOBAL_QUOTE: quote };
    const res = await call();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Realtime options data is not enabled on the Alpha Vantage API key/);
  });

  it('free user → 403', async () => {
    m.session = { cid: 'free_x@example.com', tier: 'free', workspaceId: 'w1', exp: 0 };
    expect((await call()).status).toBe(403);
  });
});

describe('Terminal UpgradeGate', () => {
  it('treats Pro and legacy Pro Trader as the same paid plan', () => {
    expect(hasPaidTier('pro')).toBe(true);
    expect(hasPaidTier('pro_trader')).toBe(true);
    expect(hasPaidTier('free')).toBe(false);
    expect(hasPaidTier('anonymous')).toBe(false);
  });
});
