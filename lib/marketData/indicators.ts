/**
 * marketData/indicators.ts — compute indicators from bars.
 *
 * Pure functions. No I/O. Used by the read-through cache when indicators
 * are missing/stale in indicators_latest.
 *
 * Mirrors the math in lib/admin/priceSeries.ts but typed against marketData/types.ts.
 */

import type { OhlcBar, IndicatorSnapshot, BarTimeframe } from './types';

function safeNum(x: number | undefined | null): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let s = 0;
  for (let i = values.length - period; i < values.length; i++) s += values[i];
  return s / period;
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  let avgG = g / period, avgL = l / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const gg = d >= 0 ? d : 0, ll = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + gg) / period;
    avgL = (avgL * (period - 1) + ll) / period;
  }
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

function macd(values: number[]): { line: number | null; signal: number | null; hist: number | null } {
  if (values.length < 35) return { line: null, signal: null, hist: null };
  // build the EMA12, EMA26 series
  const buildEma = (period: number): number[] => {
    if (values.length < period) return [];
    const k = 2 / (period + 1);
    const out: number[] = [];
    let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    out.push(e);
    for (let i = period; i < values.length; i++) {
      e = values[i] * k + e * (1 - k);
      out.push(e);
    }
    return out;
  };
  const e12 = buildEma(12);
  const e26 = buildEma(26);
  // align tails
  const tail = Math.min(e12.length, e26.length);
  const macdLine: number[] = [];
  for (let i = 0; i < tail; i++) macdLine.push(e12[e12.length - tail + i] - e26[e26.length - tail + i]);
  if (macdLine.length < 9) return { line: macdLine[macdLine.length - 1] ?? null, signal: null, hist: null };
  // signal = EMA9 of macdLine
  const k = 2 / (9 + 1);
  let s = macdLine.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  for (let i = 9; i < macdLine.length; i++) s = macdLine[i] * k + s * (1 - k);
  const line = macdLine[macdLine.length - 1];
  return { line, signal: s, hist: line - s };
}

function atr(bars: OhlcBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // Wilder smoothing
  let a = trs.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period;
  return a;
}

function adx(bars: OhlcBar[], period = 14): { adx: number | null; plusDI: number | null; minusDI: number | null } {
  if (bars.length < period * 2 + 1) return { adx: null, plusDI: null, minusDI: null };
  const plusDM: number[] = [], minusDM: number[] = [], tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const dn = bars[i - 1].low - bars[i].low;
    plusDM.push(up > dn && up > 0 ? up : 0);
    minusDM.push(dn > up && dn > 0 ? dn : 0);
    const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const smooth = (arr: number[]): number[] => {
    const out: number[] = [];
    let s = arr.slice(0, period).reduce((x, y) => x + y, 0);
    out.push(s);
    for (let i = period; i < arr.length; i++) {
      s = s - s / period + arr[i];
      out.push(s);
    }
    return out;
  };
  const sTr = smooth(tr), sP = smooth(plusDM), sM = smooth(minusDM);
  const dx: number[] = [];
  for (let i = 0; i < sTr.length; i++) {
    const pdi = (sP[i] / sTr[i]) * 100;
    const mdi = (sM[i] / sTr[i]) * 100;
    dx.push((Math.abs(pdi - mdi) / (pdi + mdi || 1)) * 100);
  }
  if (dx.length < period) return { adx: null, plusDI: null, minusDI: null };
  let a = dx.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < dx.length; i++) a = (a * (period - 1) + dx[i]) / period;
  return {
    adx: a,
    plusDI: (sP[sP.length - 1] / sTr[sTr.length - 1]) * 100,
    minusDI: (sM[sM.length - 1] / sTr[sTr.length - 1]) * 100,
  };
}

function bbands(values: number[], period = 20, mult = 2): { upper: number | null; middle: number | null; lower: number | null } {
  if (values.length < period) return { upper: null, middle: null, lower: null };
  const slice = values.slice(-period);
  const m = slice.reduce((a, b) => a + b, 0) / period;
  const v = slice.reduce((a, b) => a + (b - m) ** 2, 0) / period;
  const sd = Math.sqrt(v);
  return { upper: m + mult * sd, middle: m, lower: m - mult * sd };
}

function stochastic(bars: OhlcBar[], period = 14, dPeriod = 3): { k: number | null; d: number | null } {
  if (bars.length < period + dPeriod) return { k: null, d: null };
  const ks: number[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - period + 1, i + 1);
    const hi = Math.max(...slice.map((b) => b.high));
    const lo = Math.min(...slice.map((b) => b.low));
    const c = bars[i].close;
    ks.push(hi === lo ? 50 : ((c - lo) / (hi - lo)) * 100);
  }
  const k = ks[ks.length - 1];
  const dSlice = ks.slice(-dPeriod);
  const d = dSlice.reduce((a, b) => a + b, 0) / dPeriod;
  return { k, d };
}

function obvCalc(bars: OhlcBar[]): number | null {
  if (bars.length < 2) return null;
  let o = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) o += bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) o -= bars[i].volume;
  }
  return o;
}

function vwapCalc(bars: OhlcBar[]): number | null {
  if (bars.length === 0) return null;
  // session VWAP = sum(typical*vol) / sum(vol) — for daily bars this is a rolling indicator
  // For consistency, compute over the last 20 bars
  const slice = bars.slice(-20);
  let pv = 0, vv = 0;
  for (const b of slice) {
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * b.volume;
    vv += b.volume;
  }
  return vv > 0 ? pv / vv : null;
}

export function computeIndicators(symbol: string, timeframe: BarTimeframe, bars: OhlcBar[]): IndicatorSnapshot {
  const closes = bars.map((b) => b.close);
  const m = macd(closes);
  const aBundle = adx(bars);
  const bb = bbands(closes, 20, 2);
  const st = stochastic(bars);
  // Squeeze: Bollinger inside Keltner (use ATR proxy)
  const a = atr(bars);
  const middle = safeNum(bb.middle);
  let inSqueeze: boolean | null = null;
  if (middle !== null && a !== null && bb.upper !== null && bb.lower !== null) {
    const keltUpper = middle + 1.5 * a;
    const keltLower = middle - 1.5 * a;
    inSqueeze = (bb.upper < keltUpper) && (bb.lower > keltLower);
  }
  return {
    symbol: symbol.toUpperCase(),
    timeframe,
    rsi14: rsi(closes, 14),
    macd: m,
    ema: {
      e9: ema(closes, 9),
      e20: ema(closes, 20),
      e50: ema(closes, 50),
      e200: ema(closes, 200),
    },
    sma: {
      s20: sma(closes, 20),
      s50: sma(closes, 50),
      s200: sma(closes, 200),
    },
    atr14: a,
    adx14: aBundle.adx,
    plusDI: aBundle.plusDI,
    minusDI: aBundle.minusDI,
    stoch: st,
    bb,
    obv: obvCalc(bars),
    vwap: vwapCalc(bars),
    inSqueeze,
    computedAt: new Date().toISOString(),
  };
}
