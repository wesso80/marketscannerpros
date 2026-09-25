/**
 * Fixture test for the canonical indicator library (lib/ta/core) and every adapter that wraps it.
 *
 * The OHLC series is synthetic and fully deterministic (a 32-bit LCG), so it contains no market data and no user
 * positions. The pinned values were produced by an independent Python reference that implements the TradingView
 * Pine built-ins (ta.sma, ta.ema, ta.rsi, ta.atr, ta.dmi, ta.macd, Stochastic 14/1/3) line by line. If any path drifts
 * away from Wilder / TradingView maths this test fails.
 */
import { describe, expect, it } from 'vitest';
import {
  atrSeries, dmi, dmiSeries, emaSeries, lastFinite, macdSeries, rsiSeries, smaSeries, stochSeries,
} from '@/lib/ta/core';
import * as indicatorMath from '@/lib/scanner/indicatorMath';
import { calculateADX as siADX, calculateATR as siATR, calculateDMI as siDMI, calculateEMA as siEMA, calculateRSI as siRSI } from '@/lib/scanner-indicators';
import { adx as workerAdx, atr as workerAtr, ema as workerEma, rsi as workerRsi } from '@/lib/indicators';
import { calculateADX as btADX, calculateATR as btATR } from '@/lib/backtest/indicators';

function fixture() {
  let st = 20260925 >>> 0;
  const u = () => {
    st = (Math.imul(st, 1664525) + 1013904223) >>> 0;
    return st / 2 ** 32;
  };
  const highs: number[] = [], lows: number[] = [], closes: number[] = [], opens: number[] = [];
  let prev = 100;
  for (let i = 0; i < 260; i++) {
    const drift = Math.floor(i / 60) % 2 === 0 ? 0.004 : -0.003;
    const op = prev * (1 + 0.004 * (u() - 0.5));
    const cl = op * (1 + drift + 0.03 * (u() - 0.5));
    const hi = Math.max(op, cl) * (1 + 0.012 * u());
    const lo = Math.min(op, cl) * (1 - 0.012 * u());
    opens.push(op); highs.push(hi); lows.push(lo); closes.push(cl);
    prev = cl;
  }
  return { opens, highs, lows, closes };
}

const { highs, lows, closes } = fixture();
const IDX = [27, 28, 40, 100, 259];

const EXPECTED = {
  sma20: [104.05277530201322, 104.47483139124031, 109.51024180001392, 109.16518712590926, 97.09685290546443],
  ema20: [105.07104882174042, 105.52246581819361, 108.98654024794924, 109.51426605229665, 97.47472704053712],
  rsi14: [84.72783602547355, 75.98002204912719, 72.70846319392962, 29.997576906058242, 58.72580915062307],
  atr14: [1.8736959491737277, 1.8506402916564528, 2.2372248446286216, 2.3181510320450545, 1.860652125919289],
  adx14: [38.26671854773553, 39.18576819938419, 37.03862193081095, 32.31453809412419, 19.408983928225148],
  plusDI: [29.36319697322791, 27.601151714768857, 27.472485764795877, 7.761958789505495, 20.880938093637777],
  minusDI: [4.855263780072913, 8.9243935559637, 9.902102111120916, 20.192493425426154, 13.607983568390795],
  stochK: [97.63939637392936, 87.43992891621043, 80.23379450802716, 2.0766660254170484, 78.61853404844199],
  stochD: [95.61414562259502, 95.00234828657467, 70.53199141141944, 13.898412500105444, 76.43924628864183],
};

function expectAt(series: number[], expected: number[]) {
  IDX.forEach((idx, k) => expect(series[idx]).toBeCloseTo(expected[k], 8));
}

describe('lib/ta/core — pinned TradingView-equivalent values on a deterministic fixture', () => {
  it('fixture generator is stable', () => {
    expect(closes[0]).toBeCloseTo(100.24785283638803, 10);
    expect(closes[259]).toBeCloseTo(99.08289703624203, 10);
  });

  it('SMA / EMA (SMA-seeded, like ta.ema)', () => {
    expectAt(smaSeries(closes, 20), EXPECTED.sma20);
    expectAt(emaSeries(closes, 20), EXPECTED.ema20);
    const e200 = emaSeries(closes, 200);
    expect(e200[198]).toBeNaN(); // not enough bars → NaN, not a first-value seed
    expect(e200[199]).toBeCloseTo(108.75031234755517, 8);
    expect(e200[259]).toBeCloseTo(103.7242779574782, 8);
  });

  it('RSI (Wilder) / ATR (Wilder)', () => {
    expectAt(rsiSeries(closes, 14), EXPECTED.rsi14);
    expectAt(atrSeries(highs, lows, closes, 14), EXPECTED.atr14);
  });

  it('DMI / ADX (Wilder, ta.dmi(14, 14))', () => {
    const s = dmiSeries(highs, lows, closes, 14, 14);
    expect(s.adx[26]).toBeNaN(); // warm-up stays missing (never a default such as 25)
    expectAt(s.adx, EXPECTED.adx14);
    expectAt(s.plusDI, EXPECTED.plusDI);
    expectAt(s.minusDI, EXPECTED.minusDI);
    const last = dmi(highs, lows, closes);
    expect(last.adx).toBeCloseTo(EXPECTED.adx14[4], 8);
    expect(last.minusDI).toBeCloseTo(EXPECTED.minusDI[4], 8);
  });

  it('MACD 12/26/9', () => {
    const m = macdSeries(closes);
    expect(m.macd[40]).toBeCloseTo(2.214344172425214, 8);
    expect(m.macd[100]).toBeCloseTo(-2.1442872008330767, 8);
    expect(m.macd[259]).toBeCloseTo(0.05154690594875433, 8);
    expect(m.signal[40]).toBeCloseTo(2.4118535543603246, 8);
    expect(m.signal[100]).toBeCloseTo(-2.0055582912113126, 8);
    expect(m.signal[259]).toBeCloseTo(-0.23119278245448596, 8);
  });

  it('Stochastic 14/1/3 (TradingView built-in)', () => {
    const s = stochSeries(highs, lows, closes, 14, 1, 3);
    expectAt(s.k, EXPECTED.stochK);
    expectAt(s.d, EXPECTED.stochD);
  });
});

describe('every indicator path agrees with lib/ta/core', () => {
  const n = closes.length;
  const bars = closes.map((c, i) => ({ timestamp: i, open: c, high: highs[i], low: lows[i], close: c, volume: 1 }));
  const ohlcv = closes.map((c, i) => ({ timestamp: String(i), open: c, high: highs[i], low: lows[i], close: c, volume: 1 }));

  it('scanner indicatorMath (ranked scanner + Golden Egg)', () => {
    const a = indicatorMath.adx(highs, lows, closes, 14);
    expect(a.adx).toBeCloseTo(EXPECTED.adx14[4], 8);
    expect(a.plus_di).toBeCloseTo(EXPECTED.plusDI[4], 8);
    expect(a.minus_di).toBeCloseTo(EXPECTED.minusDI[4], 8);
    const atrArr = indicatorMath.atr(highs, lows, closes, 14);
    expect(atrArr[atrArr.length - 1]).toBeCloseTo(EXPECTED.atr14[4], 8);
    expect(indicatorMath.ema(closes, 20)[n - 1]).toBeCloseTo(EXPECTED.ema20[4], 8);
    expect(indicatorMath.rsi(closes, 14)[n - 1]).toBeCloseTo(EXPECTED.rsi14[4], 8);
    const st = indicatorMath.stochastic(highs, lows, closes, 14, 3);
    expect(st.k).toBeCloseTo(EXPECTED.stochK[4], 8);
    expect(st.d).toBeCloseTo(EXPECTED.stochD[4], 8);
  });

  it('lib/scanner-indicators (bulk scanner, scan-daily/scan-universe jobs)', () => {
    expect(siADX(ohlcv as any, 14)).toBeCloseTo(EXPECTED.adx14[4], 8);
    const d = siDMI(ohlcv as any, 14);
    expect(d.minusDI).toBeCloseTo(EXPECTED.minusDI[4], 8);
    expect(siATR(highs, lows, closes, 14)).toBeCloseTo(EXPECTED.atr14[4], 8);
    expect(siEMA(closes, 20)[n - 1]).toBeCloseTo(EXPECTED.ema20[4], 8);
    const rsiOut: any = siRSI(closes, 14);
    const rsiLast = Array.isArray(rsiOut) ? lastFinite(rsiOut) : rsiOut;
    expect(rsiLast).toBeCloseTo(EXPECTED.rsi14[4], 8);
  });

  it('lib/indicators (worker)', () => {
    const w = workerAdx(bars as any, 14)!;
    expect(w.adx).toBeCloseTo(EXPECTED.adx14[4], 8);
    expect(w.plusDI).toBeCloseTo(EXPECTED.plusDI[4], 8);
    expect(workerAtr(bars as any, 14)!).toBeCloseTo(EXPECTED.atr14[4], 8);
    expect(workerEma(closes, 20)!).toBeCloseTo(EXPECTED.ema20[4], 8);
    expect(workerRsi(closes, 14)!).toBeCloseTo(EXPECTED.rsi14[4], 8);
  });

  it('lib/backtest/indicators (backtest engine)', () => {
    const b = btADX(highs, lows, closes, 14);
    expect(b.adx[100]).toBeCloseTo(EXPECTED.adx14[3], 8);
    expect(b.diMinus[259]).toBeCloseTo(EXPECTED.minusDI[4], 8);
    expect(b.adx[26]).toBeUndefined();
    expect(btATR(highs, lows, closes, 14)[40]).toBeCloseTo(EXPECTED.atr14[2], 8);
  });

  it('short history returns missing values, never a default (25 / 50 / 0)', () => {
    const h = highs.slice(0, 10), l = lows.slice(0, 10), c = closes.slice(0, 10);
    expect(dmi(h, l, c).adx).toBeNaN();
    expect(indicatorMath.adx(h, l, c).adx).toBeNaN();
    expect(siADX(ohlcv.slice(0, 10) as any, 14)).toBeNaN();
    expect(siATR(h, l, c, 14)).toBeNaN();
    expect(workerAdx(bars.slice(0, 10) as any, 14)).toBeNull();
    expect(Number.isNaN(indicatorMath.stochastic(h, l, c).k)).toBe(true);
  });

});
