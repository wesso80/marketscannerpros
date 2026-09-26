/**
 * Stored daily bars are judged by their session, not their 00:00 UTC stamp: a daily series is current until the next
 * US session opens, so the Postgres layer serves the worker's bars instead of going back to Alpha Vantage ~23 h a day.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, calls: [] as unknown[][] }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async (sql: string, params: unknown[]) => { db.calls.push([sql, params]); return /FROM ohlcv_bars/.test(sql) ? db.rows.slice(0, Number(params[2])) : []; }) }));
vi.mock('@/lib/marketData/cache', () => ({ rGet: vi.fn(async () => null), rSet: vi.fn(async () => undefined), CK: { bars: (s: string, t: string) => `bars:${s}:${t}` } }));
vi.mock('@/lib/marketData/client', () => ({
  avFetchDailyBars: vi.fn(async () => ({ bars: [{ date: '2026-09-25', ts: Date.parse('2026-09-25T00:00:00Z'), open: 1, high: 1, low: 1, close: 1, volume: 1 }], fetchedAt: new Date().toISOString() })),
  avFetchIntradayBars: vi.fn(async () => null), avFetchQuote: vi.fn(), avFetchOverview: vi.fn(), avFetchEarnings: vi.fn(),
  avFetchOptionsChain: vi.fn(), avFetchNews: vi.fn(),
}));

import { dailySeriesAsOf } from '@/lib/marketData/store';
import { getBars } from '@/lib/marketData';
import * as client from '@/lib/marketData/client';
import { nextUsTradingDay, usSessionOpenMs } from '@/lib/time/usSession';

const at = (iso: string) => Date.parse(iso);
/** Stored rows, newest first (as the SELECT … ORDER BY ts DESC returns them). */
function stored(lastYmd: string, n: number) {
  const last = Date.parse(`${lastYmd}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => ({ ts: new Date(last - i * 86_400_000), open: '1', high: '2', low: '0.5', close: '1.5', volume: '100' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  db.rows = [];
  db.calls = [];
  vi.useRealTimers();
});

describe('US session helpers', () => {
  it('next trading day skips weekends and NYSE holidays; open is 09:30 ET in both EDT and EST', () => {
    expect(nextUsTradingDay('2026-09-25')).toBe('2026-09-28'); // Fri → Mon
    expect(nextUsTradingDay('2026-11-25')).toBe('2026-11-27'); // Thanksgiving 26 Nov
    expect(new Date(usSessionOpenMs('2026-09-28')).toISOString()).toBe('2026-09-28T13:30:00.000Z'); // EDT
    expect(new Date(usSessionOpenMs('2026-11-02')).toISOString()).toBe('2026-11-02T14:30:00.000Z'); // EST
  });
});

describe('dailySeriesAsOf', () => {
  it('a Friday bar is current all weekend and until Monday 09:30 ET', () => {
    for (const now of ['2026-09-25T21:00:00Z', '2026-09-26T12:00:00Z', '2026-09-27T23:00:00Z', '2026-09-28T13:29:00Z']) {
      expect(dailySeriesAsOf('2026-09-25', at(now))).toBe(new Date(at(now)).toISOString());
    }
  });
  it('starts ageing only once the next session is open without its bar', () => {
    expect(dailySeriesAsOf('2026-09-25', at('2026-09-28T15:00:00Z'))).toBe('2026-09-28T13:30:00.000Z');
  });
  it("today's in-progress bar keeps the series current through the session", () => {
    expect(dailySeriesAsOf('2026-09-28', at('2026-09-28T19:59:00Z'))).toBe('2026-09-28T19:59:00.000Z');
  });
});

describe('getBars(daily) reads through Postgres', () => {
  it('serves the stored 100-bar compact series on a Saturday instead of calling Alpha Vantage', async () => {
    vi.useFakeTimers({ now: at('2026-09-26T15:00:00Z'), toFake: ['Date'] });
    db.rows = stored('2026-09-25', 300);
    const env = await getBars('AAPL', 'daily');
    expect(env.fromCache).toBe('postgres');
    expect(env.data).toHaveLength(100); // same shape as TIME_SERIES_DAILY_ADJUSTED compact
    expect(env.freshness).toBe('real-time');
    expect(client.avFetchDailyBars).not.toHaveBeenCalled();
  });
  it('mid-session with only yesterday stored: stale after an hour → Alpha Vantage (unchanged)', async () => {
    vi.useFakeTimers({ now: at('2026-09-28T15:00:00Z'), toFake: ['Date'] });
    db.rows = stored('2026-09-25', 300);
    const env = await getBars('AAPL', 'daily');
    expect(env.fromCache).toBe('av');
    expect(client.avFetchDailyBars).toHaveBeenCalledTimes(1);
  });
  it('a short stored series (< 100 bars) still goes to Alpha Vantage', async () => {
    vi.useFakeTimers({ now: at('2026-09-26T15:00:00Z'), toFake: ['Date'] });
    db.rows = stored('2026-09-25', 40);
    const env = await getBars('NEWIPO', 'daily');
    expect(env.fromCache).toBe('av');
  });
  it('intraday freshness is unchanged (age from the bar timestamp)', async () => {
    vi.useFakeTimers({ now: at('2026-09-26T15:00:00Z'), toFake: ['Date'] });
    db.rows = stored('2026-09-25', 300);
    const env = await getBars('AAPL', '60min');
    expect(client.avFetchIntradayBars).toHaveBeenCalledTimes(1); // stored bar is a day old → live fetch attempted
    expect(env.missingFields).toContain('live-fetch-failed'); // (mock AV returns nothing → stale Postgres fallback)
  });
});
