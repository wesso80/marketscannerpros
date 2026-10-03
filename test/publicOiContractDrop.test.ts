import { expect, it, vi } from 'vitest';
import { stableOiObservation } from '@/lib/crypto/oiComparisons';

const now = Date.parse('2026-10-03T12:00:00Z');
const rows = [
  { market: 'A', symbol: 'BTCUSD', openInterest: 100, lastTradedAt: now / 1000 },
  { market: 'B', symbol: 'BTCUSDT', openInterest: 200, lastTradedAt: now / 1000 },
];
const state = vi.hoisted(() => ({ store: new Map<string, unknown>(), deadOnly: false }));

vi.mock('@/lib/coingecko', () => ({
  getDerivativesTickers: async () => {
    const tradedAt = Date.now() / 1000;
    if (state.deadOnly) return [];
    return [{ contract_type: 'perpetual', index_id: 'BTC', market: 'A', symbol: 'BTCUSD', open_interest: 100, last_traded_at: tradedAt }];
  },
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

const pinned = (contracts: Record<string, number>, at: number) => ({
  symbol: 'BTC', method: 'coingecko-major-perpetual-usd-v3', value: Object.values(contracts).reduce((a, b) => a + b, 0),
  observedAt: at, coverage: JSON.stringify(Object.keys(contracts).sort()), exchanges: Object.keys(contracts).length,
  contracts, contractObservedAt: Object.fromEntries(Object.keys(contracts).map((k) => [k, at])),
  carriedContracts: 0, expectedContracts: Object.keys(contracts).length,
});

it('drops an expired contract and keeps the ones still trading', () => {
  const first = stableOiObservation('BTC', rows, null, now)!;
  const later = now + 2 * 3_600_000;
  const next = stableOiObservation('BTC', [{ ...rows[0], openInterest: 110, lastTradedAt: later / 1000 }], first, later);
  expect(next).not.toBeNull();
  expect(next!.value).toBe(110);
  expect(next!.droppedContracts).toBe(1);
  expect(next!.carriedContracts).toBe(0);
  expect(next!.contracts[JSON.stringify(['B', 'BTCUSDT'])]).toBeUndefined();
});

it('rewrites the saved basket when a pinned contract stops trading', async () => {
  state.deadOnly = false;
  state.store.clear();
  const at = Date.now() - 2 * 3_600_000;
  const keyA = JSON.stringify(['A', 'BTCUSD']);
  const keyB = JSON.stringify(['B', 'BTCUSDT']);
  const prior = pinned({ [keyA]: 100, [keyB]: 200 }, at);
  state.store.set('oi:fixed-constituents:v1', [prior]);
  state.store.set('oi:fixed-basket:v1', [prior]);
  const { getOiEvidence } = await import('@/lib/crypto/oiHistory');
  const first = await getOiEvidence();
  expect(first.totalOpenInterest).toBe(100);
  expect(first.droppedContracts).toBeGreaterThanOrEqual(1);
  expect(first.coverage).toMatch(/removed|dropped/i);
  const saved = state.store.get('oi:fixed-constituents:v1') as Array<{ contracts: Record<string, number> }>;
  expect(saved[0].contracts[keyB]).toBeUndefined();
  expect(saved[0].contracts[keyA]).toBe(100);
  expect((await getOiEvidence()).totalOpenInterest).toBe(100);
});

it('clears a basket whose last contract stopped trading and rebuilds from the live feed', async () => {
  state.store.clear();
  const at = Date.now() - 2 * 3_600_000;
  const keyB = JSON.stringify(['B', 'BTCUSDT']);
  const prior = pinned({ [keyB]: 200 }, at);
  state.store.set('oi:fixed-constituents:v1', [prior]);
  state.store.set('oi:fixed-basket:v1', [prior]);
  state.deadOnly = true;
  const { getOiEvidence } = await import('@/lib/crypto/oiHistory');
  const cleared = await getOiEvidence();
  expect(cleared.totalOpenInterest).toBe(0);
  expect(cleared.droppedContracts).toBeGreaterThanOrEqual(1);
  expect(state.store.has('oi:fixed-constituents:v1')).toBe(false);
  expect(state.store.has('oi:fixed-basket:v1')).toBe(false);
  state.deadOnly = false;
  const rebuilt = await getOiEvidence();
  expect(rebuilt.totalOpenInterest).toBe(100);
  expect(state.store.has('oi:fixed-constituents:v1')).toBe(true);
});
