import { expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => {
  process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
  return { spotStarted: false, cache: null as null | Record<string, unknown> };
});
vi.mock('@/lib/options/access', () => ({ checkOptionsAccess: async () => ({ ok: true }) }));
vi.mock('@/lib/redis', () => ({
  getCached: async () => m.cache,
  setCached: async (_key: string, value: Record<string, unknown>) => { m.cache = value; },
  CACHE_KEYS: { optionsChain: (symbol: string) => `all:${symbol}` },
  CACHE_TTL: { optionsChain: 120 },
}));
vi.mock('@/lib/avRateGovernor', () => ({
  avFetch: async () => {
    m.spotStarted = true;
    return { 'Global Quote': { '05. price': '100', '07. latest trading day': '2026-10-02' } };
  },
}));
vi.mock('@/lib/options/chainCache', () => ({
  describeChainSource: () => 'fixture',
  fetchSharedOptionsChain: async () => {
    expect(m.spotStarted).toBe(true);
    return {
      provider: 'HISTORICAL_OPTIONS',
      quoteBasis: 'previous_session',
      asOfDate: '2026-10-02',
      quoteCoverage: 1,
      rows: ['2026-10-05', '2026-10-09'].flatMap((expiration) => [
        { symbol: 'SPY', expiration, strike: '100', type: 'call', bid: '1', ask: '1.1', open_interest: '10' },
        { symbol: 'SPY', expiration, strike: '100', type: 'put', bid: '1', ask: '1.1', open_interest: '40' },
      ]),
    };
  },
}));
import { GET } from '@/app/api/options-chain/route';

function putCall(contracts: { type: string; openInterest: number; expiration: string }[]) {
  let calls = 0;
  let puts = 0;
  for (const opt of contracts) {
    if (opt.type === 'call') calls += opt.openInterest;
    else if (opt.type === 'put') puts += opt.openInterest;
  }
  return {
    calls,
    puts,
    ratio: calls ? puts / calls : 0,
    expiries: [...new Set(contracts.map((c) => c.expiration))].sort(),
  };
}

afterEach(() => {
  vi.useRealTimers();
  m.cache = null;
  m.spotStarted = false;
});

it('returns every current expiry for expiries=all and still trims the default chain', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-03T16:00:00Z'));
  const all = await (await GET(new NextRequest('https://fixture/api/options-chain?symbol=SPY&expiries=all'))).json();
  expect(all.success).toBe(true);
  expect(putCall(all.contracts)).toEqual({ calls: 20, puts: 80, ratio: 4, expiries: ['2026-10-05', '2026-10-09'] });
  expect(all.expirations).toHaveLength(2);
  const trimmed = await (await GET(new NextRequest('https://fixture/api/options-chain?symbol=SPY'))).json();
  expect(trimmed.contracts).toHaveLength(2);
  expect(trimmed.contracts.every((c: { expiration: string }) => c.expiration === '2026-10-05')).toBe(true);
  expect(trimmed.expirations).toHaveLength(2);
  expect(readFileSync('components/macro/MacroDashboard.tsx', 'utf8')).toContain('/api/options-chain?symbol=SPY&expiries=all');
});
