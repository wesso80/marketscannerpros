/**
 * scan-daily crypto indicators: computed locally from the real coin's daily
 * OHLC (fixture data, no network) + EMA200 sanity guard.
 *
 * Regression for the bug where /api/jobs/scan-daily asked Alpha Vantage for
 * RSI/MACD/EMA200/... with a bare crypto symbol (resolved as a US equity/ETF),
 * producing e.g. ETH EMA200 = 22.22 against a coin price of ~2688.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeCryptoDailyIndicators,
  ema200SanityFailure,
  scanCryptoDailyIndicators,
  EMA200_SANITY_MAX_RATIO,
} from '@/lib/scanner/dailyCryptoIndicators';
import { calculateEMA, calculateRSI } from '@/lib/scanner-indicators';
import type { Bar } from '@/lib/scanner/barAggregation';
import type { CryptoSeries } from '@/lib/scanner/cryptoBars';

const DAY = 86_400_000;

/** Deterministic daily bars: gentle uptrend with a cycle, base price `base`. */
function fixtureBars(n: number, base: number): Bar[] {
  const start = Date.UTC(2025, 0, 1);
  return Array.from({ length: n }, (_, i) => {
    const close = base * (1 + i * 0.002 + 0.05 * Math.sin(i / 7));
    const open = close * (1 - 0.004 * Math.cos(i / 3));
    const high = Math.max(open, close) * 1.012;
    const low = Math.min(open, close) * 0.988;
    return { t: new Date(start + i * DAY).toISOString(), open, high, low, close, volume: null };
  });
}

function series(bars: Bar[]): CryptoSeries {
  const last = bars[bars.length - 1] ?? null;
  return {
    coinId: 'ethereum', timeframe: 'daily', barInterval: '1d', bars, partialBar: null,
    lastCompletedBarAt: last?.t ?? null, currentPrice: last?.close ?? null,
    hlBasis: 'exchange_ohlc', volumeBasis: 'unavailable', source: 'fixture', warnings: [],
  };
}

describe('computeCryptoDailyIndicators', () => {
  it('computes the full indicator set from daily coin OHLC with the shared scanner math', () => {
    const bars = fixtureBars(360, 2000);
    const ind = computeCryptoDailyIndicators(bars);
    const closes = bars.map((b) => b.close);

    for (const key of ['ema200', 'rsi', 'macd', 'macdSignal', 'adx', 'stochK', 'stochD', 'aroonUp', 'aroonDown', 'cci'] as const) {
      expect(Number.isFinite(ind[key]), key).toBe(true);
    }
    const ema = calculateEMA(closes, 200);
    expect(ind.ema200).toBeCloseTo(ema[ema.length - 1], 8);
    expect(ind.rsi).toBeCloseTo(calculateRSI(closes, 14), 8);
    // EMA200 is on the coin's own scale, not an ETF's.
    const last = closes[closes.length - 1];
    expect(ind.ema200!).toBeGreaterThan(last / 2);
    expect(ind.ema200!).toBeLessThan(last * 2);
    expect(ind.rsi!).toBeGreaterThanOrEqual(0);
    expect(ind.rsi!).toBeLessThanOrEqual(100);
    expect(ind.adx!).toBeGreaterThanOrEqual(0);
    expect(ind.adx!).toBeLessThanOrEqual(100);
    expect(ind.aroonUp!).toBeGreaterThanOrEqual(0);
    expect(ind.aroonUp!).toBeLessThanOrEqual(100);
  });

  it('omits EMA200 (rather than inventing one) when fewer than 200 daily bars exist', () => {
    const ind = computeCryptoDailyIndicators(fixtureBars(150, 100));
    expect(ind.ema200).toBeUndefined();
    expect(Number.isFinite(ind.rsi)).toBe(true);
  });

  it('returns nothing for empty history', () => {
    expect(computeCryptoDailyIndicators([])).toEqual({});
  });
});

describe('ema200SanityFailure', () => {
  it('flags the ETF-vs-coin mismatches seen in production (2026-09-24)', () => {
    expect(ema200SanityFailure(2688.39, 22.2201)).toMatch(/EMA200/);   // ETH vs Grayscale ETH Mini Trust
    expect(ema200SanityFailure(84458.69, 33.7731)).toMatch(/EMA200/);  // BTC vs Grayscale BTC Mini Trust
    expect(ema200SanityFailure(116.9, 1.9986)).toMatch(/EMA200/);      // SOL
    expect(ema200SanityFailure(1.5355, 16.3149)).toMatch(/EMA200/);    // XRP (EMA far ABOVE price)
  });

  it('passes realistic coin values and missing inputs', () => {
    expect(ema200SanityFailure(2688.39, 2237)).toBeNull();
    expect(ema200SanityFailure(84458.69, 73725)).toBeNull();
    expect(ema200SanityFailure(100, 100 * EMA200_SANITY_MAX_RATIO)).toBeNull();
    expect(ema200SanityFailure(100, undefined)).toBeNull();
    expect(ema200SanityFailure(null, 100)).toBeNull();
  });
});

describe('scanCryptoDailyIndicators', () => {
  it('uses the spot price for display and scores on real coin history', async () => {
    const bars = fixtureBars(360, 2000);
    const out = await scanCryptoDailyIndicators('ETH', 2700, async (s) => { expect(s).toBe('ETH'); return series(bars); });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.price).toBe(2700);
    expect(out.indicators.price).toBe(2700);
    expect(out.barCount).toBe(360);
    expect(ema200SanityFailure(out.price, out.indicators.ema200)).toBeNull();
  });

  it('falls back to the latest CoinGecko price when the spot price is unavailable', async () => {
    const bars = fixtureBars(360, 2000);
    const out = await scanCryptoDailyIndicators('ETH', null, async () => series(bars));
    expect(out.ok && out.price).toBe(bars[bars.length - 1].close);
  });

  it('drops the result when EMA200 and price are more than 5x apart', async () => {
    // History on an ETF-like scale (~25) paired with a coin spot price (~2688).
    const out = await scanCryptoDailyIndicators('ETH', 2688.39, async () => series(fixtureBars(360, 20)));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/EMA200 sanity check failed/);
  });

  it('drops the result when daily history cannot be fetched', async () => {
    const out = await scanCryptoDailyIndicators('BNB', 600, async () => { throw new Error('CoinGecko daily OHLC unavailable'); });
    expect(out).toEqual({ ok: false, reason: expect.stringMatching(/daily history unavailable/) });
  });

  it('drops the result when there is no history at all', async () => {
    const out = await scanCryptoDailyIndicators('BNB', 600, async () => series([]));
    expect(out.ok).toBe(false);
  });
});

describe('scan-daily route', () => {
  it('no longer requests Alpha Vantage indicators with a bare crypto symbol', () => {
    const src = readFileSync(resolve(__dirname, '../app/api/jobs/scan-daily/route.ts'), 'utf8');
    const start = src.indexOf('async function scanCrypto(');
    const end = src.indexOf('async function scanForex(');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, end);
    expect(body).not.toMatch(/function=(RSI|MACD|STOCH|ADX|EMA|AROON|CCI)&symbol=/);
    expect(body).toContain('scanCryptoDailyIndicators(');
  });
});
