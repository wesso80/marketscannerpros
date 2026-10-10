import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INVALID_INTRADAY_TTL_SEC,
  clearInvalidIntraday,
  fetchWithInvalidIntradayCache,
  invalidIntradayKey,
  resetInvalidIntradayCacheForTests,
  type InvalidIntradayRedis,
  type InvalidIntradayScan,
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
    const first = await fetchWithInvalidIntradayCache('co', fetchOnce, null, T0, { log });
    const second = await fetchWithInvalidIntradayCache('CO', fetchOnce, null, T0 + 60_000, { log });
    const after = await fetchWithInvalidIntradayCache('CO', fetchOnce, null, T0 + WEEK + 1, { log });

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

  it('does not remember Invalid API call when the same run did not get daily bars', async () => {
    const fetchOnce = invalidFetch();
    const first = await fetchWithInvalidIntradayCache('GTBIF', fetchOnce, null, T0, { rememberInvalid: false });
    const second = await fetchWithInvalidIntradayCache('GTBIF', fetchOnce, null, T0 + 1000, { rememberInvalid: false });
    expect(first.calls).toBe(1);
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.invalid).toBe(true);
    expect(second.calls).toBe(1);
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });

  it('tries again after another process deletes the redis key', async () => {
    const store = new Map<string, string>();
    const redis: InvalidIntradayRedis = {
      get: async (key) => store.get(key) ?? null,
      set: async (key, value) => { store.set(key, value); },
    };
    const fetchOnce = invalidFetch();
    await fetchWithInvalidIntradayCache('GTBIF', fetchOnce, redis, T0);
    expect(store.has(invalidIntradayKey('GTBIF'))).toBe(true);
    store.delete(invalidIntradayKey('GTBIF'));
    const again = await fetchWithInvalidIntradayCache('GTBIF', fetchOnce, redis, T0 + 1000);
    expect(again.calls).toBe(1);
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });

  it('clears one symbol or every av:invalid-intraday key', async () => {
    const store = new Map<string, string>();
    const redis: InvalidIntradayRedis & InvalidIntradayScan = {
      get: async (key) => store.get(key) ?? null,
      set: async (key, value) => { store.set(key, value); },
      del: async (key) => { store.delete(key); },
      scan: async (_cursor, opts) => {
        const prefix = opts.match.replace(/\*$/, '');
        return ['0', [...store.keys()].filter((key) => key.startsWith(prefix))];
      },
    };
    const fetchOnce = invalidFetch();
    await fetchWithInvalidIntradayCache('GTBIF', fetchOnce, redis, T0);
    await fetchWithInvalidIntradayCache('NVDA', fetchOnce, redis, T0);
    store.set('other:key', 'keep');
    expect(await clearInvalidIntraday(redis, { symbol: 'gtbif' })).toEqual(['av:invalid-intraday:GTBIF']);
    expect(store.has('av:invalid-intraday:GTBIF')).toBe(false);
    expect(store.has('av:invalid-intraday:NVDA')).toBe(true);
    const again = await fetchWithInvalidIntradayCache('GTBIF', fetchOnce, redis, T0 + 1000);
    expect(again.calls).toBe(1);
    expect((await clearInvalidIntraday(redis, { all: true })).sort()).toEqual(['av:invalid-intraday:GTBIF', 'av:invalid-intraday:NVDA']);
    expect([...store.keys()]).toEqual(['other:key']);
    const afterAll = await fetchWithInvalidIntradayCache('NVDA', fetchOnce, redis, T0 + 2000);
    expect(afterAll.calls).toBe(1);
  });
});
