import { describe, it, expect } from 'vitest';
import {
  validateBars,
  validateCloses,
  validateRSI,
  validateStochastic,
  clampIndicator,
  isStaleQuote,
} from '../lib/dataQuality';
import type { OHLCVBar } from '../lib/dataQuality';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeBar(overrides: Partial<OHLCVBar> = {}): OHLCVBar {
  return { open: 100, high: 105, low: 95, close: 102, volume: 1000, ...overrides };
}

// ─── validateBars ───────────────────────────────────────────────────────────

describe('validateBars', () => {
  it('passes through valid bars unchanged', () => {
    const bars = [makeBar(), makeBar({ close: 103 })];
    const result = validateBars(bars);
    expect(result.data.length).toBe(2);
    expect(result.dropped).toBe(0);
    expect(result.warnings.length).toBe(0);
  });

  it('drops bars with NaN prices', () => {
    const bars = [makeBar(), makeBar({ close: NaN }), makeBar({ open: NaN })];
    const result = validateBars(bars);
    expect(result.data.length).toBe(1);
    expect(result.dropped).toBe(2);
  });

  it('drops bars with Infinity prices', () => {
    const bars = [makeBar(), makeBar({ high: Infinity })];
    const result = validateBars(bars);
    expect(result.data.length).toBe(1);
    expect(result.dropped).toBe(1);
  });

  it('drops bars with zero prices', () => {
    const bars = [makeBar({ close: 0 })];
    const result = validateBars(bars);
    expect(result.data.length).toBe(0);
    expect(result.dropped).toBe(1);
  });

  it('drops bars with negative prices', () => {
    const bars = [makeBar({ low: -5 })];
    const result = validateBars(bars);
    expect(result.data.length).toBe(0);
    expect(result.dropped).toBe(1);
  });

  it('defaults volume to 0 when volume is NaN', () => {
    const bars = [makeBar({ volume: NaN })];
    const result = validateBars(bars);
    expect(result.data.length).toBe(1);
    expect(result.data[0].volume).toBe(0);
    expect(result.warnings.some(w => w.includes('invalid volume'))).toBe(true);
  });

  it('swaps high and low when high < low', () => {
    const bars = [makeBar({ high: 90, low: 110 })];
    const result = validateBars(bars);
    expect(result.data.length).toBe(1);
    expect(result.data[0].high).toBe(110);
    expect(result.data[0].low).toBe(90);
    expect(result.warnings.some(w => w.includes('swapping'))).toBe(true);
  });

  it('corrects OHLC envelope violation (close > high)', () => {
    const bars = [makeBar({ open: 100, high: 105, low: 95, close: 110 })];
    const result = validateBars(bars);
    expect(result.data[0].high).toBe(110); // corrected to max(high, open, close)
    expect(result.warnings.some(w => w.includes('envelope'))).toBe(true);
  });

  it('corrects OHLC envelope violation (open < low)', () => {
    const bars = [makeBar({ open: 90, high: 105, low: 95, close: 102 })];
    const result = validateBars(bars);
    expect(result.data[0].low).toBe(90); // corrected to min(low, open, close)
    expect(result.warnings.some(w => w.includes('envelope'))).toBe(true);
  });

  it('warns on high drop rate (>20%)', () => {
    const bars = [makeBar(), makeBar({ close: NaN }), makeBar({ open: NaN }), makeBar({ high: NaN })];
    const result = validateBars(bars); // 3/4 dropped = 75%
    expect(result.warnings.some(w => w.includes('High drop rate'))).toBe(true);
  });

  it('warns on duplicate timestamps', () => {
    const bars = [
      makeBar({ timestamp: 1000 }),
      makeBar({ timestamp: 2000 }),
      makeBar({ timestamp: 1000 }),
    ];
    const result = validateBars(bars);
    expect(result.warnings.some(w => w.includes('duplicate timestamps'))).toBe(true);
  });

  it('warns on flat/stale data (10+ identical closes)', () => {
    const bars = Array.from({ length: 12 }, () => makeBar({ close: 100 }));
    const result = validateBars(bars);
    expect(result.warnings.some(w => w.includes('stale data'))).toBe(true);
  });

  it('handles empty array', () => {
    const result = validateBars([]);
    expect(result.data.length).toBe(0);
    expect(result.dropped).toBe(0);
    expect(result.warnings.length).toBe(0);
  });
});

// ─── validateCloses ─────────────────────────────────────────────────────────

describe('validateCloses', () => {
  it('passes through valid closes', () => {
    const result = validateCloses([100, 101, 102]);
    expect(result.data).toEqual([100, 101, 102]);
    expect(result.dropped).toBe(0);
  });

  it('filters out NaN values', () => {
    const result = validateCloses([100, NaN, 102]);
    expect(result.data).toEqual([100, 102]);
    expect(result.dropped).toBe(1);
  });

  it('filters out null/undefined', () => {
    const result = validateCloses([100, null, undefined, 102]);
    expect(result.data).toEqual([100, 102]);
    expect(result.dropped).toBe(2);
  });

  it('filters out zero and negative values', () => {
    const result = validateCloses([100, 0, -5, 102]);
    expect(result.data).toEqual([100, 102]);
    expect(result.dropped).toBe(2);
  });

  it('filters out Infinity', () => {
    const result = validateCloses([100, Infinity, -Infinity, 102]);
    expect(result.data).toEqual([100, 102]);
    expect(result.dropped).toBe(2);
  });

  it('truncates warnings after 5 invalid values', () => {
    const closes = [NaN, NaN, NaN, NaN, NaN, NaN, NaN, 100];
    const result = validateCloses(closes);
    expect(result.data).toEqual([100]);
    expect(result.dropped).toBe(7);
    expect(result.warnings.some(w => w.includes('... and 2 more'))).toBe(true);
  });
});

// ─── Indicator output validators ────────────────────────────────────────────

describe('validateRSI', () => {
  it('passes valid RSI in range', () => {
    expect(validateRSI(50)).toBe(50);
    expect(validateRSI(0)).toBe(0);
    expect(validateRSI(100)).toBe(100);
  });

  it('clamps out-of-range RSI', () => {
    expect(validateRSI(-5)).toBe(0);
    expect(validateRSI(105)).toBe(100);
  });

  it('returns null for NaN/Infinity', () => {
    expect(validateRSI(NaN)).toBeNull();
    expect(validateRSI(Infinity)).toBeNull();
  });
});

describe('validateStochastic', () => {
  it('passes valid stochastic values', () => {
    const result = validateStochastic(65, 60);
    expect(result).toEqual({ k: 65, d: 60 });
  });

  it('clamps out-of-range values', () => {
    const result = validateStochastic(110, -5);
    expect(result).toEqual({ k: 100, d: 0 });
  });

  it('returns null if either is NaN', () => {
    expect(validateStochastic(NaN, 50)).toBeNull();
    expect(validateStochastic(50, NaN)).toBeNull();
  });
});

describe('clampIndicator', () => {
  it('clamps to min/max', () => {
    expect(clampIndicator(5, 0, 10)).toBe(5);
    expect(clampIndicator(-5, 0, 10)).toBe(0);
    expect(clampIndicator(15, 0, 10)).toBe(10);
  });

  it('returns null for non-finite', () => {
    expect(clampIndicator(NaN, 0, 100)).toBeNull();
    expect(clampIndicator(Infinity, 0, 100)).toBeNull();
  });
});

// ─── isStaleQuote ───────────────────────────────────────────────────────────

describe('isStaleQuote', () => {
  it('returns false for recent timestamp', () => {
    expect(isStaleQuote(Date.now() - 1000, 60_000)).toBe(false);
  });

  it('returns true for old timestamp', () => {
    expect(isStaleQuote(Date.now() - 120_000, 60_000)).toBe(true);
  });

  it('handles ISO string timestamps', () => {
    const recent = new Date(Date.now() - 1000).toISOString();
    expect(isStaleQuote(recent, 60_000)).toBe(false);
  });

  it('returns true for non-finite timestamp', () => {
    expect(isStaleQuote(NaN, 60_000)).toBe(true);
  });
});
