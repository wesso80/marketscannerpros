/**
 * Scanner Indicator Library
 *
 * Shared technical-indicator calculations used by scanner/bulk, scan-universe and the crypto daily scan.
 * SMA/EMA/RSI/MACD/ADX/ATR/Stochastic delegate to the canonical lib/ta/core (TradingView-equivalent, Wilder
 * ADX/ATR); Aroon and CCI stay here.
 *
 * Created to eliminate ~200 LOC of identical indicator code duplicated
 * across scanner routes.
 */

import { atrSeries, dmi, emaSeries, lastFinite, macdSeries, rsiSeries, smaSeries, stochSeries } from '@/lib/ta/core';

// ─── OHLCV Type ─────────────────────────────────────────────────────────────

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── SMA / EMA (series) — canonical lib/ta/core (TradingView ta.sma / ta.ema, SMA-seeded) ───────────────

export function calculateSMA(data: number[], period: number): number[] {
  return smaSeries(data, period);
}

export function calculateEMA(data: number[], period: number): number[] {
  return emaSeries(data, period);
}

// ─── RSI (Wilder, scalar return) ────────────────────────────────────────────

export function calculateRSI(closes: number[], period: number = 14): number {
  return lastFinite(rsiSeries(closes, period));
}

// ─── MACD (scalar return) ───────────────────────────────────────────────────

export function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  const s = macdSeries(closes, 12, 26, 9);
  const macd = lastFinite(s.macd);
  const signal = lastFinite(s.signal);
  if (!Number.isFinite(macd) || !Number.isFinite(signal)) return { macd: NaN, signal: NaN, histogram: NaN };
  return { macd, signal, histogram: macd - signal };
}

// ─── ADX (Wilder) ───────────────────────────────────────────────────────────
// Was EMA(2/(n+1))-smoothed, which read 10–30 points higher than Wilder/TradingView (META 69 vs 37, ADBE 40 vs 23 on
// 24 Sep 2026) and flipped the trend/range regime on bulk scans and daily picks.

export function calculateADX(ohlcv: OHLCV[], period: number = 14): number {
  if (ohlcv.length < period * 2) return NaN;
  return dmi(ohlcv.map(d => d.high), ohlcv.map(d => d.low), ohlcv.map(d => d.close), period, period).adx;
}

/** Wilder ADX with +DI / −DI. */
export function calculateDMI(ohlcv: OHLCV[], period: number = 14): { adx: number; plusDI: number; minusDI: number } {
  return dmi(ohlcv.map(d => d.high), ohlcv.map(d => d.low), ohlcv.map(d => d.close), period, period);
}

// ─── Stochastic (TradingView built-in 14 / smoothK / 3) ─────────────────────
// `smoothK` defaults to 1 (TradingView default). The old version SMA-smoothed %K and turned a genuine 0 into NaN.

export function calculateStochastic(ohlcv: OHLCV[], period: number = 14, smoothK: number = 1): { k: number; d: number } {
  if (ohlcv.length < period + smoothK) return { k: NaN, d: NaN };
  const s = stochSeries(ohlcv.map(d => d.high), ohlcv.map(d => d.low), ohlcv.map(d => d.close), period, smoothK, 3);
  return { k: lastFinite(s.k), d: lastFinite(s.d) };
}

// ─── Aroon ──────────────────────────────────────────────────────────────────

export function calculateAroon(ohlcv: OHLCV[], period: number = 25): { up: number; down: number } {
  if (ohlcv.length < period) return { up: NaN, down: NaN };

  const slice = ohlcv.slice(-period);
  let highestIdx = 0, lowestIdx = 0;
  let highestVal = slice[0].high, lowestVal = slice[0].low;

  for (let i = 1; i < slice.length; i++) {
    if (slice[i].high >= highestVal) { highestVal = slice[i].high; highestIdx = i; }
    if (slice[i].low <= lowestVal) { lowestVal = slice[i].low; lowestIdx = i; }
  }

  return {
    up: ((period - (period - 1 - highestIdx)) / period) * 100,
    down: ((period - (period - 1 - lowestIdx)) / period) * 100,
  };
}

// ─── CCI ────────────────────────────────────────────────────────────────────

export function calculateCCI(ohlcv: OHLCV[], period: number = 20): number {
  if (ohlcv.length < period) return NaN;

  const typicalPrices = ohlcv.map(d => (d.high + d.low + d.close) / 3);
  const sma = calculateSMA(typicalPrices, period);
  const lastSMA = sma[sma.length - 1];
  if (isNaN(lastSMA)) return NaN;

  const slice = typicalPrices.slice(-period);
  const meanDev = slice.reduce((sum, tp) => sum + Math.abs(tp - lastSMA), 0) / period;
  if (meanDev === 0) return 0;

  return (typicalPrices[typicalPrices.length - 1] - lastSMA) / (0.015 * meanDev);
}

// ─── ATR (Wilder) ───────────────────────────────────────────────────────────
// Was a simple average of the last `period` true ranges and returned 0 when history was short (a fake "no volatility").

export function calculateATR(highs: number[], lows: number[], closes: number[], period: number): number {
  if (highs.length < period + 1) return NaN;
  return lastFinite(atrSeries(highs, lows, closes, period));
}
