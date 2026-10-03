import { expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ store: new Map<string, unknown>(), tickers: null as unknown[] | null }));
vi.mock('@/lib/coingecko', () => ({
  getDerivativesTickers: async () => state.tickers,
}));
vi.mock('@/lib/redis', () => ({
  getRedis: () => ({
    get: async (k: string) => state.store.get(k) ?? null,
    set: async (k: string, v: unknown, opts?: { nx?: boolean }) => {
      if (!opts?.nx || !state.store.has(k)) state.store.set(k, v);
      return 'OK';
    },
    del: async (...keys: string[]) => { for (const k of keys) state.store.delete(k); return keys.length; },
  }),
  getCached: async () => null,
  setCached: async () => true,
}));

it('keeps the pinned basket when the derivatives feed returns null', async () => {
  state.tickers = null;
  state.store.clear();
  const at = Date.now() - 2 * 3_600_000;
  const key = JSON.stringify(['A', 'BTCUSD']);
  const prior = {
    symbol: 'BTC', method: 'coingecko-major-perpetual-usd-v3', value: 250, observedAt: at,
    coverage: JSON.stringify([key]), exchanges: 1,
    contracts: { [key]: 250 }, contractObservedAt: { [key]: at },
    carriedContracts: 0, expectedContracts: 1, droppedContracts: 0,
  };
  state.store.set('oi:fixed-constituents:v1', [prior]);
  state.store.set('oi:fixed-basket:v1', [prior]);
  const before = JSON.stringify([...state.store.entries()]);
  const { getOiEvidence } = await import('@/lib/crypto/oiHistory');
  const result = await getOiEvidence();
  expect(result.totalOpenInterest).toBe(250);
  expect(result.droppedContracts).toBe(0);
  expect(JSON.stringify([...state.store.entries()])).toBe(before);
});
