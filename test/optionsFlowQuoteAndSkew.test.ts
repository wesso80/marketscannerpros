/**
 * Fix 3: Options Flow priced moneyness/ATM off an end-of-day stock quote (GLOBAL_QUOTE without
 * entitlement=realtime), and normal equity put skew was always labelled "bearish hedging".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => {
  process.env.ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'test-key';
  return { av: {} as Record<string, unknown>, urls: [] as string[] };
});
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ cid: 'cus_1', tier: 'pro', workspaceId: 'w1', exp: 0 })) }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => ({ ok: false })) }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async () => []) }));
vi.mock('@/lib/entitlements', async (orig) => {
  const real = await orig<typeof import('@/lib/entitlements')>();
  return { ...real, getEffectiveTier: vi.fn(async () => 'pro') };
});
vi.mock('@/lib/redis', () => ({ getCached: vi.fn(async () => null), setCached: vi.fn(async () => undefined), CACHE_KEYS: {}, CACHE_TTL: {} }));
vi.mock('@/lib/avRateGovernor', () => ({
  avTakeToken: vi.fn(async () => undefined),
  avFetch: vi.fn(async (url: string) => {
    m.urls.push(url);
    return m.av[new URL(url).searchParams.get('function') || ''] ?? null;
  }),
}));

import { GET as flowGET } from '../app/api/options-flow/route';
import { classifySkew } from '../lib/options-flow-classifier';

const EXP = '2030-01-18';
// Typical equity smile: OTM puts richer than OTM calls.
function contract(type: 'call' | 'put', k: number) {
  const iv = type === 'put' ? 0.27 + Math.max(0, 100 - k) * 0.003 : 0.27 - Math.max(0, k - 100) * 0.001;
  return {
    contractID: `XYZ300118${type === 'call' ? 'C' : 'P'}${k}`, symbol: 'XYZ', expiration: EXP, strike: k.toFixed(2), type,
    last: '2.00', mark: '2.00', bid: '1.95', ask: '2.05', volume: '300', open_interest: '1000', date: '2026-09-25',
    implied_volatility: iv.toFixed(4), delta: type === 'call' ? '0.4' : '-0.4', gamma: '0.02',
  };
}
const strikes = Array.from({ length: 21 }, (_, i) => 80 + i * 2);
const realtimeChain = { message: 'success', data: strikes.flatMap((k) => [contract('call', k), contract('put', k)]) };

beforeEach(() => { m.av = {}; m.urls = []; });

describe('Options Flow spot quote', () => {
  it('requests the realtime quote (entitlement=realtime) and accepts the delayed-quote key', async () => {
    m.av = { REALTIME_OPTIONS: realtimeChain, GLOBAL_QUOTE: { 'Global Quote - DATA DELAYED BY 15 MINUTES': { '05. price': '100.00', '10. change percent': '1.5%' } } };
    const res = await flowGET(new NextRequest('http://localhost/api/options-flow?symbol=XYZ'));
    const body = await res.json();
    expect(res.status).toBe(200);
    const quoteUrl = m.urls.find((u) => u.includes('function=GLOBAL_QUOTE'))!;
    expect(new URL(quoteUrl).searchParams.get('entitlement')).toBe('realtime');
    expect(body.currentPrice).toBe(100);
    expect(body.changePct).toBe(1.5);
    // Normal put skew is labelled as such — not "bearish hedging".
    expect(body.ivSkew.skew).toBeGreaterThan(0.03); // the old fixed threshold would have said bearish
    expect(body.ivSkew.skewSignal).toBe('normal_put_skew');
  });
});

describe('classifySkew (relative to ATM IV, descriptive only)', () => {
  it('labels skew by size relative to ATM IV', () => {
    expect(classifySkew(0.06, 0.25)).toBe('normal_put_skew');   // +24% of ATM IV
    expect(classifySkew(0.15, 0.25)).toBe('steep_put_skew');    // +60%
    expect(classifySkew(0.005, 0.25)).toBe('flat');
    expect(classifySkew(-0.03, 0.25)).toBe('call_skew');
    expect(classifySkew(0.05, 0)).toBe('flat');                 // no ATM IV → no call
  });
});
