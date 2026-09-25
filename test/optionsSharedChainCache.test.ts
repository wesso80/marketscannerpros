/**
 * Fix 4: the Options Terminal (/api/options-chain) and Options Scanner (/api/options-scan) wrote different shapes
 * under the same Redis key `opt:chain:SYM`, and one scanner view downloaded the same chain 2-3 times
 * (analyzer + strike picker + expiry dropdown), Golden Egg never cached at all. Now every whole-chain consumer
 * shares one short-TTL cache under its own key `opt:raw:SYM`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  process.env.ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'test-key';
  return { av: {} as Record<string, unknown>, calls: [] as string[], redisSets: [] as string[] };
});
vi.mock('@/lib/redis', async (orig) => {
  const real = await orig<typeof import('@/lib/redis')>();
  return { ...real, getCached: vi.fn(async () => null), setCached: vi.fn(async (key: string) => { m.redisSets.push(key); return true; }) };
});
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'w1', cid: 'c', tier: 'pro' })) }));
vi.mock('@/lib/avRateGovernor', () => ({
  avTakeToken: vi.fn(async () => undefined),
  avFetch: vi.fn(async (url: string) => {
    const fn = new URL(url).searchParams.get('function') || '';
    m.calls.push(`${fn}${new URL(url).searchParams.get('require_greeks') ? '+greeks' : ''}`);
    const v = m.av[fn];
    if (v instanceof Error) throw v;
    return v ?? null;
  }),
}));

import { CACHE_KEYS } from '../lib/redis';
import { clearSharedOptionsChainCache, fetchSharedOptionsChain, optionsRawChainKey } from '../lib/options/chainCache';
import { avFetch } from '../lib/avRateGovernor';
import { fetchOptionsSnapshot } from '../lib/goldenEggFetchers';
import { GET as expirationsGET } from '../app/api/options/expirations/route';

function row(symbol: string, type: 'call' | 'put', strike: number, expiration = '2030-01-18') {
  return {
    contractID: `${symbol}300118${type === 'call' ? 'C' : 'P'}${strike}`, symbol, expiration, strike: strike.toFixed(2), type,
    mark: '5.00', bid: '4.90', ask: '5.10', volume: '100', open_interest: '1500', date: '2026-09-25',
    implied_volatility: '0.22', delta: type === 'call' ? '0.5' : '-0.5', gamma: '0.01',
  };
}
const realChain = (symbol = 'SPY') => ({ message: 'success', data: [490, 500, 510].flatMap((k) => [row(symbol, 'call', k), row(symbol, 'put', k)]) });
const sample = { message: 'This is a premium endpoint. ***THE SAMPLE DATA SCHEMA BELOW IS ARTIFICIAL***', data: [row('XXYYZZ', 'call', 20, '2099-99-99')] };
const viaAvFetch = { apiKey: 'test-key', fetchPayload: (fn: string, url: string) => (avFetch as any)(url, fn) };

beforeEach(() => {
  m.av = {}; m.calls = []; m.redisSets = [];
  clearSharedOptionsChainCache();
});

describe('shared options chain cache', () => {
  it('uses its own Redis key, distinct from the Options Terminal key', () => {
    expect(optionsRawChainKey('spy')).toBe('opt:raw:SPY');
    expect(optionsRawChainKey('SPY')).not.toBe(CACHE_KEYS.optionsChain('SPY'));
  });

  it('second consumer within the TTL costs zero Alpha Vantage calls; rows always carry greeks', async () => {
    m.av = { REALTIME_OPTIONS_FMV: realChain() };
    const a = await fetchSharedOptionsChain('SPY', viaAvFetch as any);
    const b = await fetchSharedOptionsChain('spy', viaAvFetch as any);
    expect(a?.rows).toHaveLength(6);
    expect(a?.cacheHit).toBe(false);
    expect(b?.cacheHit).toBe(true);
    expect(b?.provider).toBe('REALTIME_OPTIONS_FMV');
    expect(m.calls).toEqual(['REALTIME_OPTIONS_FMV+greeks']);
    expect(m.redisSets).toEqual(['opt:raw:SPY']);
  });

  it('concurrent requests share one download', async () => {
    m.av = { REALTIME_OPTIONS_FMV: realChain() };
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => fetchSharedOptionsChain('SPY', viaAvFetch as any)));
    expect([a, b, c].every((r) => r?.rows.length === 6)).toBe(true);
    expect(m.calls).toEqual(['REALTIME_OPTIONS_FMV+greeks']);
  });

  it('never caches the artificial sample chain; falls through to HISTORICAL_OPTIONS', async () => {
    m.av = { REALTIME_OPTIONS_FMV: sample, HISTORICAL_OPTIONS: realChain() };
    const r = await fetchSharedOptionsChain('SPY', viaAvFetch as any);
    expect(r?.provider).toBe('HISTORICAL_OPTIONS');
    expect(r?.rows.every((x: any) => x.symbol === 'SPY')).toBe(true);
    m.av = {};
    clearSharedOptionsChainCache();
    expect(await fetchSharedOptionsChain('SPY', viaAvFetch as any)).toBeNull();
  });

  it('Golden Egg reuses a chain another options tool just downloaded (no extra call)', async () => {
    m.av = { REALTIME_OPTIONS_FMV: realChain() };
    await fetchSharedOptionsChain('SPY', viaAvFetch as any);
    m.calls = [];
    const snap = await fetchOptionsSnapshot('SPY', 500);
    expect(snap).not.toBeNull();
    expect(m.calls).toEqual([]);
  });

  it('expiry dropdown and the scan that follows share one chain download', async () => {
    m.av = { REALTIME_OPTIONS_FMV: realChain() };
    const res = await expirationsGET(new Request('http://localhost/api/options/expirations?symbol=SPY') as any);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.expirations.map((e: { date: string }) => e.date)).toEqual(['2030-01-18']);
    expect(body.sourceFunction).toBe('REALTIME_OPTIONS_FMV');
    await fetchOptionsSnapshot('SPY', 500);
    await expirationsGET(new Request('http://localhost/api/options/expirations?symbol=SPY') as any);
    expect(m.calls).toEqual(['REALTIME_OPTIONS_FMV+greeks']);
  });
});
