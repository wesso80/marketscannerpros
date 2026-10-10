import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INVALID_INTRADAY_TTL_SEC,
  fetchWithInvalidIntradayCache,
  invalidIntradayKey,
  resetInvalidIntradayCacheForTests,
  type InvalidIntradayRedis,
} from '@/lib/worker/invalidIntraday';

const T0 = Date.parse('2026-10-10T15:00:00Z');
const WEEK = INVALID_INTRADAY_TTL_SEC * 1000;

function invalidFetch() {
  return vi.fn(async () => {
    throw new Error('AV error: Invalid API call. Please retry or visit the documentation for TIME_SERIES_INTRADAY.');
  });
}

afterEach(() => {
  resetInvalidIntradayCacheForTests();
});

describe('invalid intraday negative cache', () => {
  it('calls once, skips until the entry expires, then calls again', async () => {
    const fetchOnce = invalidFetch();
    const log = vi.fn();
    const first = await fetchWithInvalidIntradayCache('co', fetchOnce, null, T0, log);
    const second = await fetchWithInvalidIntradayCache('CO', fetchOnce, null, T0 + 60_000, log);
    const after = await fetchWithInvalidIntradayCache('CO', fetchOnce, null, T0 + WEEK + 1, log);

    expect(first.calls).toBe(1);
    expect(first.ok).toBe(false);
    expect(second.calls).toBe(0);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.skipped).toBe(true);
    expect(after.calls).toBe(1);
    expect(fetchOnce).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0]).toContain('av:invalid-intraday:CO');
    expect(log.mock.calls[0][0]).toContain('Invalid API call');
  });

  it('keeps the skip in memory when Redis set throws', async () => {
    const fetchOnce = invalidFetch();
    const redis: InvalidIntradayRedis = {
      get: vi.fn(async () => {
        throw new Error('redis down');
      }),
      set: vi.fn(async () => {
        throw new Error('redis down');
      }),
    };
    await fetchWithInvalidIntradayCache('ME', fetchOnce, redis, T0);
    const next = await fetchWithInvalidIntradayCache('ME', fetchOnce, redis, T0 + 1000);
    expect(fetchOnce).toHaveBeenCalledTimes(1);
    expect(next.calls).toBe(0);
  });

  it('writes av:invalid-intraday:<SYMBOL> with a 7 day TTL and reads it back', async () => {
    const store = new Map<string, { value: string; ex: number }>();
    const redis: InvalidIntradayRedis = {
      get: async (key) => store.get(key)?.value ?? null,
      set: async (key, value, opts) => {
        store.set(key, { value, ex: opts.ex });
      },
    };
    const fetchOnce = invalidFetch();
    await fetchWithInvalidIntradayCache('gtbif', fetchOnce, redis, T0);
    expect(store.get(invalidIntradayKey('GTBIF'))).toEqual({ value: String(T0 + WEEK), ex: INVALID_INTRADAY_TTL_SEC });

    resetInvalidIntradayCacheForTests();
    const skipped = await fetchWithInvalidIntradayCache('GTBIF', fetchOnce, redis, T0 + 1000);
    expect(skipped.calls).toBe(0);
    expect(fetchOnce).toHaveBeenCalledTimes(1);

    resetInvalidIntradayCacheForTests();
    const again = await fetchWithInvalidIntradayCache('GTBIF', fetchOnce, redis, T0 + WEEK + 1);
    expect(again.calls).toBe(1);
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });

  it('does not cache a rate-limit error', async () => {
    const fetchOnce = vi.fn(async () => {
      throw new Error('AV limit: Thank you for using Alpha Vantage');
    });
    await fetchWithInvalidIntradayCache('AAPL', fetchOnce, null, T0);
    await fetchWithInvalidIntradayCache('AAPL', fetchOnce, null, T0 + 1000);
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });
});
