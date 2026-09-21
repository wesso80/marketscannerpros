import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/coingecko', () => ({
  getOHLC: vi.fn(),
  getOHLCRange: vi.fn(),
  getMarketChartRange: vi.fn(),
  resolveSymbolToId: vi.fn(),
}));

import * as cg from '@/lib/coingecko';
import { aggregateBars, attachDailyVolumes, barsFromPriceSamples, bucketStart, detectPriceDiscontinuity, splitPartialBar, type Bar } from '../lib/scanner/barAggregation';
import { fetchCryptoSeries } from '../lib/scanner/cryptoBars';
import { evaluateDataTrust, lastCompletedEquitySession, normalizeTimeframeInterval } from '../lib/scanner/dataTrust';
import { buildAnalysisNarrative, buildConfirmation, classifySetupFamily } from '../lib/scanner/analysisNarrative';
import { buildCachedScanData } from '../lib/scannerCache';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

function dailyBars(n: number, endExclusiveMs: number): Bar[] {
  const start = bucketStart(endExclusiveMs, '1d') - n * DAY;
  return Array.from({ length: n }, (_, i) => {
    const t = start + i * DAY;
    const px = 100 + i;
    return { t: iso(t), open: px, high: px + 2, low: px - 2, close: px + 1, volume: 1000 + i };
  });
}

describe('bar aggregation', () => {
  it('aggregates daily bars into Monday-anchored weeks with correct OHLCV', () => {
    // Mon 2026-09-07 00:00 UTC .. Sun 2026-09-13
    const mon = Date.UTC(2026, 8, 7);
    const bars: Bar[] = Array.from({ length: 7 }, (_, i) => ({ t: iso(mon + i * DAY), open: 10 + i, high: 20 + i, low: 5 - (i % 2), close: 11 + i, volume: 100 }));
    const weekly = aggregateBars(bars, '1w');
    expect(weekly).toHaveLength(1);
    expect(weekly[0].t).toBe(iso(mon));
    expect(new Date(weekly[0].t).getUTCDay()).toBe(1);
    expect(weekly[0].open).toBe(10);
    expect(weekly[0].close).toBe(17);
    expect(weekly[0].high).toBe(26);
    expect(weekly[0].low).toBe(4);
    expect(weekly[0].volume).toBe(700);
  });

  it('excludes the still-open bar from completed bars', () => {
    const now = Date.UTC(2026, 8, 19, 15, 0);
    const bars = dailyBars(5, now + DAY); // last bar opens today 00:00 → still open
    const { completed, partial } = splitPartialBar(bars, '1d', now);
    expect(partial?.t).toBe(iso(bucketStart(now, '1d')));
    expect(completed).toHaveLength(4);
    expect(completed.every((b) => Date.parse(b.t) + DAY <= now)).toBe(true);
  });

  it('builds 15m bars from 5-minute price samples', () => {
    const start = Date.UTC(2026, 8, 19, 10, 0);
    const points: Array<[number, number]> = Array.from({ length: 6 }, (_, i) => [start + i * 5 * 60_000, 100 + i]);
    const bars = barsFromPriceSamples(points, '15m');
    expect(bars).toHaveLength(2);
    expect(bars[0]).toMatchObject({ open: 100, high: 102, low: 100, close: 102 });
    expect(bars[1]).toMatchObject({ open: 103, close: 105 });
  });

  it('attaches the CoinGecko 24h volume point at D 00:00 to the bar for D-1', () => {
    const d0 = Date.UTC(2026, 8, 17);
    const bars: Bar[] = [d0, d0 + DAY].map((t) => ({ t: iso(t), open: 1, high: 1, low: 1, close: 1, volume: null }));
    const out = attachDailyVolumes(bars, [[d0 + DAY, 555], [d0 + 2 * DAY, 777]]);
    expect(out[0].volume).toBe(555);
    expect(out[1].volume).toBe(777);
  });
});

describe('crypto series timeframe → source mapping', () => {
  const now = Date.UTC(2026, 8, 19, 12, 30);
  const getOHLCRange = vi.mocked(cg.getOHLCRange);
  const getMarketChartRange = vi.mocked(cg.getMarketChartRange);
  const getOHLC = vi.mocked(cg.getOHLC);
  const resolve = vi.mocked(cg.resolveSymbolToId);

  beforeEach(() => {
    vi.clearAllMocks();
    resolve.mockImplementation(async (sym: string) => ({ BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', AVAX: 'avalanche-2', INJ: 'injective-protocol', APT: 'aptos', HBAR: 'hedera-hashgraph', NEAR: 'near', ARB: 'arbitrum', LINK: 'chainlink', XRP: 'ripple' }[sym] ?? null));
  });

  it('normalises symbol suffixes without truncating tickers (APT, HBAR, INJ, NEAR, ARB, AVAX, LINK, XRP, BTC, ETH, SOL)', async () => {
    getOHLCRange.mockResolvedValue(dailyBars(40, now).map((b) => [Date.parse(b.t) + DAY, b.open, b.high, b.low, b.close]));
    getMarketChartRange.mockResolvedValue({ prices: [], market_caps: [], total_volumes: [] } as any);
    const expected: Record<string, string> = { 'APT-USD': 'aptos', 'HBAR-USD': 'hedera-hashgraph', 'INJ-USD': 'injective-protocol', 'NEAR-USD': 'near', 'ARB-USD': 'arbitrum', 'AVAX-USD': 'avalanche-2', 'LINK-USD': 'chainlink', 'XRP-USD': 'ripple', 'BTC-USD': 'bitcoin', 'ETH-USD': 'ethereum', 'SOL-USD': 'solana', 'SOLUSDT': 'solana', 'btc/usd': 'bitcoin' };
    for (const [sym, id] of Object.entries(expected)) {
      const s = await fetchCryptoSeries(sym, 'daily', now);
      expect(s.coinId, sym).toBe(id);
    }
    expect(resolve).toHaveBeenCalledWith('APT');
    expect(resolve).toHaveBeenCalledWith('HBAR');
    expect(resolve).not.toHaveBeenCalledWith('AP');
    expect(resolve).not.toHaveBeenCalledWith('HB');
  });

  it('uses an explicit coinId without re-resolving it as a ticker (Pro deep-scan BTC regression)', async () => {
    getOHLCRange.mockResolvedValue(dailyBars(40, now).map((b) => [Date.parse(b.t) + DAY, b.open, b.high, b.low, b.close]));
    getMarketChartRange.mockResolvedValue({ prices: [], market_caps: [], total_volumes: [] } as any);
    const s = await fetchCryptoSeries('BTC', 'daily', now, { coinId: 'bitcoin' });
    expect(s.coinId).toBe('bitcoin');
    expect(resolve).not.toHaveBeenCalled();
    expect(getOHLCRange.mock.calls.every((c) => c[0] === 'bitcoin')).toBe(true);
  });

  it('daily = two daily windows with close timestamps normalised to bar opens and aligned volume', async () => {
    const all = dailyBars(360, now + DAY);
    getOHLCRange.mockImplementation(async (_id, from, to) => all.filter((b) => (Date.parse(b.t) + DAY) / 1000 >= from && (Date.parse(b.t) + DAY) / 1000 <= to).map((b) => [Date.parse(b.t) + DAY, b.open, b.high, b.low, b.close]));
    getMarketChartRange.mockResolvedValue({ prices: [], market_caps: [], total_volumes: all.map((b) => [Date.parse(b.t) + DAY, 9_000]) } as any);
    const s = await fetchCryptoSeries('BTC-USD', 'daily', now);
    expect(s.barInterval).toBe('1d');
    expect(getOHLCRange).toHaveBeenCalledTimes(2);
    expect(getOHLCRange.mock.calls.every((c) => c[4] === undefined || c[4] === 'daily')).toBe(true);
    expect(s.bars.length).toBeGreaterThanOrEqual(300);
    expect(s.partialBar).toBeNull(); // provider returns only closed daily candles
    expect(s.bars.at(-1)?.t).toBe(iso(bucketStart(now, '1d') - DAY));
    expect(s.volumeBasis).toBe('coingecko_daily_total_volume');
    expect(s.bars.at(-1)?.volume).toBe(9_000);
    expect(s.currentPrice).toBe(s.bars.at(-1)?.close);
  });

  it('weekly = Monday-anchored aggregate of completed daily bars (never the daily series relabelled)', async () => {
    const all = dailyBars(360, now + DAY);
    getOHLCRange.mockResolvedValue(all.map((b) => [Date.parse(b.t) + DAY, b.open, b.high, b.low, b.close]));
    getMarketChartRange.mockResolvedValue({ prices: [], market_caps: [], total_volumes: [] } as any);
    const s = await fetchCryptoSeries('ETH-USD', 'weekly', now);
    expect(s.barInterval).toBe('1w');
    expect(s.bars.length).toBeGreaterThanOrEqual(49);
    expect(s.bars.length).toBeLessThanOrEqual(52);
    expect(s.bars.every((b) => new Date(b.t).getUTCDay() === 1)).toBe(true);
    // Current (open) week is the partial bar, not an indicator input.
    expect(s.partialBar && Date.parse(s.partialBar.t) <= now && Date.parse(s.partialBar.t) + 7 * DAY > now).toBe(true);
  });

  it('1h = ohlc/range interval=hourly, volume flagged unavailable', async () => {
    const start = bucketStart(now, '1h') - 745 * HOUR;
    getOHLCRange.mockResolvedValue(Array.from({ length: 745 }, (_, i) => [start + (i + 1) * HOUR, 1, 2, 0.5, 1.5]));
    const s = await fetchCryptoSeries('SOL-USD', '1h', now);
    expect(getOHLCRange).toHaveBeenCalledTimes(1);
    expect(getOHLCRange.mock.calls[0][4]).toBe('hourly');
    expect(getMarketChartRange).not.toHaveBeenCalled();
    expect(s.barInterval).toBe('1h');
    expect(s.volumeBasis).toBe('unavailable');
    expect(s.bars.length).toBeGreaterThanOrEqual(700);
    expect(s.bars.at(-1)?.t).toBe(iso(bucketStart(now, '1h') - HOUR));
  });

  it('30m = /ohlc days=1 candles; 15m = 5-minute price samples with approximate H/L', async () => {
    const start30 = bucketStart(now, '30m') - 48 * 30 * 60_000;
    getOHLC.mockResolvedValue(Array.from({ length: 48 }, (_, i) => [start30 + (i + 1) * 30 * 60_000, 1, 2, 0.5, 1.5]));
    const s30 = await fetchCryptoSeries('AVAX-USD', '30m', now);
    expect(s30.barInterval).toBe('30m');
    expect(s30.hlBasis).toBe('exchange_ohlc');

    const start5 = bucketStart(now, '15m') - 12 * HOUR;
    getMarketChartRange.mockResolvedValue({ prices: Array.from({ length: 144 }, (_, i) => [start5 + i * 5 * 60_000, 10 + (i % 7)]), market_caps: [], total_volumes: [] } as any);
    const s15 = await fetchCryptoSeries('INJ-USD', '15m', now);
    expect(s15.barInterval).toBe('15m');
    expect(s15.hlBasis).toBe('price_samples');
    expect(s15.warnings.join(' ')).toMatch(/approximated/);
  });
});

describe('data trust', () => {
  const sat = Date.UTC(2026, 8, 19, 15, 0); // Saturday
  const base = { price: 100, indicators: { atr: true, rsi: true, adx: true, ema200: true, macd: true }, volumeAvailable: true, historyBars: 250 };

  it("treats Friday's close as fresh on a Saturday and returns GOOD", () => {
    const t = evaluateDataTrust({ ...base, assetClass: 'equity', timeframe: 'daily', barInterval: '1d', lastBarAt: '2026-09-18', nowMs: sat });
    expect(lastCompletedEquitySession(sat)).toBe('2026-09-18');
    expect(t.freshness).toBe('fresh');
    expect(t.level).toBe('GOOD');
  });

  it('marks a daily bar two sessions behind as STALE', () => {
    const t = evaluateDataTrust({ ...base, assetClass: 'equity', timeframe: 'daily', barInterval: '1d', lastBarAt: '2026-09-16', nowMs: sat });
    expect(t.level).toBe('STALE');
  });

  it('EMA200 unavailable → DEGRADED with an explicit reason, not a fabricated value', () => {
    const t = evaluateDataTrust({ ...base, indicators: { ...base.indicators, ema200: false }, historyBars: 51, assetClass: 'crypto', timeframe: 'weekly', barInterval: '1w', lastBarAt: iso(Date.UTC(2026, 8, 14)), nowMs: sat });
    expect(t.level).toBe('DEGRADED');
    expect(t.reasons).toContain('EMA200 unavailable (insufficient history)');
  });

  it('flags interval mismatch and normalises 60min → 1h', () => {
    expect(normalizeTimeframeInterval('60min')).toBe('1h');
    const t = evaluateDataTrust({ ...base, assetClass: 'crypto', timeframe: 'daily', barInterval: '4h', lastBarAt: iso(sat - 4 * HOUR), nowMs: sat });
    expect(t.intervalMismatch).toBe(true);
    expect(t.level).toBe('DEGRADED');
  });

  it('too little history or missing critical inputs → INSUFFICIENT_DATA', () => {
    expect(evaluateDataTrust({ ...base, historyBars: 12, assetClass: 'crypto', timeframe: '1h', lastBarAt: iso(sat - HOUR), nowMs: sat }).level).toBe('INSUFFICIENT_DATA');
    expect(evaluateDataTrust({ ...base, price: null, assetClass: 'equity', timeframe: 'daily', lastBarAt: '2026-09-18', nowMs: sat }).level).toBe('INSUFFICIENT_DATA');
  });

  it('unadjusted split-like discontinuity → INSUFFICIENT_DATA with an explicit reason (NFLX regression)', () => {
    const closes = [1227, 1210, 1198, 118.7, 117.2, 71.79];
    const disc = detectPriceDiscontinuity(closes, ['2025-11-12', '2025-11-13', '2025-11-14', '2025-11-17', '2025-11-18', '2026-09-18']);
    expect(disc).toMatchObject({ index: 3, date: '2025-11-17' });
    expect(disc!.ratio).toBeCloseTo(0.099, 2);
    expect(detectPriceDiscontinuity([100, 104, 99, 108, 95])).toBeNull();
    const t = evaluateDataTrust({ ...base, assetClass: 'equity', timeframe: 'daily', barInterval: '1d', lastBarAt: '2026-09-18', nowMs: sat, priceDiscontinuity: { date: disc!.date, ratio: disc!.ratio } });
    expect(t.level).toBe('INSUFFICIENT_DATA');
    expect(t.reasons[0]).toMatch(/unadjusted split/);
  });

  it('Pro confidence cap by trust level never exceeds the cap', () => {
    const TRUST_CAP = { GOOD: 99, DEGRADED: 80, STALE: 60, INSUFFICIENT_DATA: 40 } as const;
    const t = evaluateDataTrust({ ...base, volumeAvailable: false, assetClass: 'crypto', timeframe: '1h', barInterval: '1h', lastBarAt: iso(sat - HOUR), nowMs: sat });
    const matchConfidence = 92;
    expect(Math.min(matchConfidence, TRUST_CAP[t.level])).toBe(80);
  });
});

describe('scanner cache normalisation', () => {
  it('keeps string volumes and never fabricates EMA200 as 0', () => {
    const row = buildCachedScanData(
      { symbol: 'META', price: 750, volume: '27300000', change_percent: 1.2, latest_trading_day: '2026-09-18' } as any,
      { rsi14: 55, adx14: 22, atr14: 12, ema20: 700, ema50: 690, ema200: null, macd_hist: 0.5 } as any,
    );
    expect(row.volume).toBe(27_300_000);
    expect(Number.isNaN(row.ema200)).toBe(true);
    expect(row.ema200).not.toBe(0);
  });
});

describe('analysis narrative', () => {
  const row = { symbol: 'AVAX-USD', direction: 'LONG', setup: 'Breakout Continuation', rsi: 64, adx: 31, macdHist: 0.4, priceVsEma200: 12, volumeRatio: 1.6, sectorRelStr: 3.1, regime: 'Trending', confidence: 78, atrPercent: 4.2 } as any;

  it('classifies setup families and produces setup-specific confirmation text', () => {
    expect(classifySetupFamily('Breakout Continuation')).toBe('breakout');
    expect(classifySetupFamily('Squeeze Setup')).toBe('squeeze');
    expect(classifySetupFamily('Mean Reversion')).toBe('reversal');
    const breakout = buildConfirmation(row);
    const squeeze = buildConfirmation({ ...row, setup: 'Squeeze Setup' });
    const reversal = buildConfirmation({ ...row, setup: 'Mean Reversion', direction: 'SHORT' });
    expect(breakout.confirms).not.toBe(squeeze.confirms);
    expect(squeeze.confirms).not.toBe(reversal.confirms);
    expect(breakout.invalidates.length).toBeGreaterThan(0);
  });

  it('derives supports / blockers from the row evidence, not generic copy', () => {
    const strong = buildAnalysisNarrative(row);
    const weak = buildAnalysisNarrative({ ...row, adx: 14, volumeRatio: 0.6, sectorRelStr: -2, priceVsEma200: -5 });
    expect(strong.supports.length).toBeGreaterThan(weak.supports.length);
    expect(weak.blockers.length).toBeGreaterThan(strong.blockers.length);
    expect(strong.supports.join(' ')).not.toBe(weak.supports.join(' '));
  });
});
