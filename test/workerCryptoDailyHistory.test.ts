/**
 * Worker crypto daily history: fetched once, then only the missing candle once per UTC day (CoinGecko budget).
 */
import { describe, expect, it, vi } from 'vitest';
import type { Bar } from '@/lib/scanner/barAggregation';
import {
  CryptoDailyHistoryCache,
  DAY_MS,
  DEFAULT_DAILY_HISTORY_CONFIG,
  expectedLatestDailyOpenMs,
  isDailyHistoryEntry,
  mergeDailyHistory,
  planDailyHistoryFetch,
  trimDailyWindow,
  type DailyHistoryEntry,
} from '@/lib/worker/cryptoDailyHistory';

const iso = (ms: number) => new Date(ms).toISOString();
const bar = (openMs: number, close = 100, volume: number | null = 1_000): Bar => ({ t: iso(openMs), open: close, high: close + 1, low: close - 1, close, volume });
/** Completed daily bars (opens) from `firstOpen` through `lastOpen` inclusive. */
const series = (firstOpen: number, lastOpen: number): Bar[] => {
  const out: Bar[] = [];
  for (let t = firstOpen; t <= lastOpen; t += DAY_MS) out.push(bar(t, 100 + out.length));
  return out;
};
const D = Date.parse('2026-09-27T00:00:00Z');

describe('expectedLatestDailyOpenMs', () => {
  it('expects the bar that closed at 00:00 UTC only after the settle time', () => {
    const settle = 40 * 60_000;
    expect(expectedLatestDailyOpenMs(D + 20 * 60_000, settle)).toBe(D - 2 * DAY_MS); // 00:20: yesterday's candle not published yet
    expect(expectedLatestDailyOpenMs(D + 45 * 60_000, settle)).toBe(D - DAY_MS); // 00:45: yesterday's candle expected
    expect(expectedLatestDailyOpenMs(D + 23 * 3_600_000, settle)).toBe(D - DAY_MS);
  });
});

describe('planDailyHistoryFetch', () => {
  const cfg = DEFAULT_DAILY_HISTORY_CONFIG;
  const entry = (lastOpen: number, over: Partial<DailyHistoryEntry> = {}): DailyHistoryEntry => ({
    coinId: 'bitcoin', bars: series(lastOpen - 10 * DAY_MS, lastOpen), fullAt: D - DAY_MS, checkedAt: D - DAY_MS, ...over,
  });
  it('full when nothing is held', () => {
    expect(planDailyHistoryFetch(null, D, cfg)).toBe('full');
    expect(planDailyHistoryFetch({ coinId: 'bitcoin', bars: [], fullAt: 0, checkedAt: 0 }, D, cfg)).toBe('full');
  });
  it('none while the newest expected candle is held (all day, every tier refresh)', () => {
    for (let h = 1; h < 24; h++) expect(planDailyHistoryFetch(entry(D - DAY_MS), D + h * 3_600_000, cfg)).toBe('none');
  });
  it('incremental once the next candle is due, spaced by retryMs while CoinGecko has not published it', () => {
    const now = D + DAY_MS + 45 * 60_000; // next day 00:45
    expect(planDailyHistoryFetch(entry(D - DAY_MS), now, cfg)).toBe('incremental');
    expect(planDailyHistoryFetch(entry(D - DAY_MS, { checkedAt: now - 5 * 60_000 }), now, cfg)).toBe('none');
    expect(planDailyHistoryFetch(entry(D - DAY_MS, { checkedAt: now - 16 * 60_000 }), now, cfg)).toBe('incremental');
  });
  it('full re-sync after fullResyncMs (spaced by retryMs after a failed attempt) and for a gap too long for one window', () => {
    expect(planDailyHistoryFetch(entry(D - DAY_MS, { fullAt: D - 8 * DAY_MS }), D + 3_600_000, cfg)).toBe('full');
    expect(planDailyHistoryFetch(entry(D - DAY_MS, { fullAt: D - 8 * DAY_MS, checkedAt: D + 3_590_000 }), D + 3_600_000, cfg)).toBe('none');
    expect(planDailyHistoryFetch(entry(D - 200 * DAY_MS, { fullAt: D }), D + 3_600_000, cfg)).toBe('full');
  });
});

describe('trimDailyWindow / mergeDailyHistory', () => {
  it('keeps the same 360-bar window a fresh full fetch returns', () => {
    const now = D + 5 * 3_600_000;
    const bars = trimDailyWindow(series(D - 400 * DAY_MS, D - DAY_MS), now);
    expect(bars.length).toBe(360);
    expect(bars[0].t).toBe(iso(D - 360 * DAY_MS));
    expect(bars.at(-1)!.t).toBe(iso(D - DAY_MS));
  });
  it('adds the new candle, lets re-read overlap bars win, re-attaches volumes and drops the oldest day', () => {
    const now = D + DAY_MS + 3_600_000;
    const held = series(D - 360 * DAY_MS, D - DAY_MS);
    const revised = { ...bar(D - DAY_MS, 555), volume: null };
    const fresh = bar(D, 777, null);
    const volumes: Array<[number, number]> = [[D + DAY_MS, 42]]; // 24h volume ending at the new bar's close
    const merged = mergeDailyHistory(held, [revised, fresh], volumes, now);
    expect(merged.length).toBe(360);
    expect(merged[0].t).toBe(iso(D - 359 * DAY_MS));
    expect(merged.at(-2)!.close).toBe(555);
    expect(merged.at(-1)).toMatchObject({ t: iso(D), close: 777, volume: 42 });
  });
});

describe('CryptoDailyHistoryCache', () => {
  function harness(start: number) {
    let now = start;
    const persisted = new Map<string, unknown>();
    const fetchFull = vi.fn(async (_s: string, _id: string, nowMs: number) => ({
      bars: series(Math.floor(nowMs / DAY_MS) * DAY_MS - 360 * DAY_MS, expectedLatestDailyOpenMs(nowMs, 0)), warnings: [],
    }));
    let publishedThrough = expectedLatestDailyOpenMs(start, 0);
    const fetchIncrement = vi.fn(async (_id: string, since: number) => ({
      bars: since <= publishedThrough ? series(since - 2 * DAY_MS, publishedThrough) : [], volumes: [] as Array<[number, number]>, warnings: [],
    }));
    const cache = new CryptoDailyHistoryCache({
      fetchFull, fetchIncrement, now: () => now,
      load: async (id) => persisted.get(id), save: async (e) => { persisted.set(e.coinId, JSON.parse(JSON.stringify(e))); },
    });
    return {
      cache, fetchFull, fetchIncrement, persisted,
      at: (ms: number) => { now = ms; }, publish: (openMs: number) => { publishedThrough = openMs; },
    };
  }

  it('one full read, then 0 CoinGecko calls on every tier refresh until the next candle, then one 2-call increment', async () => {
    const h = harness(D + 3_600_000);
    let calls = 0;
    const first = await h.cache.getBars('BTC', 'bitcoin');
    calls += first.calls;
    expect(first).toMatchObject({ plan: 'full', calls: 3, changed: true });
    expect(first.bars.length).toBe(360);
    // Tier-1 cadence (every 10 min) for the rest of the UTC day: no calls.
    for (let t = D + 3_600_000 + 600_000; t < D + DAY_MS; t += 600_000) {
      h.at(t);
      const r = await h.cache.getBars('BTC', 'bitcoin');
      calls += r.calls;
      expect(r.plan).toBe('none');
    }
    // 00:10 next day: candle not expected yet; 00:45: CoinGecko has not published → one attempt, then spaced retries.
    h.at(D + DAY_MS + 10 * 60_000);
    expect((await h.cache.getBars('BTC', 'bitcoin')).plan).toBe('none');
    h.at(D + DAY_MS + 45 * 60_000);
    const early = await h.cache.getBars('BTC', 'bitcoin');
    calls += early.calls;
    expect(early).toMatchObject({ plan: 'incremental', calls: 2 });
    expect(early.bars.at(-1)!.t).toBe(iso(D - DAY_MS));
    h.at(D + DAY_MS + 55 * 60_000);
    expect((await h.cache.getBars('BTC', 'bitcoin')).plan).toBe('none');
    // Published; the next attempt (≥ 15 min later) picks it up.
    h.publish(D);
    h.at(D + DAY_MS + 61 * 60_000);
    const got = await h.cache.getBars('BTC', 'bitcoin');
    calls += got.calls;
    expect(got).toMatchObject({ plan: 'incremental', calls: 2, changed: true });
    expect(got.bars.length).toBe(360);
    expect(got.bars.at(-1)!.t).toBe(iso(D));
    expect(h.fetchFull).toHaveBeenCalledTimes(1);
    expect(calls).toBe(3 + 2 + 2); // was ~4 calls × 144 tier-1 refreshes a day
  });

  it('bars match a fresh full fetch after the increment (same window, same data)', async () => {
    const h = harness(D + 3_600_000);
    await h.cache.getBars('BTC', 'bitcoin');
    h.publish(D);
    h.at(D + DAY_MS + 2 * 3_600_000);
    const inc = await h.cache.getBars('BTC', 'bitcoin');
    const full = await h.fetchFull('BTC', 'bitcoin', D + DAY_MS + 2 * 3_600_000);
    expect(inc.bars.map((b) => b.t)).toEqual(full.bars.map((b) => b.t));
  });

  it('restores the held history from persistence after a restart instead of refetching 360 days', async () => {
    const h = harness(D + 3_600_000);
    await h.cache.getBars('BTC', 'bitcoin');
    const restarted = new CryptoDailyHistoryCache({
      fetchFull: h.fetchFull, fetchIncrement: h.fetchIncrement, now: () => D + 2 * 3_600_000,
      load: async (id) => h.persisted.get(id),
    });
    const r = await restarted.getBars('BTC', 'bitcoin');
    expect(r).toMatchObject({ plan: 'none', calls: 0 });
    expect(r.bars.length).toBe(360);
    expect(h.fetchFull).toHaveBeenCalledTimes(1);
    expect(isDailyHistoryEntry(h.persisted.get('bitcoin'))).toBe(true);
    expect(isDailyHistoryEntry({ coinId: 'x', bars: [{ t: 'a', open: Number.NaN }], fullAt: 1, checkedAt: 1 })).toBe(false);
  });

  it('keeps serving the held history when an increment fails, and retries after retryMs', async () => {
    const h = harness(D + 3_600_000);
    await h.cache.getBars('BTC', 'bitcoin');
    h.fetchIncrement.mockRejectedValueOnce(new Error('CoinGecko 500'));
    h.at(D + DAY_MS + 3_600_000);
    const failed = await h.cache.getBars('BTC', 'bitcoin');
    expect(failed.bars.length).toBe(359); // one candle behind: window moved on, the new candle is not in yet
    expect(failed.bars.at(-1)!.t).toBe(iso(D - DAY_MS));
    expect(failed.changed).toBe(false);
    h.at(D + DAY_MS + 3_600_000 + 5 * 60_000);
    expect((await h.cache.getBars('BTC', 'bitcoin')).calls).toBe(0);
    h.publish(D);
    h.at(D + DAY_MS + 3_600_000 + 16 * 60_000);
    expect((await h.cache.getBars('BTC', 'bitcoin')).bars.at(-1)!.t).toBe(iso(D));
  });

  it('falls back to a full fetch when the increment reports the gap is too long', async () => {
    const h = harness(D + 3_600_000);
    await h.cache.getBars('BTC', 'bitcoin');
    h.fetchIncrement.mockResolvedValueOnce(null);
    h.at(D + DAY_MS + 3_600_000);
    const r = await h.cache.getBars('BTC', 'bitcoin');
    expect(r.plan).toBe('full');
    expect(h.fetchFull).toHaveBeenCalledTimes(2);
  });

  it('throws only when nothing is held and the full fetch fails (worker marks the symbol no-data as before)', async () => {
    const cache = new CryptoDailyHistoryCache({
      fetchFull: async () => { throw new Error('down'); }, fetchIncrement: async () => null, now: () => D,
    });
    await expect(cache.getBars('BTC', 'bitcoin')).rejects.toThrow('down');
  });
});
