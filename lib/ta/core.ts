/**
 * Canonical technical-indicator math: ONE implementation for every scoring path.
 *
 * Every function matches the TradingView (Pine v5/v6) built-in of the same name so a value shown on MSP can be
 * checked against a TradingView chart:
 *
 *   sma      → ta.sma                   plain arithmetic mean of the last `length` values
 *   ema      → ta.ema                   alpha = 2/(length+1), SEEDED WITH ta.sma(src, length) (not the first value)
 *   rma      → ta.rma                   Wilder smoothing, alpha = 1/length, seeded with ta.sma(src, length)
 *   rsi      → ta.rsi                   rma of gains / rma of losses
 *   atr      → ta.atr                   rma of true range (first bar's TR = high − low)
 *   dmi      → ta.dmi(diLength, adxSmoothing): Wilder +DI / −DI / ADX (rma-smoothed DM and TR, ADX = rma of DX)
 *   macd     → ta.macd                  ema(fast) − ema(slow), signal = ema(macd, signal)
 *   stoch    → built-in "Stochastic" (%K length 14, %K smoothing 1, %D smoothing 3)
 *
 * Conventions
 *   • Inputs are oldest-first. Series outputs have the SAME length as the input; warm-up bars are NaN (never 0, never a
 *     made-up default such as ADX 25 or %K 50 — a missing statistic must stay missing so callers can flag it).
 *   • Leading non-finite inputs are skipped, like Pine ignores na, so `ema(macdLine, 9)` works on a NaN-prefixed series.
 *   • `last*` helpers return the final value or NaN.
 *
 * Why this exists: until Sep 2026 the scanner, bulk scanner, daily-picks job, Yahoo path and backtest each had their
 * own ADX/ATR/EMA. Two of them were not Wilder (EMA-smoothed ADX; a "simplified" ADX that defaulted to 25) and the
 * Golden Egg EMA200 was seeded from the first of only 300 bars, so the same ticker showed different trend strength and
 * different 200-day lines on different pages (e.g. ADBE on 24 Sep 2026: ADX 22.8 Wilder vs 40 on the EMA copy; EMA200
 * 267.10 on site vs 270.16 on TradingView).
 */

export function lastFinite(series: ArrayLike<number>): number {
  const v = series.length ? series[series.length - 1] : Number.NaN;
  return Number.isFinite(v) ? v : Number.NaN;
}

function firstFiniteIndex(values: ArrayLike<number>): number {
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) return i;
  return -1;
}

/** ta.sma — rolling mean; NaN until `length` values are available (and wherever the window holds a non-finite value). */
export function smaSeries(values: ArrayLike<number>, length: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(Number.NaN);
  if (!(length >= 1)) return out;
  let sum = 0;
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (Number.isFinite(v)) sum += v; else bad++;
    if (i >= length) {
      const old = values[i - length];
      if (Number.isFinite(old)) sum -= old; else bad--;
    }
    if (i >= length - 1 && bad === 0) out[i] = sum / length;
  }
  return out;
}

/**
 * Generic exponential smoother seeded with the SMA of the first `length` finite values (Pine's ta.ema / ta.rma).
 * Leading non-finite values are skipped; a non-finite value after the seed carries the previous value forward.
 */
function seededSmoother(values: ArrayLike<number>, length: number, alpha: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(Number.NaN);
  if (!(length >= 1)) return out;
  const start = firstFiniteIndex(values);
  if (start < 0 || n - start < length) return out;
  let seed = 0;
  for (let i = start; i < start + length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) return out; // gap inside the seed window: not enough clean history
    seed += v;
  }
  let prev = seed / length;
  out[start + length - 1] = prev;
  for (let i = start + length; i < n; i++) {
    const v = values[i];
    if (Number.isFinite(v)) prev = alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

/** ta.ema — alpha 2/(length+1), SMA-seeded. Needs ≥ length values; converges to TradingView after ~3–4×length bars. */
export function emaSeries(values: ArrayLike<number>, length: number): number[] {
  return seededSmoother(values, length, 2 / (length + 1));
}

/** ta.rma — Wilder's smoothing (alpha 1/length), SMA-seeded. */
export function rmaSeries(values: ArrayLike<number>, length: number): number[] {
  return seededSmoother(values, length, 1 / length);
}

/** ta.rsi(close, length) — Wilder RSI. */
export function rsiSeries(closes: ArrayLike<number>, length = 14): number[] {
  const n = closes.length;
  const gains = new Array<number>(n).fill(Number.NaN);
  const losses = new Array<number>(n).fill(Number.NaN);
  for (let i = 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    if (!Number.isFinite(ch)) continue;
    gains[i] = Math.max(ch, 0);
    losses[i] = Math.max(-ch, 0);
  }
  const up = rmaSeries(gains, length);
  const down = rmaSeries(losses, length);
  return up.map((u, i) => {
    const d = down[i];
    if (!Number.isFinite(u) || !Number.isFinite(d)) return Number.NaN;
    if (d === 0) return 100; // Pine: down == 0 ? 100 : up == 0 ? 0 : 100 - 100 / (1 + up / down)
    if (u === 0) return 0;
    return 100 - 100 / (1 + u / d);
  });
}

/**
 * True range. `firstBar` controls bar 0 (no previous close): 'highLow' → high − low (ta.atr / ta.tr(true)),
 * 'nan' → NaN (ta.tr(false), which ta.dmi uses).
 */
export function trueRangeSeries(highs: ArrayLike<number>, lows: ArrayLike<number>, closes: ArrayLike<number>, firstBar: 'highLow' | 'nan' = 'highLow'): number[] {
  const n = Math.min(highs.length, lows.length, closes.length);
  const out = new Array<number>(n).fill(Number.NaN);
  for (let i = 0; i < n; i++) {
    const h = highs[i], l = lows[i];
    if (i === 0) { out[0] = firstBar === 'highLow' ? h - l : Number.NaN; continue; }
    const pc = closes[i - 1];
    out[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return out;
}

/** ta.atr(length) — Wilder ATR (rma of true range). */
export function atrSeries(highs: ArrayLike<number>, lows: ArrayLike<number>, closes: ArrayLike<number>, length = 14): number[] {
  return rmaSeries(trueRangeSeries(highs, lows, closes, 'highLow'), length);
}

export interface DmiSeries { plusDI: number[]; minusDI: number[]; adx: number[] }

/** ta.dmi(diLength, adxSmoothing) — Wilder +DI, −DI and ADX. ADX needs ≈ diLength + adxSmoothing bars of history. */
export function dmiSeries(highs: ArrayLike<number>, lows: ArrayLike<number>, closes: ArrayLike<number>, diLength = 14, adxSmoothing = diLength): DmiSeries {
  const n = Math.min(highs.length, lows.length, closes.length);
  const plusDM = new Array<number>(n).fill(Number.NaN);
  const minusDM = new Array<number>(n).fill(Number.NaN);
  for (let i = 1; i < n; i++) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }
  const tr = rmaSeries(trueRangeSeries(highs, lows, closes, 'nan'), diLength);
  const pS = rmaSeries(plusDM, diLength);
  const mS = rmaSeries(minusDM, diLength);
  const plusDI = new Array<number>(n).fill(Number.NaN);
  const minusDI = new Array<number>(n).fill(Number.NaN);
  const dx = new Array<number>(n).fill(Number.NaN);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(tr[i]) || !Number.isFinite(pS[i]) || !Number.isFinite(mS[i])) continue;
    plusDI[i] = tr[i] > 0 ? (100 * pS[i]) / tr[i] : 0;
    minusDI[i] = tr[i] > 0 ? (100 * mS[i]) / tr[i] : 0;
    const sum = plusDI[i] + minusDI[i];
    dx[i] = (100 * Math.abs(plusDI[i] - minusDI[i])) / (sum === 0 ? 1 : sum);
  }
  const adx = rmaSeries(dx, adxSmoothing).map((v) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : Number.NaN));
  return { plusDI, minusDI, adx };
}

/** Latest Wilder ADX/+DI/−DI. `adx` is NaN when history is too short (never a default). */
export function dmi(highs: ArrayLike<number>, lows: ArrayLike<number>, closes: ArrayLike<number>, diLength = 14, adxSmoothing = diLength): { adx: number; plusDI: number; minusDI: number } {
  const s = dmiSeries(highs, lows, closes, diLength, adxSmoothing);
  return { adx: lastFinite(s.adx), plusDI: lastFinite(s.plusDI), minusDI: lastFinite(s.minusDI) };
}

/** ta.macd(close, fast, slow, signal). */
export function macdSeries(closes: ArrayLike<number>, fast = 12, slow = 26, signal = 9): { macd: number[]; signal: number[]; hist: number[] } {
  const f = emaSeries(closes, fast);
  const s = emaSeries(closes, slow);
  const line = f.map((v, i) => (Number.isFinite(v) && Number.isFinite(s[i]) ? v - s[i] : Number.NaN));
  const sig = emaSeries(line, signal);
  const hist = line.map((v, i) => (Number.isFinite(v) && Number.isFinite(sig[i]) ? v - sig[i] : Number.NaN));
  return { macd: line, signal: sig, hist };
}

/**
 * TradingView built-in "Stochastic" (%K length 14, %K smoothing 1, %D smoothing 3).
 * A flat window (highest high = lowest low) has no defined %K → NaN, not 50.
 */
export function stochSeries(highs: ArrayLike<number>, lows: ArrayLike<number>, closes: ArrayLike<number>, kLength = 14, kSmoothing = 1, dSmoothing = 3): { k: number[]; d: number[] } {
  const n = Math.min(highs.length, lows.length, closes.length);
  const raw = new Array<number>(n).fill(Number.NaN);
  for (let i = kLength - 1; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kLength + 1; j <= i; j++) { if (highs[j] > hh) hh = highs[j]; if (lows[j] < ll) ll = lows[j]; }
    const range = hh - ll;
    raw[i] = range > 0 && Number.isFinite(range) ? (100 * (closes[i] - ll)) / range : Number.NaN;
  }
  const k = kSmoothing > 1 ? smaSeries(raw, kSmoothing) : raw;
  const d = smaSeries(k, dSmoothing);
  const clamp = (v: number) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : Number.NaN);
  return { k: k.map(clamp), d: d.map(clamp) };
}
