import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AV_BULK_QUOTE_BATCH,
  chunkSymbols,
  isDailyRefreshDue,
  isHourlyRefreshDue,
  type BarFetchState,
} from '@/lib/worker/equityBulk';

const src = readFileSync('worker/ingest-data.ts', 'utf8');
const between = (from: string, to: string) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + from.length);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
};

describe('worker equities wiring (source guard)', () => {
  const processEquity = between('async function processEquitySymbol(', 'async function processCryptoSymbol(');
  const cycle = between('async function runIngestionCycle(', 'async function main(');

  it('quotes come from one REALTIME_BULK_QUOTES call per 100 symbols per cycle, entitlement=realtime', () => {
    expect(cycle).toContain('chunkSymbols(bulkSymbols)');
    expect(cycle).toContain('await fetchAVBulkQuotes(batch)');
    expect(cycle).toContain('upsertEquityQuotesBatch(bulkQuotes)');
    const fetcher = between('async function fetchAVBulkQuotes(', '/**\n * Fetch crypto OHLC');
    expect(fetcher).toContain('function=REALTIME_BULK_QUOTES');
    expect(fetcher).toContain('entitlement=realtime');
    expect(fetcher).toContain('getRateLimiter().take(1)');
  });

  it('GLOBAL_QUOTE is only a fallback for symbols the bulk call did not return', () => {
    const calls = processEquity.match(/fetchAVGlobalQuote\(/g) ?? [];
    expect(calls).toHaveLength(1);
    const fallback = processEquity.indexOf('} else if (ctx.quotesAllowed) {');
    expect(fallback).toBeGreaterThan(-1);
    expect(processEquity.indexOf('fetchAVGlobalQuote(')).toBeGreaterThan(fallback);
  });

  it('daily history and 60min are refetched only when their bar-close planner says so', () => {
    const daily = processEquity.indexOf("fetchAVTimeSeries(symbol, 'daily', 'compact')");
    const hourly = processEquity.indexOf("fetchAVTimeSeries(symbol, '60min', 'compact')");
    expect(processEquity.lastIndexOf('isDailyRefreshDue(hold.daily?.state, nowMs, cfg)', daily)).toBeGreaterThan(-1);
    expect(processEquity.lastIndexOf('isHourlyRefreshDue(hold.hourly, nowMs, cfg)', hourly)).toBeGreaterThan(-1);
    expect(processEquity).toContain('buildLiveDailyBar(quote, liveSession)');
    expect(processEquity).toContain('mergeLiveDailyBar(heldBars, liveBar)');
  });

  it('keeps the worker AV limiter at or below 200 rpm (limiter and startup log)', () => {
    const limiter = between('function getRateLimiter(): TokenBucket {', 'return rateLimiter;');
    expect(limiter).toContain("workerAvRpm(getEnv('ALPHA_VANTAGE_RPM'))");
    expect(src).not.toMatch(/ALPHA_VANTAGE_RPM'\) \|\| '500'/);
    expect(src).not.toMatch(/ALPHA_VANTAGE_RPM'\) \|\| '200'/);
  });

  it('writes the same quotes_latest columns as the per-symbol upsert', () => {
    const cols = '(symbol, price, open, high, low, prev_close, volume, change_amount, change_percent, latest_trading_day, fetched_at)';
    expect(between('async function upsertQuote(', 'async function upsertEquityQuotesBatch(')).toContain(cols);
    expect(between('async function upsertEquityQuotesBatch(', 'async function upsertBars(')).toContain(cols);
  });
});

describe('AV budget estimate (one simulated trading day, Fri 2026-09-25, 65 equities)', () => {
  it('bulk quotes + bar-close refreshes stay under ~1.9k calls (was ~40.5k)', () => {
    const symbols = Array.from({ length: 65 }, (_, i) => `S${i}`);
    const daily = new Map<string, BarFetchState>();
    const hourly = new Map<string, BarFetchState>();
    let bulk = 0, dailyCalls = 0, hourlyCalls = 0;
    const start = Date.parse('2026-09-25T04:00:00-04:00');
    const end = Date.parse('2026-09-25T20:00:00-04:00');
    for (let t = start; t < end; t += 60_000) {
      const minute = (t - Date.parse('2026-09-25T00:00:00-04:00')) / 60_000;
      const inSession = minute >= 9 * 60 + 30 && minute < 16 * 60;
      const slot = [4 * 60 + 15, 8 * 60 + 45, 16 * 60 + 15, 19 * 60 + 30].includes(minute);
      if (inSession || slot) bulk += chunkSymbols(symbols, AV_BULK_QUOTE_BATCH).length;
      for (const s of symbols) {
        if (isDailyRefreshDue(daily.get(s), t)) { dailyCalls++; daily.set(s, { fetchedAtMs: t, complete: true }); }
        if (isHourlyRefreshDue(hourly.get(s), t)) { hourlyCalls++; hourly.set(s, { fetchedAtMs: t, complete: true }); }
      }
    }
    // Steady state: first-run fetches (65 + 65) happen once per process start.
    expect(bulk).toBe(390 + 4);
    expect(dailyCalls).toBe(65 + 65 * 2);
    expect(hourlyCalls).toBe(65 + 65 * 8);
    expect(bulk + dailyCalls - 65 + hourlyCalls - 65).toBeLessThan(1_900);
  });
});
