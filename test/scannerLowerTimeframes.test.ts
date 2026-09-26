import { afterEach, describe, expect, it, vi } from 'vitest';
import { barTimeToMs, evaluateDataTrust } from '@/lib/scanner/dataTrust';
import { evaluateHardBlocks } from '@/lib/scanner/hardBlocks';
import { easternBarTimeToIso, easternWallTimeToMs, intradayAvgDailyVolume } from '@/lib/scanner/intradayEquityBars';

vi.mock('@/lib/boundedFetch', () => ({
  boundedJsonFetch: vi.fn(async () => ({ response: { ok: true, status: 200 }, body: { success: true, data: [] } })),
}));

const base = { price: 100, indicators: { atr: true, rsi: true, adx: true, ema200: true, macd: true }, volumeAvailable: true, historyBars: 250 };
// Friday 25 Sep 2026, 14:31 New York (EDT, UTC-4) — regular session open.
const midSession = Date.parse('2026-09-25T18:31:00Z');

describe('equity intraday bar times (Alpha Vantage US/Eastern wall time)', () => {
  it('reads a naive equity stamp as America/New_York, in summer and winter', () => {
    expect(new Date(easternWallTimeToMs('2026-09-25 14:15:00')).toISOString()).toBe('2026-09-25T18:15:00.000Z');
    expect(easternBarTimeToIso('2026-01-15 10:00:00')).toBe('2026-01-15T15:00:00.000Z');
    expect(easternBarTimeToIso('2026-09-25')).toBeNull();
    expect(easternBarTimeToIso('garbage')).toBeNull();
  });

  it('leaves ISO strings, date-only strings and non-equity stamps on the old parser', () => {
    expect(barTimeToMs('2026-09-25T18:15:00Z', 'equity')).toBe(Date.parse('2026-09-25T18:15:00Z'));
    expect(barTimeToMs('2026-09-25', 'equity')).toBe(Date.parse('2026-09-25'));
    expect(barTimeToMs('2026-09-25 14:15:00', 'crypto')).toBe(Date.parse('2026-09-25 14:15:00'));
  });

  it.each([
    ['15m', '2026-09-25 14:15:00'],
    ['30m', '2026-09-25 14:00:00'],
    ['1h', '2026-09-25 13:30:00'],
  ])('a current %s equity bar during the session is fresh, not a STALE hard block', (tf, bar) => {
    const trust = evaluateDataTrust({ ...base, assetClass: 'equity', timeframe: tf, barInterval: tf, lastBarAt: bar, nowMs: midSession });
    expect(trust.freshness).toBe('fresh');
    expect(trust.level).toBe('GOOD');
    const hard = evaluateHardBlocks({ asset: 'equity', timeframe: tf, freshness: trust.freshness, lastBarAt: bar, nowMs: midSession });
    expect(hard.blocks.map((b) => b.code)).not.toContain('STALE_DATA');
  });

  it('still marks a genuinely old intraday bar stale during the session', () => {
    const trust = evaluateDataTrust({ ...base, assetClass: 'equity', timeframe: '15m', barInterval: '15m', lastBarAt: '2026-09-25 10:00:00', nowMs: midSession });
    expect(trust.freshness).toBe('stale');
  });

  it('pre-market bars on the next session date age against New York time', () => {
    // Monday 28 Sep 2026 08:20 New York; last 15m pre-market bar opened 08:00 → fresh.
    const preMarket = Date.parse('2026-09-28T12:20:00Z');
    expect(evaluateDataTrust({ ...base, assetClass: 'equity', timeframe: '15m', barInterval: '15m', lastBarAt: '2026-09-28 08:00:00', nowMs: preMarket }).freshness).toBe('fresh');
  });

  it("Friday's last post-market bar stays current over the weekend", () => {
    const saturday = Date.parse('2026-09-26T08:15:00Z');
    expect(evaluateDataTrust({ ...base, assetClass: 'equity', timeframe: '1h', barInterval: '1h', lastBarAt: '2026-09-25 19:00:00', nowMs: saturday }).freshness).toBe('fresh');
  });
});

describe('intraday liquidity basis', () => {
  it('averages whole completed New York dates and excludes the latest (possibly partial) date', () => {
    const candles = [
      { date: '2026-09-23 09:30:00', volume: 1_000 }, { date: '2026-09-23 15:45:00', volume: 3_000 },
      { date: '2026-09-24 10:00:00', volume: 2_000 }, { date: '2026-09-24 19:45:00', volume: 4_000 },
      { date: '2026-09-25 04:00:00', volume: 5 },
    ];
    expect(intradayAvgDailyVolume(candles)).toBe(5_000);
    expect(intradayAvgDailyVolume([{ date: '2026-09-25 04:00:00', volume: 5 }])).toBeNull();
  });
});

describe('Ranked scanner client timeout', () => {
  afterEach(() => vi.clearAllMocks());

  it('gives intraday scans 60s and leaves daily/weekly on the default bound', async () => {
    const { boundedJsonFetch } = await import('@/lib/boundedFetch');
    const { fetchScannerResults, SCANNER_INTRADAY_TIMEOUT_MS } = await import('@/app/v2/_lib/api');
    for (const tf of ['15m', '30m', '1h'] as const) await fetchScannerResults('equity', tf);
    await fetchScannerResults('equity', 'daily');
    await fetchScannerResults('crypto', 'weekly');
    const timeouts = vi.mocked(boundedJsonFetch).mock.calls.map((c) => c[2]);
    expect(SCANNER_INTRADAY_TIMEOUT_MS).toBe(60_000);
    expect(timeouts).toEqual([60_000, 60_000, 60_000, undefined, undefined]);
  });
});
