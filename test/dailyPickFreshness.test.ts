import { describe, expect, it } from 'vitest';
import { evaluateDataTrust, lastCompletedEquitySession } from '@/lib/scanner/dataTrust';
import { evaluateDailyPickTrust } from '@/lib/scanner/dailyPickTrust';
import { assetsToReplace, parseDailyScanAssets } from '@/lib/scanner/dailyScanAssets';

const IND = { ema200: 1, rsi: 55, macd: 1, macdSignal: 0.5, adx: 25, stochK: 60, stochD: 55, aroonUp: 80, aroonDown: 20, cci: 50 };
const row = (asset_class: string, lastBarAt: string) => ({ asset_class, price: 100, indicators: { ...IND, price: 100, lastBarAt }, scan_date: lastBarAt.slice(0, 10) });
const at = (s: string) => Date.parse(s);
const daily = (lastBarAt: string, nowMs: number) => evaluateDataTrust({
  assetClass: 'equity', timeframe: 'daily', barInterval: '1d', lastBarAt, nowMs, price: 100,
  indicators: { atr: true, rsi: true, adx: true, ema200: true, macd: true }, volumeAvailable: true, historyBars: 250,
});

describe('daily picks freshness: crypto (24/7, candle closes 00:00 UTC)', () => {
  it('is fresh right after the 21:30 UTC scan (the 25 Sep candle is still open)', () => {
    const t = evaluateDailyPickTrust(row('crypto', '2026-09-24T00:00:00.000Z'), at('2026-09-25T21:31:00Z'));
    expect(t.freshness).toBe('fresh');
    expect(t.level).toBe('GOOD');
  });
  it('is genuinely one bar behind once the 25 Sep candle has closed (00:00 UTC = 10:00 AEST), with a specific reason', () => {
    const t = evaluateDailyPickTrust(row('crypto', '2026-09-24T00:00:00.000Z'), at('2026-09-26T00:05:00Z'));
    expect(t.level).toBe('DEGRADED');
    expect(t.reasons.join(' ')).toMatch(/one daily bar behind: last bar 2026-09-24 .*arrives with the next daily scan/);
  });
  it('is fresh when the row carries the latest completed candle (e.g. after a crypto refresh past 00:00 UTC)', () => {
    const t = evaluateDailyPickTrust(row('crypto', '2026-09-25T00:00:00.000Z'), at('2026-09-26T00:25:00Z'));
    expect(t.freshness).toBe('fresh');
    expect(t.level).toBe('GOOD');
  });
});

describe('daily picks freshness: equity uses the real New York close', () => {
  it('US winter: the still-open session is not treated as closed at 20:00 UTC (close is 21:00 UTC under EST)', () => {
    const now = at('2026-12-02T20:30:00Z'); // Wed 15:30 EST, market open
    expect(lastCompletedEquitySession(now)).toBe('2026-12-01');
    expect(daily('2026-12-01', now).freshness).toBe('fresh');
    const t = evaluateDailyPickTrust(row('equity', '2026-12-01T00:00:00.000Z'), now);
    expect(t.level).toBe('GOOD');
  });
  it('US winter: after 16:00 EST the previous bar is one session behind', () => {
    const now = at('2026-12-02T21:05:00Z');
    expect(lastCompletedEquitySession(now)).toBe('2026-12-02');
    const t = evaluateDailyPickTrust(row('equity', '2026-12-01T00:00:00.000Z'), now);
    expect(t.level).toBe('DEGRADED');
    expect(t.reasons.join(' ')).toMatch(/one session behind: last bar 2026-12-01; the 2026-12-02 session has closed/);
  });
  it('US summer: 20:00 UTC is the close (16:00 EDT)', () => {
    expect(lastCompletedEquitySession(at('2026-09-25T19:59:00Z'))).toBe('2026-09-24');
    expect(lastCompletedEquitySession(at('2026-09-25T20:00:00Z'))).toBe('2026-09-25');
  });
  it('early close (13:00 ET, day after Thanksgiving): the session counts as closed from 18:00 UTC', () => {
    expect(lastCompletedEquitySession(at('2026-11-27T17:30:00Z'))).toBe('2026-11-25');
    expect(lastCompletedEquitySession(at('2026-11-27T18:05:00Z'))).toBe('2026-11-27');
    expect(daily('2026-11-25', at('2026-11-27T18:05:00Z')).freshness).toBe('delayed');
  });
  it("counts sessions, not calendar days: Friday's bar on Monday after the close is one session behind, not stale", () => {
    const monAfterClose = at('2026-09-28T20:30:00Z');
    expect(daily('2026-09-25', monAfterClose).freshness).toBe('delayed');
    expect(daily('2026-09-24', monAfterClose).freshness).toBe('stale');
    // Friday's bar over the weekend and on Monday before the close is current.
    expect(daily('2026-09-25', at('2026-09-27T12:00:00Z')).freshness).toBe('fresh');
    expect(daily('2026-09-25', at('2026-09-28T15:00:00Z')).freshness).toBe('fresh');
  });
});

describe('scan-daily ?assets= filter', () => {
  it('parses the comma list, ignoring unknown names', () => {
    expect(parseDailyScanAssets(null)).toBeNull();
    expect(parseDailyScanAssets('')).toBeNull();
    expect(parseDailyScanAssets('crypto')).toEqual(['crypto']);
    expect(parseDailyScanAssets(' Forex,crypto ,bogus')).toEqual(['crypto', 'forex']);
    expect(parseDailyScanAssets('bogus')).toEqual([]);
  });
  it('only replaces asset classes the run produced rows for (an outage keeps the stored picks)', () => {
    expect(assetsToReplace(['crypto'], [{ asset_class: 'crypto' }])).toEqual(['crypto']);
    expect(assetsToReplace(['crypto'], [])).toEqual([]);
    expect(assetsToReplace(['crypto', 'forex'], [{ asset_class: 'forex' }])).toEqual(['forex']);
  });
});
