/**
 * Scanner indicator math — thin adapters over the canonical library in `lib/ta/core.ts`.
 *
 * The Ranked scanner (app/api/scanner/run) and Golden Egg call these functions on the same canonical bars, so the two
 * surfaces cannot disagree on a market statistic. All maths now lives in lib/ta/core (TradingView-equivalent):
 *   • ema   — SMA-seeded (ta.ema). Warm-up values are NaN, not a first-value seed.
 *   • rsi   — Wilder (ta.rsi).
 *   • atr   — Wilder rma of true range (ta.atr). Previously a 14-bar simple average.
 *   • adx   — Wilder ADX/+DI/−DI (ta.dmi).
 *   • stoch — TradingView built-in Stochastic 14/1/3 (%K unsmoothed, %D = SMA3). Previously EMA-smoothed.
 * Return shapes are unchanged so existing callers keep working.
 */
import { atrSeries, dmi, emaSeries, macdSeries, rsiSeries, stochSeries } from '@/lib/ta/core';

export function ema(values: number[], period: number): number[] {
  return emaSeries(values, period);
}

export function rsi(values: number[], period = 14): number[] {
  return rsiSeries(values, period);
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const s = macdSeries(values, fast, slow, signal);
  return { macdLine: s.macd, signalLine: s.signal, hist: s.hist };
}

/**
 * Wilder ATR. Kept aligned with the historical contract: the returned array starts at bar 1 (length = bars − 1),
 * so `arr[arr.length - 1]` is the latest ATR.
 */
export function atr(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  return atrSeries(highs, lows, closes, period).slice(1);
}

/**
 * Wilder ADX(period) with +DI/−DI — the standard definition (Wilder 1978; TradingView `ta.dmi`, TA-Lib `ADX`).
 * Returns NaN ADX when history is too short (≈ 2·period bars).
 *
 * History: an earlier version used a 14-bar rolling SUM for DI and a 14-bar SMA of DX, which overstated ADX by 10–24
 * points on daily equities (ADBE 33 vs 22.8, COST 42 vs 18 on 24 Sep 2026).
 */
export function adx(highs: number[], lows: number[], closes: number[], period = 14) {
  const r = dmi(highs, lows, closes, period, period);
  return { adx: r.adx, plus_di: r.plusDI, minus_di: r.minusDI };
}

/** Latest TradingView-default Stochastic (%K 14, smoothing 1, %D 3). `smooth` is the %D length. */
export function stochastic(highs: number[], lows: number[], closes: number[], period = 14, smooth = 3) {
  const s = stochSeries(highs, lows, closes, period, 1, smooth);
  const k = s.k[s.k.length - 1];
  const d = s.d[s.d.length - 1];
  return { k: Number.isFinite(k) ? k : Number.NaN, d: Number.isFinite(d) ? d : Number.NaN };
}
