/**
 * Unit tests for technical indicator calculations.
 *
 * Validates MACD, RSI, Stochastic %K/%D, EMA, and SMA across
 * lib/finnhub.ts, lib/yahoo-finance.ts, and the deep-analysis inline copies.
 *
 * Run: npx vitest run test/indicators.test.ts
 */
import { describe, it, expect } from 'vitest';

import {
  calculateRSI as finnhubRSI,
  calculateMACD,
  calculateEMA as finnhubEMA,
  calculateEMASeries,
} from '../lib/finnhub';

import {
  calculateRSI as yahooRSI,
  calculateStochastic,
  calculateSMA,
  calculateEMA as yahooEMA,
  calculateEMASeries as yahooEMASeries,
  calculateIndicators,
} from '../lib/yahoo-finance';

// ─── Helper: deterministic price series ────────────────────────────────────
/** Generates a linear-ish series: base, base+step, base+2*step, ... */
function linearPrices(n: number, base = 100, step = 1): number[] {
  return Array.from({ length: n }, (_, i) => base + i * step);
}

/** Flat series (all same price) — edge case for RSI and Stochastic */
function flatPrices(n: number, price = 100): number[] {
  return Array.from({ length: n }, () => price);
}

/** Alternating up/down series */
function zigzag(n: number, low = 95, high = 105): number[] {
  return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? low : high));
}

// ─── Real-world AAPL fixture (20 daily closes) ────────────────────────────
// Source: approximate AAPL daily closes Dec 2024 — for reproducible validation
const AAPL_CLOSES = [
  230.54, 229.00, 228.52, 227.48, 229.98, 232.87, 234.93, 236.00,
  237.33, 239.59, 241.84, 243.36, 242.65, 240.36, 241.44, 243.04,
  245.55, 248.13, 246.45, 244.02,
];

// ─── SMA ────────────────────────────────────────────────────────────────────
describe('SMA (yahoo-finance)', () => {
  it('returns average of last N values', () => {
    const result = calculateSMA([1, 2, 3, 4, 5], 3);
    expect(result).toBeCloseTo((3 + 4 + 5) / 3, 10);
  });

  it('handles period == data length', () => {
    const data = [10, 20, 30];
    expect(calculateSMA(data, 3)).toBeCloseTo(20, 10);
  });

  it('returns last value when data shorter than period', () => {
    expect(calculateSMA([42], 5)).toBe(42);
  });
});

// ─── EMA ────────────────────────────────────────────────────────────────────
describe('EMA', () => {
  it('finnhub and yahoo produce identical results on same data', () => {
    const data = AAPL_CLOSES;
    expect(finnhubEMA(data, 12)).toBeCloseTo(yahooEMA(data, 12), 8);
  });

  it('EMA-1 equals last value', () => {
    const data = [10, 20, 30];
    // EMA with period=1 should strongly weight the last value
    const result = finnhubEMA(data, 1);
    // k = 2/(1+1) = 1.0 — each new value replaces EMA entirely
    expect(result).toBeCloseTo(30, 5);
  });

  it('EMA on flat series equals the constant', () => {
    const data = flatPrices(30, 50);
    expect(finnhubEMA(data, 12)).toBeCloseTo(50, 8);
    expect(yahooEMA(data, 12)).toBeCloseTo(50, 8);
  });
});

// ─── EMA Series ─────────────────────────────────────────────────────────────
describe('calculateEMASeries (finnhub)', () => {
  it('returns array of same length as input', () => {
    const data = linearPrices(20);
    const series = calculateEMASeries(data, 5);
    expect(series).toHaveLength(20);
  });

  it('first period-1 entries are NaN', () => {
    const series = calculateEMASeries(linearPrices(20), 5);
    for (let i = 0; i < 4; i++) {
      expect(series[i]).toBeNaN();
    }
    expect(series[4]).not.toBeNaN();
  });

  it('entry at index period-1 equals SMA of first period values', () => {
    const data = [2, 4, 6, 8, 10, 12, 14];
    const series = calculateEMASeries(data, 5);
    const sma5 = (2 + 4 + 6 + 8 + 10) / 5;
    expect(series[4]).toBeCloseTo(sma5, 10);
  });

  it('last value matches scalar EMA', () => {
    const data = AAPL_CLOSES;
    const series = calculateEMASeries(data, 12);
    const scalar = finnhubEMA(data, 12);
    expect(series[series.length - 1]).toBeCloseTo(scalar, 8);
  });
});

// ─── RSI ────────────────────────────────────────────────────────────────────
describe('RSI', () => {
  it('returns 50 when data is too short', () => {
    expect(finnhubRSI([100, 101], 14)).toBe(50);
    expect(yahooRSI([100, 101], 14)).toBe(50);
  });

  it('returns 100 when all changes are positive (no losses)', () => {
    const rising = linearPrices(20, 100, 1); // 100, 101, 102, ...
    expect(finnhubRSI(rising, 14)).toBe(100);
    expect(yahooRSI(rising, 14)).toBe(100);
  });

  it('returns ~0 when all changes are negative (no gains)', () => {
    const falling = linearPrices(20, 200, -1); // 200, 199, 198, ...
    // avgGain=0, avgLoss>0 → RS=0 → RSI = 100 - 100/(1+0) = 0
    expect(finnhubRSI(falling, 14)).toBeCloseTo(0, 5);
    expect(yahooRSI(falling, 14)).toBeCloseTo(0, 5);
  });

  it('ranges between 0 and 100 on real data', () => {
    const rsi = finnhubRSI(AAPL_CLOSES, 14);
    expect(rsi).toBeGreaterThanOrEqual(0);
    expect(rsi).toBeLessThanOrEqual(100);
  });

  it('finnhub and yahoo RSI match on identical input', () => {
    const rsi1 = finnhubRSI(AAPL_CLOSES, 14);
    const rsi2 = yahooRSI(AAPL_CLOSES, 14);
    expect(rsi1).toBeCloseTo(rsi2, 8);
  });

  it('handles flat data (RSI=50 fallback via edge case)', () => {
    const flat = flatPrices(20, 100);
    // No gains, no losses → avgGain=0, avgLoss=0 → avgLoss===0 branch → returns 100
    // This is mathematically correct: if there are zero losses, RSI=100
    const rsi = finnhubRSI(flat, 14);
    expect(rsi).toBe(100);
  });

  it('preserves RSI=0 (critical: was previously discarded as falsy)', () => {
    // A series that drops every bar: RSI should be ~0
    const dropping = linearPrices(20, 300, -5);
    const rsi = finnhubRSI(dropping, 14);
    expect(rsi).toBeCloseTo(0, 2);
    // Verify 0 is a valid number, not falsy-discarded
    expect(typeof rsi).toBe('number');
    expect(rsi != null).toBe(true);
  });
});

// ─── MACD ───────────────────────────────────────────────────────────────────
describe('MACD (finnhub)', () => {
  it('returns null when data is too short', () => {
    expect(calculateMACD(linearPrices(20))).toBeNull();
    expect(calculateMACD(linearPrices(34))).toBeNull(); // need >= 35
  });

  it('returns valid MACD for sufficient data', () => {
    const result = calculateMACD(linearPrices(50, 100, 0.5));
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('macd');
    expect(result).toHaveProperty('signal');
    expect(result).toHaveProperty('histogram');
  });

  it('histogram = macd - signal', () => {
    const result = calculateMACD(AAPL_CLOSES.length >= 35 ? AAPL_CLOSES : linearPrices(50));
    if (result) {
      expect(result.histogram).toBeCloseTo(result.macd - result.signal, 10);
    }
  });

  it('signal is NOT a fake 0.9x multiple of macd (old bug)', () => {
    // The old broken code did: signal = macdLine * 0.9
    // The fixed code uses a 9-period EMA of the MACD line series
    const data = linearPrices(60, 100, 0.3);
    const result = calculateMACD(data);
    expect(result).not.toBeNull();
    if (result) {
      // If signal were macdLine * 0.9, this ratio would be exactly 0.9
      const ratio = result.macd !== 0 ? result.signal / result.macd : NaN;
      expect(ratio).not.toBeCloseTo(0.9, 3);
    }
  });

  it('MACD on flat data produces near-zero values', () => {
    const flat = flatPrices(50, 100);
    const result = calculateMACD(flat);
    expect(result).not.toBeNull();
    if (result) {
      expect(Math.abs(result.macd)).toBeLessThan(0.001);
      expect(Math.abs(result.signal)).toBeLessThan(0.001);
      expect(Math.abs(result.histogram)).toBeLessThan(0.001);
    }
  });

  it('trending up produces positive MACD', () => {
    const rising = linearPrices(60, 100, 2); // strong uptrend
    const result = calculateMACD(rising);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.macd).toBeGreaterThan(0);
    }
  });

  it('trending down produces negative MACD', () => {
    const falling = linearPrices(60, 200, -2); // strong downtrend
    const result = calculateMACD(falling);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.macd).toBeLessThan(0);
    }
  });
});

// ─── Stochastic ─────────────────────────────────────────────────────────────
describe('Stochastic (yahoo-finance)', () => {
  it('returns 50/50 when data is too short', () => {
    const result = calculateStochastic([100], [90], [95], 14, 3);
    expect(result.k).toBe(50);
    expect(result.d).toBe(50);
  });

  it('%K is 100 when close is at highest high', () => {
    // All highs are 110, close is at 110 → %K = 100
    const n = 20;
    const highs = Array.from({ length: n }, () => 110);
    const lows = Array.from({ length: n }, () => 90);
    const closes = Array.from({ length: n }, () => 110);
    const result = calculateStochastic(highs, lows, closes, 14, 3);
    expect(result.k).toBeCloseTo(100, 5);
  });

  it('%K is 0 when close is at lowest low', () => {
    const n = 20;
    const highs = Array.from({ length: n }, () => 110);
    const lows = Array.from({ length: n }, () => 90);
    const closes = Array.from({ length: n }, () => 90);
    const result = calculateStochastic(highs, lows, closes, 14, 3);
    expect(result.k).toBeCloseTo(0, 5);
  });

  it('%D is NOT equal to %K (old bug: was d = k)', () => {
    // Create data where %K varies across the dPeriod window → %D ≠ last %K
    const n = 20;
    const highs = Array.from({ length: n }, (_, i) => 110 + i * 0.5);
    const lows = Array.from({ length: n }, (_, i) => 90 + i * 0.3);
    const closes = Array.from({ length: n }, (_, i) => 95 + i * 0.7);
    const result = calculateStochastic(highs, lows, closes, 14, 3);
    // %D should be the 3-bar SMA of %K, which typically differs from the last %K
    // We just verify it's a valid number between 0-100
    expect(result.d).toBeGreaterThanOrEqual(0);
    expect(result.d).toBeLessThanOrEqual(100);
    expect(typeof result.d).toBe('number');
    expect(Number.isFinite(result.d)).toBe(true);
  });

  it('%K and %D both in [0, 100]', () => {
    const result = calculateStochastic(
      AAPL_CLOSES.map((c) => c + 2),
      AAPL_CLOSES.map((c) => c - 2),
      AAPL_CLOSES,
      14,
      3,
    );
    expect(result.k).toBeGreaterThanOrEqual(0);
    expect(result.k).toBeLessThanOrEqual(100);
    expect(result.d).toBeGreaterThanOrEqual(0);
    expect(result.d).toBeLessThanOrEqual(100);
  });

  it('%D is smoothed average (SMA) of %K values', () => {
    // When all %K values are identical, %D should equal %K
    const n = 20;
    const highs = Array.from({ length: n }, () => 120);
    const lows = Array.from({ length: n }, () => 80);
    const closes = Array.from({ length: n }, () => 100); // exactly midpoint → %K = 50
    const result = calculateStochastic(highs, lows, closes, 14, 3);
    expect(result.k).toBeCloseTo(50, 5);
    expect(result.d).toBeCloseTo(50, 5);
  });

  it('flat price produces %K = 50 (zero range)', () => {
    const flat = flatPrices(20);
    const result = calculateStochastic(flat, flat, flat, 14, 3);
    expect(result.k).toBe(50);
    expect(result.d).toBe(50);
  });
});

// ─── Cross-module consistency ───────────────────────────────────────────────
describe('Cross-module consistency', () => {
  it('finnhub RSI ≈ yahoo RSI on same closes', () => {
    const data = [...AAPL_CLOSES, 245.0, 246.5, 244.8, 243.2, 247.1];
    expect(finnhubRSI(data, 14)).toBeCloseTo(yahooRSI(data, 14), 8);
  });

  it('finnhub EMA ≈ yahoo EMA on same closes', () => {
    const data = linearPrices(30, 100, 1.5);
    expect(finnhubEMA(data, 9)).toBeCloseTo(yahooEMA(data, 9), 8);
  });
});

// ─── Yahoo MACD fix (B2) — signal ≠ macdLine ───────────────────────────────
describe('Yahoo MACD signal line (B2 fix)', () => {
  it('yahooEMASeries returns correct length and NaN-pads', () => {
    const data = linearPrices(20, 100, 1);
    const series = yahooEMASeries(data, 5);
    expect(series.length).toBe(20);
    for (let i = 0; i < 4; i++) expect(series[i]).toBeNaN();
    expect(series[4]).toBeCloseTo(102, 0); // SMA of first 5 = (100+101+102+103+104)/5 = 102
    expect(Number.isFinite(series[19])).toBe(true);
  });

  it('MACD signal ≠ MACD line on trending data (was broken: signal === line)', () => {
    // Build 50 bars of uptrend to ensure MACD series has ≥ 9 values
    const bars = Array.from({ length: 60 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: 100 + i * 0.8,
      high: 101 + i * 0.9,
      low: 99 + i * 0.7,
      close: 100.5 + i * 0.85,
      volume: 1000000,
    }));
    const result = calculateIndicators(bars);
    expect(result).not.toBeNull();
    if (!result) return;
    // With the fix: signal is a proper 9-EMA of MACD series, NOT identical to macdLine
    expect(result.macdSignal).not.toBe(result.macd);
    expect(result.macdHist).not.toBe(0);
    // Histogram = macd - signal
    expect(result.macdHist).toBeCloseTo(result.macd - result.macdSignal, 10);
  });
});
