import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildOiObservation, HOUR_MS } from '@/lib/crypto/oiComparisons';

const state = vi.hoisted(() => ({ stored: new Map<string, unknown>(), writes: vi.fn(), tickers: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  getCached: async (key: string) => state.stored.get(key) ?? null,
  setCached: async (key: string, value: unknown, ttl: number) => { state.stored.set(key, value); state.writes(key, ttl); },
}));
vi.mock('@/lib/coingecko', () => ({ getDerivativesTickers: state.tickers }));
const start = Date.UTC(2026, 8, 21, 12);
const observation = (at: number, value: number, market = 'A') => buildOiObservation('BTC', [{ market, symbol: 'BTCUSDT', openInterest: value, lastTradedAt: at / 1000 }], at)!;

describe('versioned OI history', () => {
  beforeEach(() => { state.stored.clear(); state.writes.mockClear(); vi.resetModules(); });
  it('survives a restart and waits for a genuine 24h baseline', async () => {
    let tracker = await import('@/lib/crypto/oiHistory');
    expect((await tracker.trackOiHistory([observation(start, 100)], start))[0].change24h).toBeNull();
    vi.resetModules();
    tracker = await import('@/lib/crypto/oiHistory');
    expect((await tracker.trackOiHistory([observation(start + HOUR_MS, 200)], start + HOUR_MS))[0].change24h).toBeNull();
    expect((await tracker.trackOiHistory([observation(start + 24 * HOUR_MS, 110)], start + 24 * HOUR_MS))[0].change24h).toBeCloseTo(10);
    expect(state.writes).toHaveBeenCalledWith(expect.stringContaining('oi:observed-usd:v3:'), 48 * 3600);
  });
  it('ignores old anchors and refuses changed venue coverage', async () => {
    state.stored.set('oi:anchor:24h', { BTC: 1000 });
    const tracker = await import('@/lib/crypto/oiHistory');
    await tracker.trackOiHistory([observation(start, 100)], start);
    const result = await tracker.trackOiHistory([observation(start + 24 * HOUR_MS, 10, 'B')], start + 24 * HOUR_MS);
    expect(result[0].change24h).toBeNull();
  });
  it('reuses an identical observed snapshot without refreshing its observation time', async () => {
    const tracker = await import('@/lib/crypto/oiHistory');
    const input = [observation(start, 100)];
    const one = await tracker.trackOiHistory(input, start);
    const two = await tracker.trackOiHistory(input, start + 10_000);
    expect(two).toEqual(one);
    expect(two[0].observedAt).toBe(start);
    expect(state.writes).toHaveBeenCalledTimes(1);
  });
});
