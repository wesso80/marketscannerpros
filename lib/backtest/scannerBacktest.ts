/**
 * Scanner Backtest Engine
 *
 * Walks bar-by-bar through historical price data, re-computes the same
 * technical indicators and scoring logic used by the live Market Scanner
 * (/api/scanner/run), and generates trades whenever the score crosses
 * the user-specified threshold.
 *
 * Trade management:
 *   • Entry: when score ≥ threshold in a direction (bullish/bearish)
 *   • Stop:  1.5 × ATR from entry (same as live scanner trade setup)
 *   • Target: 3 × ATR from entry (same as live scanner trade setup)
 *   • Exit:  hit stop, hit target, signal flips to opposite direction,
 *            or max holding period expires
 *
 * Uses the same buildBacktestEngineResult() as the strategy backtester
 * so the output shape is identical and the UI can be shared.
 */

import type { BacktestTrade } from './engine';
import { buildBacktestEngineResult, type BacktestEngineResult } from './engine';
import type { PriceBar } from './providers';

// ─── Indicator helpers (same as /api/scanner/run) ─────────────────────────

function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period || period <= 0) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

function rsi(values: number[], period = 14): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const ch = values[i] - values[i - 1];
    if (ch >= 0) gains += ch; else losses -= ch;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = Math.min(100, Math.max(0, 100 - 100 / (1 + avgGain / (avgLoss || 1e-9))));
  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    avgGain = ((avgGain * (period - 1)) + Math.max(0, ch)) / period;
    avgLoss = ((avgLoss * (period - 1)) + Math.max(0, -ch)) / period;
    out[i] = Math.min(100, Math.max(0, 100 - 100 / (1 + avgGain / (avgLoss || 1e-9))));
  }
  return out;
}

function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = emaFast.map((v, i) => v - (emaSlow[i] ?? v));
  const signalLine = ema(macdLine.map(v => Number.isFinite(v) ? v : 0), signal);
  const hist = macdLine.map((v, i) => v - (signalLine[i] ?? v));
  return { macdLine, signalLine, hist };
}

function atr(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  const out: number[] = new Array(trs.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < trs.length; i++) {
    sum += trs[i];
    if (i >= period) sum -= trs[i - period];
    out[i] = (i + 1 >= period) ? sum / period : NaN;
  }
  return out;
}

function adx(highs: number[], lows: number[], closes: number[], period = 14) {
  const plusDM: number[] = [], minusDM: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  let trSum = 0, pdmSum = 0, mdmSum = 0;
  const dx: number[] = [];
  for (let i = 0; i < trs.length; i++) {
    trSum += trs[i]; pdmSum += plusDM[i]; mdmSum += minusDM[i];
    if (i >= period - 1) {
      const diP = trSum > 0 ? (pdmSum / trSum) * 100 : 0;
      const diM = trSum > 0 ? (mdmSum / trSum) * 100 : 0;
      const diSum = diP + diM;
      dx.push(diSum === 0 ? 0 : (Math.abs(diP - diM) / diSum) * 100);
      if (i > period - 1) { trSum -= trs[i - period]; pdmSum -= plusDM[i - period]; mdmSum -= minusDM[i - period]; }
    }
  }
  const adxArr: number[] = [];
  let adxSum = 0;
  for (let i = 0; i < dx.length; i++) {
    adxSum += dx[i];
    if (i >= period - 1) {
      adxArr.push(adxSum / period);
      adxSum -= dx[i - period + 1];
    }
  }
  return adxArr.length > 0 ? adxArr[adxArr.length - 1] : NaN;
}

function stochastic(highs: number[], lows: number[], closes: number[], period = 14, smooth = 3) {
  const kVals: number[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    const hMax = Math.max(...highs.slice(i - period + 1, i + 1));
    const lMin = Math.min(...lows.slice(i - period + 1, i + 1));
    const k = ((closes[i] - lMin) / (hMax - lMin || 1e-9)) * 100;
    kVals.push(Number.isFinite(k) ? k : 50);
  }
  const kSmooth = ema(kVals, smooth);
  return kSmooth.length > 0 ? Math.min(100, Math.max(0, kSmooth[kSmooth.length - 1])) : NaN;
}

function cci(highs: number[], lows: number[], closes: number[], period = 20) {
  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  if (tp.length < period) return NaN;
  const smaVals: number[] = [];
  for (let i = period - 1; i < tp.length; i++) {
    smaVals.push(tp.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
  }
  const last = tp.length - 1;
  const smaIdx = last - (period - 1);
  if (smaIdx < 0 || smaIdx >= smaVals.length) return NaN;
  const dev = tp.slice(last - period + 1, last + 1).map(t => Math.abs(t - smaVals[smaIdx])).reduce((a, b) => a + b, 0) / period;
  return dev === 0 ? 0 : (tp[last] - smaVals[smaIdx]) / (0.015 * dev);
}

function aroon(highs: number[], lows: number[], period = 25) {
  if (highs.length <= period) return { up: NaN, down: NaN };
  const i = highs.length - 1;
  const sliceH = highs.slice(i - period, i + 1);
  const sliceL = lows.slice(i - period, i + 1);
  const maxH = Math.max(...sliceH);
  const minL = Math.min(...sliceL);
  let daysSinceHigh = period, daysSinceLow = period;
  for (let j = sliceH.length - 1; j >= 0; j--) {
    if (sliceH[j] === maxH) { daysSinceHigh = sliceH.length - 1 - j; break; }
  }
  for (let j = sliceL.length - 1; j >= 0; j--) {
    if (sliceL[j] === minL) { daysSinceLow = sliceL.length - 1 - j; break; }
  }
  return {
    up: Math.min(100, Math.max(0, ((period - daysSinceHigh) / period) * 100)),
    down: Math.min(100, Math.max(0, ((period - daysSinceLow) / period) * 100)),
  };
}

function obv(closes: number[], volumes: number[]): number[] {
  const out = [volumes[0] || 0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) out.push(out[i - 1] + (volumes[i] || 0));
    else if (closes[i] < closes[i - 1]) out.push(out[i - 1] - (volumes[i] || 0));
    else out.push(out[i - 1]);
  }
  return out;
}

// ─── Score computation (mirrors /api/scanner/run computeScore) ────────────

interface ScoreResult {
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  signals: { bullish: number; bearish: number; neutral: number };
}

function computeScore(
  close: number,
  ema200Val: number,
  rsiVal: number,
  macLine: number,
  sigLine: number,
  macHist: number,
  atrVal: number,
  adxVal: number,
  stochK: number,
  aroonU: number,
  aroonD: number,
  cciVal: number,
  obvCurr: number,
  obvPrev: number,
): ScoreResult {
  let bull = 0, bear = 0, neut = 0;

  // ADX trend multiplier
  let tm = 1.0;
  if (Number.isFinite(adxVal)) {
    if (adxVal >= 40) tm = 1.4;
    else if (adxVal >= 25) tm = 1.25;
    else if (adxVal >= 20) tm = 1.0;
    else tm = 0.7;
  }

  // Trend signals (ADX-weighted)
  if (Number.isFinite(ema200Val) && Number.isFinite(close)) {
    const w = 2 * tm;
    if (close > ema200Val * 1.01) bull += w;
    else if (close < ema200Val * 0.99) bear += w;
    else neut += 1;
  }
  if (Number.isFinite(macHist)) { if (macHist > 0) bull += tm; else bear += tm; }
  if (Number.isFinite(macLine) && Number.isFinite(sigLine)) { if (macLine > sigLine) bull += tm; else bear += tm; }
  if (Number.isFinite(aroonU) && Number.isFinite(aroonD)) {
    const w = tm;
    if (aroonU > aroonD && aroonU > 70) bull += w;
    else if (aroonD > aroonU && aroonD > 70) bear += w;
    else neut += 0.5;
  }
  if (Number.isFinite(obvCurr) && Number.isFinite(obvPrev)) {
    const w = tm;
    if (obvCurr > obvPrev) bull += w; else if (obvCurr < obvPrev) bear += w; else neut += 0.5;
  }

  // Oscillator signals (NOT ADX-weighted)
  if (Number.isFinite(rsiVal)) {
    if (rsiVal >= 55 && rsiVal <= 70) bull += 1;
    else if (rsiVal > 70) bear += 1;
    else if (rsiVal <= 45 && rsiVal >= 30) bear += 1;
    else if (rsiVal < 30) bull += 1;
    else neut += 1;
  }
  if (Number.isFinite(stochK)) {
    if (stochK > 80) bear += 1; else if (stochK < 20) bull += 1;
    else if (stochK >= 50) bull += 0.5; else bear += 0.5;
  }
  if (Number.isFinite(cciVal)) {
    if (cciVal > 100) bull += 1; else if (cciVal > 0) bull += 0.5;
    else if (cciVal < -100) bear += 1; else bear += 0.5;
  }
  if (Number.isFinite(atrVal) && Number.isFinite(close)) {
    if ((atrVal / close) * 100 > 5) neut += 1;
  }

  let direction: 'bullish' | 'bearish' | 'neutral';
  if (bull > bear * 1.15) direction = 'bullish';
  else if (bear > bull * 1.15) direction = 'bearish';
  else direction = 'neutral';

  const maxSig = 10 * tm;
  let score = 50 + ((bull - bear) / maxSig) * 50;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    direction,
    signals: {
      bullish: Math.round(bull * 10) / 10,
      bearish: Math.round(bear * 10) / 10,
      neutral: Math.round(neut * 10) / 10,
    },
  };
}

// ─── Walkthrough engine ───────────────────────────────────────────────────

export interface ScannerBacktestParams {
  /** Symbol for labeling trades */
  symbol: string;
  /** OHLCV bars sorted ascending by date */
  bars: { date: string; open: number; high: number; low: number; close: number; volume: number }[];
  /** Starting equity */
  initialCapital: number;
  /** Minimum scanner score to trigger entry (0-100, default 55) */
  minScore: number;
  /** ATR stop multiplier (default 1.5) */
  stopMultiplier: number;
  /** ATR target multiplier (default 3.0) */
  targetMultiplier: number;
  /** Max bars to hold a trade (default 20) */
  maxHoldBars: number;
  /** Allow short trades (default true) */
  allowShorts: boolean;
}

export interface ScannerBacktestResult extends BacktestEngineResult {
  params: {
    symbol: string;
    minScore: number;
    stopMultiplier: number;
    targetMultiplier: number;
    maxHoldBars: number;
    allowShorts: boolean;
    bars: number;
  };
  /** Per-bar score series for charting */
  scoreSeries: { date: string; score: number; direction: string }[];
}

const WARMUP_BARS = 200; // Need 200 bars for EMA200

export function runScannerBacktest(params: ScannerBacktestParams): ScannerBacktestResult {
  const {
    symbol,
    bars,
    initialCapital,
    minScore,
    stopMultiplier = 1.5,
    targetMultiplier = 3.0,
    maxHoldBars = 20,
    allowShorts = true,
  } = params;

  const trades: BacktestTrade[] = [];
  const scoreSeries: { date: string; score: number; direction: string }[] = [];

  if (bars.length < WARMUP_BARS + 30) {
    // Not enough data
    const emptyResult = buildBacktestEngineResult([], [], initialCapital);
    return {
      ...emptyResult,
      params: { symbol, minScore, stopMultiplier, targetMultiplier, maxHoldBars, allowShorts, bars: bars.length },
      scoreSeries: [],
    };
  }

  // Pre-extract arrays
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);

  // Pre-compute full indicator arrays
  const rsiArr = rsi(closes, 14);
  const macObj = macd(closes, 12, 26, 9);
  const ema200Arr = ema(closes, 200);
  const atrArr = atr(highs, lows, closes, 14);
  const obvArr = obv(closes, volumes);

  // Track open position
  let inTrade = false;
  let tradeSide: 'LONG' | 'SHORT' = 'LONG';
  let entryPrice = 0;
  let entryDate = '';
  let entryIdx = 0;
  let stopPrice = 0;
  let targetPrice = 0;

  // Walk bar-by-bar starting after warmup
  for (let i = WARMUP_BARS; i < bars.length; i++) {
    const close = closes[i];
    const date = bars[i].date;
    const high = highs[i];
    const low = lows[i];

    // Compute window-based indicators at this bar
    const windowCloses = closes.slice(0, i + 1);
    const windowHighs = highs.slice(0, i + 1);
    const windowLows = lows.slice(0, i + 1);

    const adxVal = adx(windowHighs, windowLows, windowCloses, 14);
    const stochK = stochastic(windowHighs, windowLows, windowCloses, 14, 3);
    const cciVal = cci(windowHighs, windowLows, windowCloses, 20);
    const aroonVal = aroon(windowHighs, windowLows, 25);

    // Use pre-computed array values for array-based indicators
    const rsiVal = rsiArr[i] ?? NaN;
    const macLine = macObj.macdLine[i] ?? NaN;
    const sigLine = macObj.signalLine[i] ?? NaN;
    const macHist = macObj.hist[i] ?? NaN;
    const ema200Val = ema200Arr[i] ?? NaN;
    const atrVal = atrArr[i - 1] ?? NaN; // ATR array is offset by 1
    const obvCurr = obvArr[i] ?? NaN;
    const obvPrev = obvArr[i - 1] ?? NaN;

    const result = computeScore(close, ema200Val, rsiVal, macLine, sigLine, macHist, atrVal, adxVal, stochK, aroonVal.up, aroonVal.down, cciVal, obvCurr, obvPrev);

    scoreSeries.push({ date, score: result.score, direction: result.direction });

    if (inTrade) {
      // Check exit conditions
      let exitPrice = 0;
      let exitReason: BacktestTrade['exitReason'] = undefined;

      if (tradeSide === 'LONG') {
        if (low <= stopPrice) { exitPrice = stopPrice; exitReason = 'stop'; }
        else if (high >= targetPrice) { exitPrice = targetPrice; exitReason = 'target'; }
        else if (result.direction === 'bearish' && result.score <= 40) { exitPrice = close; exitReason = 'signal_flip'; }
        else if (i - entryIdx >= maxHoldBars) { exitPrice = close; exitReason = 'timeout'; }
      } else {
        if (high >= stopPrice) { exitPrice = stopPrice; exitReason = 'stop'; }
        else if (low <= targetPrice) { exitPrice = targetPrice; exitReason = 'target'; }
        else if (result.direction === 'bullish' && result.score >= 60) { exitPrice = close; exitReason = 'signal_flip'; }
        else if (i - entryIdx >= maxHoldBars) { exitPrice = close; exitReason = 'timeout'; }
      }

      if (exitPrice > 0 && exitReason) {
        const pnl = tradeSide === 'LONG'
          ? (exitPrice - entryPrice) * (initialCapital / entryPrice)
          : (entryPrice - exitPrice) * (initialCapital / entryPrice);
        const pnlPct = tradeSide === 'LONG'
          ? ((exitPrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - exitPrice) / entryPrice) * 100;

        // Compute MFE/MAE
        let mfe = 0, mae = 0;
        for (let j = entryIdx + 1; j <= i; j++) {
          if (tradeSide === 'LONG') {
            mfe = Math.max(mfe, ((highs[j] - entryPrice) / entryPrice) * 100);
            mae = Math.min(mae, ((lows[j] - entryPrice) / entryPrice) * 100);
          } else {
            mfe = Math.max(mfe, ((entryPrice - lows[j]) / entryPrice) * 100);
            mae = Math.min(mae, ((entryPrice - highs[j]) / entryPrice) * 100);
          }
        }

        trades.push({
          entryDate,
          exitDate: date,
          symbol,
          side: tradeSide,
          direction: tradeSide === 'LONG' ? 'long' : 'short',
          entryTs: entryDate,
          exitTs: date,
          entry: entryPrice,
          exit: exitPrice,
          return: pnl,
          returnPercent: pnlPct,
          mfe: parseFloat(mfe.toFixed(2)),
          mae: parseFloat(mae.toFixed(2)),
          exitReason,
          holdingPeriodDays: i - entryIdx,
        });

        inTrade = false;
      }
    }

    // Check entry conditions (only if not in a trade)
    if (!inTrade && Number.isFinite(atrVal) && atrVal > 0) {
      const atrSafe = atrVal;

      if (result.direction === 'bullish' && result.score >= minScore) {
        inTrade = true;
        tradeSide = 'LONG';
        entryPrice = close;
        entryDate = date;
        entryIdx = i;
        stopPrice = close - atrSafe * stopMultiplier;
        targetPrice = close + atrSafe * targetMultiplier;
      } else if (allowShorts && result.direction === 'bearish' && result.score <= (100 - minScore)) {
        inTrade = true;
        tradeSide = 'SHORT';
        entryPrice = close;
        entryDate = date;
        entryIdx = i;
        stopPrice = close + atrSafe * stopMultiplier;
        targetPrice = close - atrSafe * targetMultiplier;
      }
    }
  }

  // Close any open trade at end of data
  if (inTrade) {
    const lastBar = bars[bars.length - 1];
    const pnl = tradeSide === 'LONG'
      ? (lastBar.close - entryPrice) * (initialCapital / entryPrice)
      : (entryPrice - lastBar.close) * (initialCapital / entryPrice);
    const pnlPct = tradeSide === 'LONG'
      ? ((lastBar.close - entryPrice) / entryPrice) * 100
      : ((entryPrice - lastBar.close) / entryPrice) * 100;

    trades.push({
      entryDate,
      exitDate: lastBar.date,
      symbol,
      side: tradeSide,
      direction: tradeSide === 'LONG' ? 'long' : 'short',
      entryTs: entryDate,
      exitTs: lastBar.date,
      entry: entryPrice,
      exit: lastBar.close,
      return: pnl,
      returnPercent: pnlPct,
      exitReason: 'end_of_data',
      holdingPeriodDays: (bars.length - 1) - entryIdx,
    });
  }

  const dates = bars.slice(WARMUP_BARS).map(b => b.date);
  const engineResult = buildBacktestEngineResult(trades, dates, initialCapital);

  return {
    ...engineResult,
    params: {
      symbol,
      minScore,
      stopMultiplier,
      targetMultiplier,
      maxHoldBars,
      allowShorts,
      bars: bars.length,
    },
    scoreSeries,
  };
}
