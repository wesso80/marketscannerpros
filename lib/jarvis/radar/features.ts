/**
 * Per-asset feature extraction from daily bars. Pure functions; no I/O.
 * Change detection = state on bars[0..n] vs state on bars[0..n-1].
 */
import { adx, atr, bollingerBands, ema, macd, rsi } from '../../indicators';
import type { OHLCVBar } from '../../indicators';
import type { AssetClass, Bar, Features, Flag, StructState } from './types';

const toOhlcv = (bars: Bar[]): OHLCVBar[] => bars.map((b) => ({ timestamp: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
const last = <T,>(a: T[]): T => a[a.length - 1];
const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : NaN);
const fin = (n: number | null | undefined): number | null => (n === null || n === undefined || !Number.isFinite(n) ? null : n);
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const percentile = (arr: number[], v: number) => (arr.length ? (arr.filter((x) => x <= v).length / arr.length) * 100 : NaN);

function bbWidthPct(closes: number[]): number | null {
  const bb = bollingerBands(closes, 20, 2);
  return bb && bb.middle > 0 ? ((bb.upper - bb.lower) / bb.middle) * 100 : null;
}

function realisedVol(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null;
  const rets: number[] = [];
  for (let i = closes.length - n; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const m = mean(rets);
  const v = Math.sqrt(mean(rets.map((r) => (r - m) ** 2)));
  return v * Math.sqrt(252) * 100;
}

export function structState(bars: Bar[], hasVolume: boolean): StructState {
  const closes = bars.map((b) => b.close);
  const ohlcv = toOhlcv(bars);
  const c = last(closes);
  const e20 = fin(ema(closes, 20)), e50 = fin(ema(closes, 50)), e200 = closes.length >= 200 ? fin(ema(closes, 200)) : null;
  const win = (n: number, k: 'high' | 'low') => {
    if (bars.length < n + 1) return null;
    const s = bars.slice(-n - 1, -1);
    return k === 'high' ? Math.max(...s.map((b) => b.high)) : Math.min(...s.map((b) => b.low));
  };
  const hi20 = win(20, 'high'), lo20 = win(20, 'low'), hi50 = win(50, 'high'), lo50 = win(50, 'low');
  const m = macd(closes);
  const a = bars.length >= 30 ? adx(ohlcv, 14) : null;
  const widths: number[] = [];
  for (let i = Math.max(20, closes.length - 120); i <= closes.length; i++) { const w = bbWidthPct(closes.slice(0, i)); if (w !== null) widths.push(w); }
  const bbw = bbWidthPct(closes);
  const vols = bars.map((b) => b.volume);
  return {
    close: c, ema20: e20, ema50: e50, ema200: e200,
    aboveE20: e20 === null ? null : c > e20, aboveE50: e50 === null ? null : c > e50, aboveE200: e200 === null ? null : c > e200,
    e20AboveE50: e20 === null || e50 === null ? null : e20 > e50,
    hi20, lo20, hi50, lo50,
    atHi20: hi20 !== null && c > hi20, atLo20: lo20 !== null && c < lo20, atHi50: hi50 !== null && c > hi50, atLo50: lo50 !== null && c < lo50,
    rsi: fin(rsi(closes, 14)), macdHist: m ? m.histogram : null, adx: a ? a.adx : null,
    atr14: fin(atr(ohlcv, 14)), atr5: fin(atr(ohlcv, 5)), atr20: fin(atr(ohlcv, 20)),
    bbWidthPct: bbw, bbWidthPctile: bbw !== null && widths.length >= 30 ? percentile(widths.slice(0, -1), bbw) : null,
    ret5: closes.length > 5 ? pct(c, closes[closes.length - 6]) : null, ret20: closes.length > 20 ? pct(c, closes[closes.length - 21]) : null,
    vol: last(vols), avgVol20: hasVolume && vols.length > 20 ? mean(vols.slice(-21, -1)) : null, avgVol5: hasVolume && vols.length > 5 ? mean(vols.slice(-5)) : null,
  };
}

export interface FeatureInputs {
  symbol: string; name: string | null; assetClass: AssetClass; bars: Bar[];
  ohlcQuality: 'full' | 'close_only'; hasVolume: boolean; volumeInUsd?: boolean; expectedLastDate: string;
  benchBars: Bar[] | null; benchmark: string;
  sector: string | null; sectorEtf: string | null; sectorBars: Bar[] | null;
}

function retN(bars: Bar[], n: number): number | null { return bars.length > n ? pct(last(bars).close, bars[bars.length - 1 - n].close) : null; }

export function computeFeatures(inp: FeatureInputs): Features | null {
  const { bars } = inp;
  if (bars.length < 25) return null;
  const now = structState(bars, inp.hasVolume);
  const prev = structState(bars.slice(0, -1), inp.hasVolume);
  const b = last(bars), pb = bars[bars.length - 2];
  const c = b.close;
  const closes = bars.map((x) => x.close);
  // Close-only history understates true range (~half), so use 20d close-to-close σ as the volatility unit instead.
  if (inp.ohlcQuality === 'close_only') {
    const sig = (arr: number[], n: number) => { if (arr.length < n + 1) return null; const r = arr.slice(-n - 1).map((v, i, a) => (i ? (v - a[i - 1]) / a[i - 1] : NaN)).filter(Number.isFinite); const m = mean(r); return Math.sqrt(mean(r.map((x) => (x - m) ** 2))); };
    const s20 = sig(closes, 20), s5 = sig(closes, 5), s14 = sig(closes, 14);
    if (s20 !== null) { now.atr14 = (s14 ?? s20) * c; now.atr20 = s20 * c; now.atr5 = (s5 ?? s20) * c; }
    const pc = closes.slice(0, -1), p20 = sig(pc, 20), p5 = sig(pc, 5), p14 = sig(pc, 14);
    if (p20 !== null) { prev.atr14 = (p14 ?? p20) * pb.close; prev.atr20 = p20 * pb.close; prev.atr5 = (p5 ?? p20) * pb.close; }
  }
  const ret1 = pct(c, pb.close);
  const atrPct = now.atr14 !== null && c > 0 ? (now.atr14 / c) * 100 : null;
  const range = b.high - b.low;
  const rs = (bench: Bar[] | null, n: number, offset = 0): number | null => {
    if (!bench) return null;
    const a = bars.slice(0, bars.length - offset), bb = bench.slice(0, bench.length - offset);
    if (a.length <= n || bb.length <= n) return null;
    const ra = pct(last(a).close, a[a.length - 1 - n].close), rb = pct(last(bb).close, bb[bb.length - 1 - n].close);
    return Number.isFinite(ra) && Number.isFinite(rb) ? ra - rb : null;
  };
  const rsBench5 = rs(inp.benchBars, 5), rsBench20 = rs(inp.benchBars, 20), rsBench5Prev = rs(inp.benchBars, 5, 5);
  const rsSector5 = rs(inp.sectorBars, 5);
  const rsiPrev5 = bars.length > 19 ? fin(rsi(closes.slice(0, -5), 14)) : null;
  const adxPrev5 = bars.length > 35 ? (adx(toOhlcv(bars.slice(0, -5)), 14)?.adx ?? null) : null;
  const roc5 = retN(bars, 5), roc5Prev = bars.length > 10 ? pct(bars[bars.length - 6].close, bars[bars.length - 11].close) : null;
  const range20 = now.hi20 !== null && now.lo20 !== null ? now.hi20 - now.lo20 : null;
  const range20VsAtr = range20 !== null && now.atr14 ? range20 / now.atr14 : null;
  const squeeze = now.bbWidthPctile !== null && now.bbWidthPctile <= 20;
  const squeezeRelease = prev.bbWidthPctile !== null && prev.bbWidthPctile <= 20 && now.bbWidthPct !== null && prev.bbWidthPct !== null && now.bbWidthPct > prev.bbWidthPct * 1.15;
  const volRatio = now.avgVol20 && now.avgVol20 > 0 ? now.vol / now.avgVol20 : null;
  const vols60 = bars.slice(-61, -1).map((x) => x.volume).filter((v) => v > 0);
  const volPctile60 = inp.hasVolume && vols60.length >= 30 ? percentile(vols60, now.vol) : null;
  const accumRatio = now.avgVol5 && now.avgVol20 ? now.avgVol5 / now.avgVol20 : null;
  const dollarVol20 = now.avgVol20 !== null ? (inp.volumeInUsd ? now.avgVol20 : now.avgVol20 * c) : null;
  const fresh = b.date >= inp.expectedLastDate;
  const notes: string[] = [];
  if (!fresh) notes.push(`last bar ${b.date} < expected ${inp.expectedLastDate}`);
  if (inp.ohlcQuality === 'close_only') notes.push('close-only history: ATR = 20d close-to-close σ; gap/range approximate');
  if (!inp.hasVolume) notes.push('no volume history — volume confirmation unavailable');
  if (bars.length < 60) notes.push(`only ${bars.length} bars`);

  const flags: Flag[] = [];
  if (now.atHi20 && !prev.atHi20) flags.push('NEW_BREAKOUT');
  if (now.atLo20 && !prev.atLo20) flags.push('NEW_BREAKDOWN');
  if (now.atHi50 && !prev.atHi50) flags.push('NEW_HIGH');
  if (now.atLo50 && !prev.atLo50) flags.push('NEW_LOW');
  if ((now.aboveE50 && prev.aboveE50 === false) || (now.aboveE20 && prev.aboveE20 === false && now.aboveE50)) flags.push('NEW_TREND_RECLAIM');
  if ((now.aboveE50 === false && prev.aboveE50) || (now.aboveE20 === false && prev.aboveE20 && now.aboveE50 === false)) flags.push('NEW_TREND_LOSS');
  if (rsBench5 !== null && rsBench5Prev !== null && rsBench5 > 1 && rsBench5Prev <= 0) flags.push('NEW_RELATIVE_STRENGTH');
  if (rsBench5 !== null && rsBench5Prev !== null && rsBench5 < -1 && rsBench5Prev >= 0) flags.push('NEW_RELATIVE_WEAKNESS');
  if (volRatio !== null && volRatio >= 2) flags.push('NEW_VOLUME_EXPANSION');
  const atrExpansion = now.atr5 && now.atr20 ? now.atr5 / now.atr20 : null;
  const rangeVsAtr = now.atr14 ? range / now.atr14 : null;
  if ((atrExpansion !== null && atrExpansion >= 1.5) || (rangeVsAtr !== null && rangeVsAtr >= 2)) flags.push('NEW_VOLATILITY_EXPANSION');
  const rocAccel = roc5 !== null && roc5Prev !== null ? roc5 - roc5Prev : null;
  if (rocAccel !== null && now.macdHist !== null && prev.macdHist !== null && Math.abs(now.macdHist) > Math.abs(prev.macdHist) && Math.sign(now.macdHist) === Math.sign(prev.macdHist) && Math.abs(rocAccel) > (atrPct ?? 1)) flags.push('NEW_MOMENTUM_ACCELERATION');
  if (now.atHi20 && now.rsi !== null && rsiPrev5 !== null && now.rsi < rsiPrev5 - 3) flags.push('NEW_MOMENTUM_DIVERGENCE');
  if (squeezeRelease) flags.push('NEW_SQUEEZE_RELEASE');
  const gapPct = inp.ohlcQuality === 'full' ? pct(b.open, pb.close) : null;
  if (gapPct !== null && atrPct !== null && gapPct > atrPct * 0.75) flags.push('GAP_UP');
  if (gapPct !== null && atrPct !== null && gapPct < -atrPct * 0.75) flags.push('GAP_DOWN');
  if (now.rsi !== null && prev.rsi !== null && now.rsi >= 50 && prev.rsi < 50 && rsiPrev5 !== null && rsiPrev5 < 45) flags.push('RSI_REGIME_UP');
  if (now.rsi !== null && prev.rsi !== null && now.rsi < 50 && prev.rsi >= 50 && rsiPrev5 !== null && rsiPrev5 > 55) flags.push('RSI_REGIME_DOWN');
  if (now.macdHist !== null && prev.macdHist !== null && now.macdHist > 0 && prev.macdHist <= 0) flags.push('MACD_FLIP_UP');
  if (now.macdHist !== null && prev.macdHist !== null && now.macdHist < 0 && prev.macdHist >= 0) flags.push('MACD_FLIP_DOWN');

  return {
    symbol: inp.symbol, name: inp.name, assetClass: inp.assetClass, lastDate: b.date, barCount: bars.length,
    dataQuality: { ohlc: inp.ohlcQuality, volume: inp.hasVolume ? 'live' : 'unavailable', fresh, notes },
    price: c, ret1, ret3: retN(bars, 3), ret5: roc5, ret20: retN(bars, 20),
    gapPct, rangePct: c > 0 ? (range / c) * 100 : null, rangeVsAtr, closePosInRange: range > 0 ? (c - b.low) / range : null,
    atrPct, moveAtr: now.atr14 ? (c - pb.close) / now.atr14 : null, atrExpansion, rv10: realisedVol(closes, 10), rv60: realisedVol(closes, 60),
    distToHi20Pct: now.hi20 !== null ? pct(c, now.hi20) : null, distToHi50Pct: now.hi50 !== null ? pct(c, now.hi50) : null,
    extensionAtr: now.ema20 !== null && now.atr14 ? (c - now.ema20) / now.atr14 : null, ret5Atr: roc5 !== null && atrPct ? roc5 / atrPct : null,
    volRatio, volPctile60, accumRatio, dollarVol20,
    rsi: now.rsi, rsiPrev5, adx: now.adx, adxPrev5, macdHist: now.macdHist, macdHistPrev: prev.macdHist, rocAccel,
    squeeze, squeezeRelease, consolidationTight: range20VsAtr !== null && range20VsAtr < 4, range20VsAtr,
    rsBench5, rsBench20, rsBench5Prev, rsBenchDelta: rsBench5 !== null && rsBench5Prev !== null ? rsBench5 - rsBench5Prev : null, benchmark: inp.benchmark,
    sector: inp.sector, sectorEtf: inp.sectorEtf, rsSector5,
    now, prev, flags,
    direction: ret1 > 0.15 ? 'up' : ret1 < -0.15 ? 'down' : 'flat',
    catalysts: [], earningsDate: null, earningsInDays: null, crcs: null,
  };
}
