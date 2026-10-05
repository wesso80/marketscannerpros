import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({ persist: false }));
vi.mock('@/lib/adminAuth', () => ({ verifyCronAuth: () => true }));
vi.mock('@/lib/coingecko', () => ({
  getDerivativesTickers: async () => [{
    contract_type: 'perpetual', index_id: 'BTC', market: 'A', symbol: 'BTCUSD',
    open_interest: 100, last_traded_at: Date.now() / 1000,
  }],
}));
vi.mock('@/lib/redis', () => ({
  getRedis: () => ({ get: async () => null, set: async () => 'OK', del: async () => 1 }),
  getCached: async () => null,
  setCached: async () => state.persist,
}));

beforeEach(() => { vi.resetModules(); });

it('a failed Redis write returns persisted false', async () => {
  state.persist = false;
  const { POST } = await import('@/app/api/jobs/snapshot-open-interest/route');
  const res = await POST(new NextRequest('http://localhost/api/jobs/snapshot-open-interest', { method: 'POST' }));
  const body = await res.json();
  expect(res.status).toBe(500);
  expect(body.persisted).toBe(false);
  expect(body.success).toBe(false);
});

it('a successful Redis write returns persisted true', async () => {
  state.persist = true;
  const { POST } = await import('@/app/api/jobs/snapshot-open-interest/route');
  const res = await POST(new NextRequest('http://localhost/api/jobs/snapshot-open-interest', { method: 'POST' }));
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.persisted).toBe(true);
});
