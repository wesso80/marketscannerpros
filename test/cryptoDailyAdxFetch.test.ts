import { beforeEach, describe, expect, it, vi } from 'vitest';

const getOHLCRange = vi.hoisted(() => vi.fn());
const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@/lib/coingecko', async (orig) => ({ ...(await orig<typeof import('@/lib/coingecko')>()), getOHLCRange }));
vi.mock('@/lib/redis', async (orig) => ({
  ...(await orig<typeof import('@/lib/redis')>()),
  getCached: vi.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
  setCached: vi.fn(async (k: string, v: unknown) => { store.set(k, v); return true; }),
}));

import { fetchCryptoDailyAdx } from '@/lib/cryptoTrendMetrics';

const DAY = 86_400_000;
const now = Date.parse('2026-09-25T03:00:00Z');
const rows = Array.from({ length: 120 }, (_, i) => {
  const t = Date.parse('2026-09-25T00:00:00Z') - (119 - i) * DAY;
  const c = 100 + i * 2 + Math.sin(i) * 0.5;
  return [t, c - 1, c + 1, c - 1, c];
});

describe('fetchCryptoDailyAdx (RS-15)', () => {
  beforeEach(() => { store.clear(); getOHLCRange.mockReset(); });
  it('one daily OHLC call, then served from cache', async () => {
    getOHLCRange.mockResolvedValue(rows);
    const a = await fetchCryptoDailyAdx('solana', now);
    const b = await fetchCryptoDailyAdx('solana', now);
    expect(a).toBeGreaterThanOrEqual(25);
    expect(b).toBe(a);
    expect(getOHLCRange).toHaveBeenCalledTimes(1);
    expect(getOHLCRange.mock.calls[0][4]).toBe('daily');
  });
  it('a failed fetch returns undefined and is not cached', async () => {
    getOHLCRange.mockResolvedValueOnce(null).mockResolvedValueOnce(rows);
    expect(await fetchCryptoDailyAdx('solana', now)).toBeUndefined();
    expect(await fetchCryptoDailyAdx('solana', now)).toBeGreaterThanOrEqual(25);
    expect(getOHLCRange).toHaveBeenCalledTimes(2);
  });
  it('a thrown error fails soft', async () => {
    getOHLCRange.mockRejectedValue(new Error('429'));
    expect(await fetchCryptoDailyAdx('solana', now)).toBeUndefined();
  });
});
