/**
 * Data Quality Validation Layer
 *
 * Validates and sanitizes OHLCV bar data before it reaches indicator calculations.
 * Catches NaN, null, zero-volume, high < low, and other anomalies that corrupt signals.
 *
 * Usage:
 *   import { validateBars, validateCloses } from '@/lib/dataQuality';
 *   const clean = validateBars(rawBars);
 *   if (clean.warnings.length > 0) console.warn('[DQ]', clean.warnings);
 *   calculateIndicators(clean.bars);
 */

export interface OHLCVBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp?: number | string;
}

export interface ValidationResult<T> {
  data: T;
  dropped: number;
  warnings: string[];
}

// ─── Bar-level validation ───────────────────────────────────────────────────

function isFinitePositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function isFiniteNonNeg(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

/**
 * Validate a single OHLCV bar. Returns null if bar is invalid.
 */
function validateBar(bar: Partial<OHLCVBar>, index: number, warnings: string[]): OHLCVBar | null {
  const { open, high, low, close, volume, timestamp } = bar;

  // All prices must be finite positive numbers
  if (!isFinitePositive(open) || !isFinitePositive(high) || !isFinitePositive(low) || !isFinitePositive(close)) {
    warnings.push(`Bar ${index}: non-positive or non-finite price (O=${open} H=${high} L=${low} C=${close})`);
    return null;
  }

  // Volume must be finite non-negative
  if (!isFiniteNonNeg(volume)) {
    warnings.push(`Bar ${index}: invalid volume (${volume}), defaulting to 0`);
    return { open, high, low, close, volume: 0, timestamp };
  }

  // High >= Low invariant
  if (high < low) {
    warnings.push(`Bar ${index}: high (${high}) < low (${low}), swapping`);
    return { open, high: low, low: high, close, volume, timestamp };
  }

  // High should be >= open and close; Low should be <= open and close
  // Auto-correct rather than discard
  const correctedHigh = Math.max(high, open, close);
  const correctedLow = Math.min(low, open, close);
  if (correctedHigh !== high || correctedLow !== low) {
    warnings.push(`Bar ${index}: OHLC envelope violation, auto-corrected H/L`);
    return { open, high: correctedHigh, low: correctedLow, close, volume, timestamp };
  }

  return { open, high, low, close, volume, timestamp };
}

/**
 * Validate and sanitize an array of OHLCV bars.
 * Drops bars with NaN/null/negative prices and corrects minor anomalies.
 */
export function validateBars(bars: Partial<OHLCVBar>[]): ValidationResult<OHLCVBar[]> {
  const warnings: string[] = [];
  const clean: OHLCVBar[] = [];
  let dropped = 0;

  for (let i = 0; i < bars.length; i++) {
    const result = validateBar(bars[i], i, warnings);
    if (result) {
      clean.push(result);
    } else {
      dropped++;
    }
  }

  // Check for suspicious gaps: if >20% of bars are dropped, flag it
  if (bars.length > 0 && dropped / bars.length > 0.2) {
    warnings.push(`High drop rate: ${dropped}/${bars.length} bars (${(dropped / bars.length * 100).toFixed(1)}%) were invalid`);
  }

  // Check for duplicate timestamps
  if (clean.length > 1 && clean[0].timestamp != null) {
    const timestamps = clean.map(b => String(b.timestamp));
    const uniqueTs = new Set(timestamps);
    if (uniqueTs.size < timestamps.length) {
      warnings.push(`${timestamps.length - uniqueTs.size} duplicate timestamps detected`);
    }
  }

  // Check for flat/stale data (all closes identical — likely stale cache)
  if (clean.length >= 10) {
    const lastN = clean.slice(-10);
    const allSame = lastN.every(b => b.close === lastN[0].close);
    if (allSame) {
      warnings.push('Last 10 bars have identical closes — possible stale data');
    }
  }

  return { data: clean, dropped, warnings };
}

// ─── Close-only validation ──────────────────────────────────────────────────

/**
 * Validate an array of close prices for indicator input.
 * Filters out NaN/null/undefined/negative values.
 */
export function validateCloses(closes: unknown[]): ValidationResult<number[]> {
  const warnings: string[] = [];
  const clean: number[] = [];
  let dropped = 0;

  for (let i = 0; i < closes.length; i++) {
    const v = closes[i];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      clean.push(v);
    } else {
      dropped++;
      if (dropped <= 5) {
        warnings.push(`Close[${i}]: invalid value ${v}`);
      }
    }
  }

  if (dropped > 5) {
    warnings.push(`... and ${dropped - 5} more invalid close values`);
  }

  return { data: clean, dropped, warnings };
}

// ─── Indicator output validation ────────────────────────────────────────────

/**
 * Clamp an indicator value to valid bounds, returning null if NaN/Infinity.
 */
export function clampIndicator(value: number, min: number, max: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, value));
}

/**
 * Validate RSI output — must be [0, 100].
 */
export function validateRSI(rsi: number): number | null {
  return clampIndicator(rsi, 0, 100);
}

/**
 * Validate Stochastic %K/%D output — must be [0, 100].
 */
export function validateStochastic(k: number, d: number): { k: number; d: number } | null {
  const vk = clampIndicator(k, 0, 100);
  const vd = clampIndicator(d, 0, 100);
  if (vk == null || vd == null) return null;
  return { k: vk, d: vd };
}

/**
 * Check if a price quote is suspiciously stale.
 * Returns true if the timestamp is older than maxAgeMs.
 */
export function isStaleQuote(timestamp: number | string | Date, maxAgeMs: number): boolean {
  const ts = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > maxAgeMs;
}

// ─── Format-specific adapters ───────────────────────────────────────────────

/**
 * Validate Finnhub columnar candle data (arrays of c, h, l, o, v, t).
 * Filters out bars where any price column has NaN/Infinity/negative.
 * Returns sanitized column arrays with bad rows removed.
 */
export function validateFinnhubCandles<T extends { c: number[]; h: number[]; l: number[]; o: number[]; v: number[]; t: number[] }>(
  candles: T
): ValidationResult<T> {
  const warnings: string[] = [];
  const len = candles.c.length;
  const goodIdx: number[] = [];

  for (let i = 0; i < len; i++) {
    const o = candles.o[i], h = candles.h[i], l = candles.l[i], c = candles.c[i], v = candles.v[i];
    if (!isFinitePositive(o) || !isFinitePositive(h) || !isFinitePositive(l) || !isFinitePositive(c)) {
      warnings.push(`Candle[${i}]: non-positive/non-finite price (O=${o} H=${h} L=${l} C=${c})`);
      continue;
    }
    if (!isFiniteNonNeg(v)) {
      warnings.push(`Candle[${i}]: invalid volume ${v}, defaulting to 0`);
      candles.v[i] = 0;
    }
    goodIdx.push(i);
  }

  const dropped = len - goodIdx.length;
  if (dropped > 0 && len > 0 && dropped / len > 0.2) {
    warnings.push(`High drop rate: ${dropped}/${len} candles (${(dropped / len * 100).toFixed(1)}%) were invalid`);
  }

  // Rebuild column arrays with only good indices
  const result = {
    ...candles,
    c: goodIdx.map(i => candles.c[i]),
    h: goodIdx.map(i => candles.h[i]),
    l: goodIdx.map(i => candles.l[i]),
    o: goodIdx.map(i => candles.o[i]),
    v: goodIdx.map(i => candles.v[i]),
    t: goodIdx.map(i => candles.t[i]),
  };

  // Stale data check
  if (result.c.length >= 10) {
    const lastN = result.c.slice(-10);
    if (lastN.every(v => v === lastN[0])) {
      warnings.push('Last 10 candles have identical closes — possible stale data');
    }
  }

  return { data: result, dropped, warnings };
}

/**
 * Validate Yahoo-style row-based bar data.
 * Filters out bars with NaN/Infinity/negative prices and autocorrects H/L envelope.
 */
export function validateYahooBars<T extends { open: number; high: number; low: number; close: number; volume: number }>(
  bars: T[]
): ValidationResult<T[]> {
  const warnings: string[] = [];
  const clean: T[] = [];
  let dropped = 0;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (!isFinitePositive(b.open) || !isFinitePositive(b.high) || !isFinitePositive(b.low) || !isFinitePositive(b.close)) {
      warnings.push(`Bar[${i}]: non-positive/non-finite price`);
      dropped++;
      continue;
    }
    // Auto-correct volume
    if (!isFiniteNonNeg(b.volume)) {
      warnings.push(`Bar[${i}]: invalid volume ${b.volume}, defaulting to 0`);
      b.volume = 0;
    }
    // Auto-correct H/L envelope
    b.high = Math.max(b.high, b.open, b.close);
    b.low = Math.min(b.low, b.open, b.close);
    clean.push(b);
  }

  if (bars.length > 0 && dropped / bars.length > 0.2) {
    warnings.push(`High drop rate: ${dropped}/${bars.length} bars (${(dropped / bars.length * 100).toFixed(1)}%) were invalid`);
  }

  if (clean.length >= 10) {
    const lastN = clean.slice(-10);
    if (lastN.every(b => b.close === lastN[0].close)) {
      warnings.push('Last 10 bars have identical closes — possible stale data');
    }
  }

  return { data: clean, dropped, warnings };
}
