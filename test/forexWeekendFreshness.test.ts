/** Forex freshness follows the FX trading week (shut Fri 17:00 – Sun 17:00 New York), not a 24/7 clock. */
import { describe, expect, it } from 'vitest';
import { evaluateDataTrust } from '@/lib/scanner/dataTrust';
import { forexOpenMinutesBetween, forexSessionsBetween, isForexClosed, lastCompletedForexDailyBar } from '@/lib/time/fxSession';

const at = (s: string) => Date.parse(s);
const fx = (lastBarAt: string, now: string, barInterval = '1d') => evaluateDataTrust({
  assetClass: 'forex', timeframe: barInterval === '1d' ? 'daily' : barInterval, barInterval, lastBarAt, nowMs: at(now), price: 1.1,
  indicators: { atr: true, rsi: true, adx: true, ema200: true, macd: true }, historyBars: 250,
});

describe('FX calendar', () => {
  it('closed Friday 17:00 to Sunday 17:00 New York time (EDT and EST)', () => {
    expect(isForexClosed(at('2026-09-25T20:59:00Z'))).toBe(false); // Fri 16:59 EDT
    expect(isForexClosed(at('2026-09-25T21:00:00Z'))).toBe(true);  // Fri 17:00 EDT
    expect(isForexClosed(at('2026-09-27T20:59:00Z'))).toBe(true);  // Sun 16:59 EDT
    expect(isForexClosed(at('2026-09-27T21:00:00Z'))).toBe(false); // Sun 17:00 EDT
    expect(isForexClosed(at('2026-12-04T21:30:00Z'))).toBe(false); // Fri 16:30 EST
    expect(isForexClosed(at('2026-12-04T22:00:00Z'))).toBe(true);  // Fri 17:00 EST
  });
  it('counts only open minutes across the weekend', () => {
    // Fri 20:00 UTC → Mon 01:00 UTC: 1h Friday + 4h Sunday evening = 300 open minutes.
    expect(forexOpenMinutesBetween(at('2026-09-25T20:00:00Z'), at('2026-09-28T01:00:00Z'))).toBe(300);
  });
  it('Alpha Vantage FX_DAILY convention: bar D (UTC weekday) completes at 00:00 UTC D+1; Friday stays latest all weekend', () => {
    expect(lastCompletedForexDailyBar(at('2026-09-25T21:30:00Z'))).toBe('2026-09-24'); // Fri evening: Friday's bar not out yet
    expect(lastCompletedForexDailyBar(at('2026-09-26T04:00:00Z'))).toBe('2026-09-25'); // Sat
    expect(lastCompletedForexDailyBar(at('2026-09-27T23:00:00Z'))).toBe('2026-09-25'); // Sun
    expect(lastCompletedForexDailyBar(at('2026-09-28T23:59:00Z'))).toBe('2026-09-25'); // Mon (Monday's bar still open)
    expect(lastCompletedForexDailyBar(at('2026-09-29T00:01:00Z'))).toBe('2026-09-28'); // Tue
    expect(forexSessionsBetween('2026-09-25', '2026-09-28')).toBe(1);
    expect(forexSessionsBetween('2026-09-24', '2026-09-28')).toBe(2);
  });
});

describe('forex daily freshness', () => {
  it("Friday's bar is fresh on Saturday and Sunday (was DEGRADED Saturday, STALE Sunday) and on Monday", () => {
    for (const now of ['2026-09-26T12:00:00Z', '2026-09-27T12:00:00Z', '2026-09-28T12:00:00Z']) {
      const t = fx('2026-09-25T00:00:00.000Z', now);
      expect(t.freshness, now).toBe('fresh');
      expect(t.level, now).toBe('GOOD');
    }
  });
  it("Thursday's bar is genuinely one bar behind once Friday's has completed, and STALE after Monday's", () => {
    expect(fx('2026-09-24T00:00:00.000Z', '2026-09-25T21:31:00Z').freshness).toBe('fresh');
    expect(fx('2026-09-24T00:00:00.000Z', '2026-09-26T04:00:00Z').freshness).toBe('delayed');
    expect(fx('2026-09-24T00:00:00.000Z', '2026-09-27T12:00:00Z').freshness).toBe('delayed');
    expect(fx('2026-09-24T00:00:00.000Z', '2026-09-29T01:00:00Z').freshness).toBe('stale');
  });
  it('weekday behaviour matches the old rule (bar D fresh until D+2 00:00 UTC)', () => {
    expect(fx('2026-09-22T00:00:00.000Z', '2026-09-23T23:59:00Z').freshness).toBe('fresh');
    expect(fx('2026-09-22T00:00:00.000Z', '2026-09-24T00:01:00Z').freshness).toBe('delayed');
  });
});

describe('forex intraday freshness', () => {
  it("Friday's last hourly bar stays fresh through the weekend and ages again after Sunday's open", () => {
    expect(fx('2026-09-25T20:00:00Z', '2026-09-26T12:00:00Z', '1h').freshness).toBe('fresh');
    expect(fx('2026-09-25T20:00:00Z', '2026-09-27T20:30:00Z', '1h').freshness).toBe('fresh');
    expect(fx('2026-09-25T20:00:00Z', '2026-09-27T23:30:00Z', '1h').freshness).toBe('stale');
  });
  it('crypto keeps the 24/7 rule', () => {
    const t = evaluateDataTrust({ assetClass: 'crypto', timeframe: 'daily', barInterval: '1d', lastBarAt: '2026-09-24T00:00:00.000Z', nowMs: at('2026-09-26T12:00:00Z'), price: 1 });
    expect(t.freshness).toBe('delayed');
  });
});
