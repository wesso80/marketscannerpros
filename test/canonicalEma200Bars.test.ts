/**
 * RS-4 — the canonical verdict engine's own EMA200 (trend eligibility, ema50-over-200) must run on enough history to
 * converge: Golden Egg used the 300/360-bar display tail and daily picks cut to 500 bars. Now both read up to 1,000
 * bars, and scan-daily crypto fetches 6 × 180-day windows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const seen: number[] = [];
const fetchCryptoSeriesMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/scanner/cryptoBars', async (orig) => ({ ...(await orig<Record<string, unknown>>()), fetchCryptoSeries: fetchCryptoSeriesMock }));
vi.mock('@/lib/scoring/canonical/engine', async (orig) => {
  const real = await orig<typeof import('@/lib/scoring/canonical/engine')>();
  return {
    ...real,
    evaluateCanonicalFromBars: (bars: Parameters<typeof real.evaluateCanonicalFromBars>[0], input: Parameters<typeof real.evaluateCanonicalFromBars>[1]) => {
      seen.push(bars.length);
      return real.evaluateCanonicalFromBars(bars, input);
    },
  };
});

import { evaluateGoldenEggCanonical, goldenEggCanonicalBars, GOLDEN_EGG_CANONICAL_MAX_BARS } from '@/lib/goldenEgg/canonicalVerdict';
import { canonicalForDailyPick, DAILY_PICK_MAX_BARS } from '@/lib/scoring/canonical/dailyPick';
import { DAILY_SCAN_CRYPTO_WINDOWS, scanCryptoDailyIndicators } from '@/lib/scanner/dailyCryptoIndicators';

const DAY = 86_400_000;
function bars(n: number, endMs = Date.parse('2026-09-24T00:00:00Z')) {
  const out = [];
  let c = 100;
  for (let i = 0; i < n; i++) {
    const o = c;
    c = c * (1 + (i < n - 300 ? 0.002 : -0.001) + Math.sin(i / 7) * 0.01);
    out.push({ t: new Date(endMs - (n - 1 - i) * DAY).toISOString(), open: o, high: Math.max(o, c) * 1.01, low: Math.min(o, c) * 0.99, close: c, volume: 1_000_000 });
  }
  return out;
}

beforeEach(() => { seen.length = 0; });

describe('canonical verdict history length (RS-4)', () => {
  it('Golden Egg canonical bars prefer the complete 1,000-bar indicator history over the display tail', () => {
    const b = bars(1000);
    const tail = b.slice(-300);
    const pd = {
      historicalCloses: tail.map((x) => x.close), historicalOpens: tail.map((x) => x.open), historicalHighs: tail.map((x) => x.high),
      historicalLows: tail.map((x) => x.low), historicalDates: tail.map((x) => x.t), historicalVolumes: tail.map((x) => x.volume),
      indicatorHistory: { closes: b.map((x) => x.close), highs: b.map((x) => x.high), lows: b.map((x) => x.low), opens: b.map((x) => x.open), dates: b.map((x) => x.t), volumes: b.map((x) => x.volume) },
    };
    const long = goldenEggCanonicalBars(pd);
    expect(long).toHaveLength(1000);
    expect(long[999]).toEqual({ ...b[999] });
    // Incomplete indicator history (no opens/dates — older payload shape) falls back to the display tail.
    const partial = goldenEggCanonicalBars({ ...pd, indicatorHistory: { closes: pd.indicatorHistory.closes, highs: pd.indicatorHistory.highs, lows: pd.indicatorHistory.lows } });
    expect(partial).toHaveLength(300);
    // Shorter-or-equal indicator history → display tail.
    expect(goldenEggCanonicalBars({ ...pd, indicatorHistory: undefined })).toHaveLength(300);
  });

  it('evaluateGoldenEggCanonical reads up to 1,000 bars (was 500)', () => {
    expect(GOLDEN_EGG_CANONICAL_MAX_BARS).toBe(1000);
    evaluateGoldenEggCanonical(bars(1200), { symbol: 'TEST', assetClass: 'equity', timeframe: 'daily' });
    expect(seen).toEqual([1000]);
  });

  it('daily picks read up to 1,000 bars (was 500)', () => {
    expect(DAILY_PICK_MAX_BARS).toBe(1000);
    canonicalForDailyPick(bars(1500), { symbol: 'TEST', assetClass: 'equity', nowMs: Date.parse('2026-09-25T00:00:00Z') });
    expect(seen).toEqual([1000]);
  });

  it('scan-daily crypto asks for 6 × 180-day windows by default', async () => {
    expect(DAILY_SCAN_CRYPTO_WINDOWS).toBe(6);
    const b = bars(1080);
    fetchCryptoSeriesMock.mockResolvedValue({ bars: b, currentPrice: b[b.length - 1].close, source: 'test' });
    const out = await scanCryptoDailyIndicators('BTC', null);
    expect(out.ok).toBe(true);
    expect(fetchCryptoSeriesMock).toHaveBeenCalledTimes(1);
    expect(fetchCryptoSeriesMock.mock.calls[0][1]).toBe('daily');
    expect(fetchCryptoSeriesMock.mock.calls[0][3]).toMatchObject({ dailyWindows: 6 });
    if (out.ok) expect(out.barCount).toBe(1080);
  });
});
