/**
 * RS-4 — crypto EMA200 on Golden Egg / Deep Analysis was ~1% too high: only ~360 CoinGecko daily bars were fetched,
 * and an SMA-seeded EMA200 on 360 bars still carries ~20% of its seed. Golden Egg now asks for ~1,080 days of daily
 * bars as indicator history (the last 1,000 used, the same rule as equities); display bars stay at 360.
 * Checked on real Binance BTCUSDT data through the 24 Sep 2026 bar: 74,666.70 (360 bars) → 73,863.14 (1,000 bars);
 * full history 73,862.77.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DAY = 86_400_000;
const START = Date.parse('2023-01-01T00:00:00Z');
let series: number[][] = []; // CoinGecko rows: [candle CLOSE time ms, o, h, l, c]
let missingWindow: number | null = null; // index of a 180-day window (0 = most recent) that returns nothing

function makeSeries(direction: 1 | -1) {
  series = [];
  let c = 20000;
  for (let t = START + DAY; t <= Date.parse('2026-09-25T00:00:00Z'); t += DAY) {
    const i = (t - START) / DAY;
    const o = c;
    // A trend that turns ~1 year ago: the 360-bar window's SMA seed sits far from the converged EMA.
    const drift = i < 900 ? direction * 0.003 : -direction * 0.001;
    c = c * (1 + drift + Math.sin(i / 9) * 0.01);
    series.push([t, o, Math.max(o, c) * 1.01, Math.min(o, c) * 0.99, c]);
  }
}

vi.mock('@/lib/coingecko', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getOHLCRange: vi.fn(async (_id: string, from: number, to: number) => {
    const nowS = Date.parse('2026-09-25T00:05:00Z') / 1000 - 60;
    const idx = Math.round((nowS - to) / (180 * 86_400));
    if (missingWindow !== null && idx === missingWindow) return null;
    return series.filter((r) => r[0] / 1000 > from && r[0] / 1000 <= to);
  }),
  getMarketChartRange: vi.fn(async () => ({ total_volumes: [], prices: [] })),
  getCoinDetail: vi.fn(async () => null),
  resolveSymbolToId: vi.fn(async () => 'bitcoin'),
}));

import * as cg from '@/lib/coingecko';
import { fetchCryptoSeries } from '@/lib/scanner/cryptoBars';
import { fetchIndicators, fetchPrice } from '@/lib/goldenEggFetchers';
import * as scannerMath from '@/lib/scanner/indicatorMath';

const NOW = Date.parse('2026-09-25T00:05:00Z');
const ohlcCalls = () => (cg.getOHLCRange as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
const fullEma200 = () => { const e = scannerMath.ema(series.map((r) => r[4]), 200); return e[e.length - 1]; };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  missingWindow = null;
  makeSeries(1);
});

describe('crypto daily history windows', () => {
  it('default stays at 2 × 180-day windows (~360 bars) — scanner / DVE cost unchanged', async () => {
    const s = await fetchCryptoSeries('BTC', 'daily', NOW, { coinId: 'bitcoin' });
    expect(ohlcCalls()).toBe(2);
    expect(s.bars.length).toBeGreaterThanOrEqual(355);
    expect(s.bars.length).toBeLessThanOrEqual(361);
  });
  it('dailyWindows 6 fetches ~1,080 contiguous, sorted, de-duplicated daily bars', async () => {
    const s = await fetchCryptoSeries('BTC', 'daily', NOW, { coinId: 'bitcoin', dailyWindows: 6 });
    expect(ohlcCalls()).toBe(6);
    expect(s.bars.length).toBeGreaterThanOrEqual(1075);
    const ts = s.bars.map((b) => Date.parse(b.t));
    expect(ts.every((t, i) => i === 0 || t - ts[i - 1] === DAY)).toBe(true);
    expect(s.bars[s.bars.length - 1].t).toBe('2026-09-24T00:00:00.000Z'); // last COMPLETED bar
  });
  it('a missing older window keeps only the contiguous recent history, with a warning', async () => {
    missingWindow = 3;
    const s = await fetchCryptoSeries('BTC', 'daily', NOW, { coinId: 'bitcoin', dailyWindows: 6 });
    expect(s.bars.length).toBeLessThanOrEqual(541);
    expect(s.bars.length).toBeGreaterThanOrEqual(535);
    expect(s.warnings.join(' ')).toMatch(/warm-up history shorter/);
    const ts = s.bars.map((b) => Date.parse(b.t));
    expect(ts.every((t, i) => i === 0 || t - ts[i - 1] === DAY)).toBe(true);
  });
});

describe('Golden Egg crypto EMA200 uses the long indicator history', () => {
  for (const dir of [1, -1] as const) {
    it(`converges to the full-history EMA200 (${dir === 1 ? 'rising' : 'falling'} market)`, async () => {
      makeSeries(dir);
      const full = fullEma200();
      const short = (await fetchPrice('BTC', 'crypto', { requireHistoricals: true, avInterval: 'daily' }))!;
      expect(short.indicatorHistory).toBeUndefined();
      const shortInd = await fetchIndicators('BTC', 'crypto', short.historicalCloses, short.historicalHighs, short.historicalLows, 'daily');
      const long = (await fetchPrice('BTC', 'crypto', { requireHistoricals: true, avInterval: 'daily', cryptoIndicatorHistory: true }))!;
      expect(long.historicalCloses.length).toBe(360); // display / DVE / canonical bars unchanged
      expect(long.indicatorHistory!.closes.length).toBe(1000);
      const longInd = await fetchIndicators('BTC', 'crypto', long.indicatorHistory!.closes, long.indicatorHistory!.highs, long.indicatorHistory!.lows, 'daily');
      const errShort = Math.abs(shortInd!.ema200! / full - 1);
      const errLong = Math.abs(longInd!.ema200! / full - 1);
      expect(errShort).toBeGreaterThan(0.003); // 360 bars: ~20% of the SMA seed still in the value
      expect(errLong).toBeLessThan(errShort / 20);
      expect(longInd!.barsUsed).toBe(1000);
    });
  }
  it('intraday / weekly crypto requests do not fetch the extra windows', async () => {
    await fetchPrice('BTC', 'crypto', { requireHistoricals: true, avInterval: 'weekly', cryptoIndicatorHistory: true });
    expect(ohlcCalls()).toBe(2);
  });
});
