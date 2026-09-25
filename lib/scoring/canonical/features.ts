/**
 * Canonical features from completed bars (oldest first), using the shared lib/ta/core maths (Wilder ATR/ADX/RSI,
 * TradingView EMA/SMA). Everything the scorer uses is either direction-free or signed so a mirrored chart produces
 * mirrored features (see test/canonicalEngine.test.ts).
 */
import { atrSeries, dmiSeries, emaSeries, rsiSeries, smaSeries } from '@/lib/ta/core';
import type { CanonicalBar, CanonicalFeatures, SwingPoint } from './types';

export const FEATURE_POLICY = {
  percentileLookback: 252,
  percentileMinSamples: 60,
  pivotLeft: 3,
  pivotRight: 3,
  pivotLookback: 250,
  /** Opposing levels (targets) use stronger pivots (5 bars each side) than structure (3); minor 3-bar pivots put a
   *  "resistance" a fraction of an ATR above almost every close, which made structural R:R meaningless (median 0.2). */
  levelPivotStrength: 5,
  /** A level within this many ATR of the close is being tested, not ahead — the next one is the target. */
  levelSkipAtr: 0.25,
  swingRecency: 60,
  /** Stop / target levels: confirmed 3-bar pivots within this many bars. */
  levelLookback: 120,
  /** Bollinger-width percentile window for squeeze detection (≈ 6 months, as external checks measure it). */
  squeezeLookback: 120,
  /** SMA200 slope measured over this many bars. */
  sma200SlopeBars: 20,
  climaxVolume: 2.5,
  climaxRangeAtr: 1.5,
} as const;

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const at = (s: ArrayLike<number>, i: number) => (i >= 0 && i < s.length && fin(s[i]) ? s[i] : Number.NaN);

/** Rank of series[idx] among the finite values in the trailing window (0–100, ties count half). */
export function percentileRankAt(series: ArrayLike<number>, idx: number, lookback: number = FEATURE_POLICY.percentileLookback, minSamples: number = FEATURE_POLICY.percentileMinSamples): number {
  const v = at(series, idx);
  if (!fin(v)) return Number.NaN;
  let below = 0, equal = 0, n = 0;
  for (let i = Math.max(0, idx - lookback + 1); i <= idx; i++) {
    const x = series[i];
    if (!fin(x)) continue;
    n++;
    if (x < v) below++;
    else if (x === v) equal++;
  }
  if (n < minSamples) return Number.NaN;
  return (100 * (below + 0.5 * equal)) / n;
}

/** Population standard deviation over `length` bars (TradingView ta.stdev). */
export function stdevSeries(values: ArrayLike<number>, length: number): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN);
  for (let i = length - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - length + 1; j <= i; j++) sum += values[j];
    const mean = sum / length;
    let sq = 0;
    for (let j = i - length + 1; j <= i; j++) sq += (values[j] - mean) ** 2;
    out[i] = Math.sqrt(sq / length);
  }
  return out;
}

/** Confirmed pivots: a high strictly above the `left` bars before it and ≥ the `right` bars after it (lows mirrored). */
export function findPivots(bars: CanonicalBar[], left: number = FEATURE_POLICY.pivotLeft, right: number = FEATURE_POLICY.pivotRight): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];
  for (let i = left; i < bars.length - right; i++) {
    const h = bars[i].high, l = bars[i].low;
    let isHigh = true, isLow = true;
    for (let j = i - left; j < i && (isHigh || isLow); j++) {
      if (!(h > bars[j].high)) isHigh = false;
      if (!(l < bars[j].low)) isLow = false;
    }
    for (let j = i + 1; j <= i + right && (isHigh || isLow); j++) {
      if (!(h >= bars[j].high)) isHigh = false;
      if (!(l <= bars[j].low)) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: h, t: bars[i].t });
    if (isLow) lows.push({ index: i, price: l, t: bars[i].t });
  }
  return { highs, lows };
}

export function computeFeatures(bars: CanonicalBar[]): CanonicalFeatures {
  const n = bars.length;
  const last = n - 1;
  const H = bars.map((b) => b.high), L = bars.map((b) => b.low), C = bars.map((b) => b.close);
  const V = bars.map((b) => (fin(b.volume) ? b.volume : Number.NaN));
  const hasVolume = n > 21 && V.slice(-21).every((v) => fin(v)) && V.slice(-21).some((v) => v > 0);

  const ema20 = emaSeries(C, 20), ema50 = emaSeries(C, 50), ema200 = emaSeries(C, 200);
  const sma20 = smaSeries(C, 20), sma50 = smaSeries(C, 50), sma200 = smaSeries(C, 200);
  const atr = atrSeries(H, L, C, 14);
  const atr20 = atrSeries(H, L, C, 20);
  const dmi = dmiSeries(H, L, C, 14, 14);
  const rsi = rsiSeries(C, 14);
  const sd20 = stdevSeries(C, 20);

  const atrPctSeries = C.map((c, i) => (fin(atr[i]) && c > 0 ? (atr[i] / c) * 100 : Number.NaN));
  const bbwSeries = C.map((_, i) => (fin(sd20[i]) && fin(sma20[i]) && sma20[i] > 0 ? ((4 * sd20[i]) / sma20[i]) * 100 : Number.NaN));
  // Bollinger(20,2) width / Keltner(20, 1.5×ATR20) width — scale-free, and exactly mirror-invariant.
  const sqzSeries = C.map((_, i) => (fin(sd20[i]) && fin(atr20[i]) && atr20[i] > 0 ? (4 * sd20[i]) / (3 * atr20[i]) : Number.NaN));

  const atrNow = at(atr, last);
  const close = C[last];
  const avgVolPrior20 = hasVolume ? V.slice(-21, -1).reduce((a, b) => a + b, 0) / 20 : Number.NaN;
  const volumeRatio = hasVolume && avgVolPrior20 > 0 ? V[last] / avgVolPrior20 : null;
  const volumeTrend5 = hasVolume && avgVolPrior20 > 0 ? V.slice(-5).reduce((a, b) => a + b, 0) / 5 / avgVolPrior20 : null;
  let climax: number | null = hasVolume && avgVolPrior20 > 0 ? 0 : null;
  if (climax !== null) {
    for (let i = Math.max(1, last - 2); i <= last; i++) {
      const range = H[i] - L[i];
      if (V[i] >= FEATURE_POLICY.climaxVolume * avgVolPrior20 && fin(atr[i]) && range >= FEATURE_POLICY.climaxRangeAtr * atr[i]) {
        climax = C[i] >= bars[i].open ? 1 : -1;
      }
    }
  }

  const { highs, lows } = findPivots(bars);
  const minIdx = last - FEATURE_POLICY.pivotLookback;
  const recentHighs = highs.filter((p) => p.index >= minIdx);
  const recentLows = lows.filter((p) => p.index >= minIdx);
  let structure: CanonicalFeatures['structure'] = 'unknown';
  if (recentHighs.length >= 2 && recentLows.length >= 2) {
    const [h1, h2] = recentHighs.slice(-2), [l1, l2] = recentLows.slice(-2);
    if (h2.price > h1.price && l2.price > l1.price) structure = 'up';
    else if (h2.price < h1.price && l2.price < l1.price) structure = 'down';
    else structure = 'mixed';
  }
  const major = findPivots(bars, FEATURE_POLICY.levelPivotStrength, FEATURE_POLICY.levelPivotStrength);
  const skip = fin(atrNow) ? FEATURE_POLICY.levelSkipAtr * atrNow : 0;
  const above = major.highs.filter((p) => p.index >= minIdx && p.price > close + skip).map((p) => p.price);
  const below = major.lows.filter((p) => p.index >= minIdx && p.price < close - skip).map((p) => p.price);
  // Stop / target candidates from CONFIRMED 3-bar pivots in the last levelLookback bars.
  //  stop*: pivots on the far side of the close that no later bar has traded through (still-valid structure),
  //         nearest first. target*: any prior swing on the opposing side (a prior high is resistance even if old).
  const lvMin = last - FEATURE_POLICY.levelLookback;
  const laterMinLow = new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY);
  const laterMaxHigh = new Array<number>(n + 1).fill(Number.NEGATIVE_INFINITY);
  for (let i = n - 1; i >= 0; i--) { laterMinLow[i] = Math.min(L[i], laterMinLow[i + 1]); laterMaxHigh[i] = Math.max(H[i], laterMaxHigh[i + 1]); }
  const lvLows = lows.filter((p) => p.index >= lvMin), lvHighs = highs.filter((p) => p.index >= lvMin);
  const stopLowsBelow = lvLows.filter((p) => p.price < close && laterMinLow[p.index + 1] >= p.price).map((p) => p.price).sort((a, b) => b - a);
  const stopHighsAbove = lvHighs.filter((p) => p.price > close && laterMaxHigh[p.index + 1] <= p.price).map((p) => p.price).sort((a, b) => a - b);
  const targetHighsAbove = [...new Set(lvHighs.filter((p) => p.price > close).map((p) => p.price))].sort((a, b) => a - b);
  const targetLowsBelow = [...new Set(lvLows.filter((p) => p.price < close).map((p) => p.price))].sort((a, b) => b - a);
  const sb = FEATURE_POLICY.sma200SlopeBars;
  const sma200Slope = fin(atrNow) && atrNow > 0 ? (at(sma200, last) - at(sma200, last - sb)) / atrNow : Number.NaN;

  // Exhaustion extreme for fades: the 5-bar high/low, only when a PRIOR bar printed it (the signal bar did not trade
  // through it). The signal bar's own extreme is never used as a stop.
  const priorExt = (arr: number[], hi: boolean) => {
    if (n < 2) return Number.NaN;
    const prior = arr.slice(Math.max(0, n - 5), last);
    const ext = hi ? Math.max(...prior) : Math.min(...prior);
    return hi ? (arr[last] < ext ? ext : Number.NaN) : (arr[last] > ext ? ext : Number.NaN);
  };
  const bbMid = at(sma20, last), sd = at(sd20, last);
  const bbUpper = bbMid + 2 * sd, bbLower = bbMid - 2 * sd;
  const win = (arr: number[], k: number) => arr.slice(Math.max(0, n - k));

  return {
    mode: 'bars',
    barDate: n ? bars[last].t : null,
    bars: n,
    close,
    open: n ? bars[last].open : Number.NaN,
    ema20: at(ema20, last), ema50: at(ema50, last), ema200: n >= 200 ? at(ema200, last) : Number.NaN,
    sma50: at(sma50, last), sma200: at(sma200, last), sma200Slope,
    adx: at(dmi.adx, last), plusDI: at(dmi.plusDI, last), minusDI: at(dmi.minusDI, last),
    adxSlope: at(dmi.adx, last) - at(dmi.adx, last - 3),
    atr: atrNow,
    atrPct: at(atrPctSeries, last),
    atrPctPercentile: percentileRankAt(atrPctSeries, last),
    bbwPct: at(bbwSeries, last),
    bbwPercentile: percentileRankAt(bbwSeries, last),
    bbwPercentile120: percentileRankAt(bbwSeries, last, FEATURE_POLICY.squeezeLookback),
    bbUpper: fin(bbUpper) ? bbUpper : Number.NaN,
    bbLower: fin(bbLower) ? bbLower : Number.NaN,
    squeezeRatio: at(sqzSeries, last),
    squeezeRatioPercentile: percentileRankAt(sqzSeries, last),
    rsi: at(rsi, last),
    rsiMax5: Math.max(...win(rsi, 5).filter(fin)),
    rsiMin5: Math.min(...win(rsi, 5).filter(fin)),
    rsiSlope: at(rsi, last) - at(rsi, last - 3),
    volumeRatio: volumeRatio !== null && fin(volumeRatio) ? volumeRatio : null,
    volumeTrend5: volumeTrend5 !== null && fin(volumeTrend5) ? volumeTrend5 : null,
    climax,
    distEma20Atr: fin(atrNow) && atrNow > 0 ? (close - at(ema20, last)) / atrNow : Number.NaN,
    distEma50Atr: fin(atrNow) && atrNow > 0 ? (close - at(ema50, last)) / atrNow : Number.NaN,
    beyondBand: fin(bbUpper) && close > bbUpper ? 1 : fin(bbLower) && close < bbLower ? -1 : 0,
    structure,
    lastPivotHigh: recentHighs.at(-1) ?? null,
    lastPivotLow: recentLows.at(-1) ?? null,
    resistanceAbove: above.length ? Math.min(...above) : null,
    supportBelow: below.length ? Math.max(...below) : null,
    high5: Math.max(...win(H, 5)), low5: Math.min(...win(L, 5)),
    high10: Math.max(...win(H, 10)), low10: Math.min(...win(L, 10)),
    exhaustionHigh: priorExt(H, true), exhaustionLow: priorExt(L, false),
    stopLowsBelow, stopHighsAbove, targetHighsAbove, targetLowsBelow,
  };
}

/** Indicator snapshot (bulk scans, cached rows) — no bar history, so structure/percentiles are unavailable. */
export interface CanonicalSnapshot {
  price: number;
  barDate?: string | null;
  ema20?: number; ema50?: number; ema200?: number;
  adx?: number; plusDI?: number; minusDI?: number;
  atr?: number;
  rsi?: number;
  bbUpper?: number; bbLower?: number;
  volumeRatio?: number | null;
}

export function featuresFromSnapshot(s: CanonicalSnapshot): CanonicalFeatures {
  const n = (v: unknown) => (fin(v) ? v : Number.NaN);
  const close = n(s.price), atr = n(s.atr);
  const bbU = n(s.bbUpper), bbL = n(s.bbLower);
  const bbMid = (bbU + bbL) / 2;
  return {
    mode: 'snapshot', barDate: s.barDate ?? null, bars: 0, close, open: Number.NaN,
    ema20: n(s.ema20), ema50: n(s.ema50), ema200: n(s.ema200), sma50: Number.NaN, sma200: Number.NaN, sma200Slope: Number.NaN,
    adx: n(s.adx), plusDI: n(s.plusDI), minusDI: n(s.minusDI), adxSlope: Number.NaN,
    atr, atrPct: fin(atr) && close > 0 ? (atr / close) * 100 : Number.NaN, atrPctPercentile: Number.NaN,
    bbwPct: fin(bbMid) && bbMid > 0 ? ((bbU - bbL) / bbMid) * 100 : Number.NaN, bbwPercentile: Number.NaN, bbwPercentile120: Number.NaN,
    bbUpper: bbU, bbLower: bbL, squeezeRatio: Number.NaN, squeezeRatioPercentile: Number.NaN,
    rsi: n(s.rsi), rsiMax5: Number.NaN, rsiMin5: Number.NaN, rsiSlope: Number.NaN,
    volumeRatio: fin(s.volumeRatio) ? s.volumeRatio : null, volumeTrend5: null, climax: null,
    distEma20Atr: fin(atr) && atr > 0 ? (close - n(s.ema20)) / atr : Number.NaN,
    distEma50Atr: fin(atr) && atr > 0 ? (close - n(s.ema50)) / atr : Number.NaN,
    beyondBand: fin(bbU) && close > bbU ? 1 : fin(bbL) && close < bbL ? -1 : 0,
    structure: 'unknown', lastPivotHigh: null, lastPivotLow: null, resistanceAbove: null, supportBelow: null,
    high5: Number.NaN, low5: Number.NaN, high10: Number.NaN, low10: Number.NaN, exhaustionHigh: Number.NaN, exhaustionLow: Number.NaN,
    stopLowsBelow: [], stopHighsAbove: [], targetHighsAbove: [], targetLowsBelow: [],
  };
}
