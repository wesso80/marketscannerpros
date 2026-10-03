import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({ available: true, persist: true }));
vi.mock('@/lib/coingecko', () => ({
  getDerivativesTickers: async () => [{ contract_type: 'perpetual', index_id: 'BTC', market: 'A', symbol: 'BTCUSD', open_interest: 100, last_traded_at: Date.now() / 1000 }],
  getMarketData: async () => [],
  symbolToId: () => 'bitcoin',
  buildCoinGeckoResponseMeta: () => ({ provider: 'coingecko', lastUpdated: new Date().toISOString(), freshnessStatus: 'fresh' }),
}));
vi.mock('@/lib/redis', () => ({
  getRedis: () => state.available ? { get: async () => null, set: async () => 'OK', del: async () => 1 } : null,
  getCached: async () => null,
  setCached: async () => state.persist,
}));

it('returns the live open-interest snapshot when Redis is down', async () => {
  state.available = false;
  state.persist = false;
  const { GET } = await import('@/app/api/open-interest/route');
  const res = await GET(new NextRequest('https://test/api/open-interest'));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.total.openInterest).toBe(100);
  expect(body.status).toBe('degraded');
  expect(body.persistence).toBe('unavailable');
  expect(body.coverage).toMatch(/cache/i);
  expect(body.error).toBeUndefined();
});
