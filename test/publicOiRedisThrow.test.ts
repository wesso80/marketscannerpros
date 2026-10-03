import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/coingecko', () => ({
  getDerivativesTickers: async () => [{ contract_type: 'perpetual', index_id: 'BTC', market: 'A', symbol: 'BTCUSD', open_interest: 100, last_traded_at: Date.now() / 1000 }],
  getMarketData: async () => [],
  symbolToId: () => 'bitcoin',
  buildCoinGeckoResponseMeta: () => ({ provider: 'coingecko', lastUpdated: new Date().toISOString(), freshnessStatus: 'fresh' }),
}));
vi.mock('@/lib/redis', () => ({
  getRedis: () => ({
    get: async () => { throw new Error('upstash unreachable'); },
    set: async () => { throw new Error('upstash unreachable'); },
    del: async () => { throw new Error('upstash unreachable'); },
  }),
  getCached: async () => null,
  setCached: async () => false,
}));

it('returns 200 degraded when the Redis client throws', async () => {
  const { GET } = await import('@/app/api/open-interest/route');
  const res = await GET(new NextRequest('https://test/api/open-interest'));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.total.openInterest).toBe(100);
  expect(body.status).toBe('degraded');
  expect(body.persistence).toBe('unavailable');
  expect(body.error).toBeUndefined();
});
