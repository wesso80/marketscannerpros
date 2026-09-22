/**
 * Scanner Backtest Engine
 *
 * Replays the versioned technical proxy on completed historical bars.
 * It shares the proxy formula exposed in live snapshots, but cannot reconstruct
 * the full MSP composite without point-in-time cross-asset and derivatives data.
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

import { computeTechnicalProxy, TECHNICAL_PROXY_VERSION } from '@/lib/scanner/technicalProxy';
import type { BacktestTrade } from './engine';
import { buildBacktestEngineResult, type BacktestEngineResult } from './engine';
import { BACKTEST_SLIPPAGE_BPS, BACKTEST_COMMISSION_BPS, buildBacktestAssumptionsMetadata } from './assumptions';

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
  if (trs.length < period) return out;
  // Seed: SMA of first `period` true ranges (Wilder convention)
  let atrVal = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = atrVal;
  for (let i = period; i < trs.length; i++) {
    // Wilder smoothing: ATR = (prev * (n-1) + TR) / n
    atrVal = (atrVal * (period - 1) + trs[i]) / period;
    out[i] = atrVal;
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
    const range = hMax - lMin;
    // Flat-candle guard: zero range means no price movement — return NaN, not inflated %K
    const k = range === 0 ? NaN : ((closes[i] - lMin) / range) * 100;
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

// ─── Shared historical proxy ─────────────────────────────────────────────

// ─── Walkthrough engine ───────────────────────────────────────────────────

export interface ScannerBacktestParams {
  sourceBarMinutes?: number;
  assetType?: 'stock' | 'crypto';
  timeframe?: string;
  /** Inclusive trading window; earlier bars are used only to warm indicators. */
  startDate?: string;
  endDate?: string;
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

export function scannerExitFill(side: 'LONG' | 'SHORT', rawPrice: number): number {
  return rawPrice * (1 + (side === 'LONG' ? -1 : 1) * BACKTEST_SLIPPAGE_BPS / 10000);
}

export function scannerTradeNet(side: 'LONG' | 'SHORT', entry: number, exit: number, notional: number, asset: 'stock' | 'crypto') {
  const units = notional / entry;
  const gross = (side === 'LONG' ? exit - entry : entry - exit) * units;
  return gross - (entry + exit) * units * BACKTEST_COMMISSION_BPS[asset] / 10000;
}

const WARMUP_BARS = 200; // Need 200 bars for EMA200

export function runScannerBacktest(params: ScannerBacktestParams): ScannerBacktestResult {
  const {
    symbol,
    bars: suppliedBars,
    initialCapital,
    minScore,
    stopMultiplier = 1.5,
    targetMultiplier = 3.0,
    maxHoldBars = 20,
    allowShorts = true,
  } = params;

  const bars = suppliedBars.filter(bar => !params.endDate || bar.date.slice(0, 10) <= params.endDate);
  const requestedStart = params.startDate
    ? bars.findIndex(bar => bar.date.slice(0, 10) >= params.startDate!)
    : WARMUP_BARS;
  const firstTradingIndex = requestedStart < 0 ? bars.length : Math.max(WARMUP_BARS, requestedStart);

  const trades: BacktestTrade[] = [];
  const scoreSeries: { date: string; score: number; direction: string }[] = [];

  if (bars.length < WARMUP_BARS + 30 || firstTradingIndex >= bars.length) {
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

  const assetType = params.assetType ?? 'stock';
  let balance = initialCapital;
  let notional = initialCapital * 0.95;
  let pendingExit: BacktestTrade['exitReason'];
  const markedBalances = new Map<string, number>();
  // Track open position
  let inTrade = false;
  let tradeSide: 'LONG' | 'SHORT' = 'LONG';
  let entryPrice = 0;
  let entryDate = '';
  let entryIdx = 0;
  let stopPrice = 0;
  let targetPrice = 0;

  // Walk bar-by-bar starting after warmup
  for (let i = firstTradingIndex; i < bars.length; i++) {
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

    const result = computeTechnicalProxy(close, ema200Val, rsiVal, macLine, sigLine, macHist, atrVal, adxVal, stochK, aroonVal.up, aroonVal.down, cciVal, obvCurr, obvPrev);

    scoreSeries.push({ date, score: result.score, direction: result.direction });

    if (inTrade) {
      // Check exit conditions
      let exitPrice = 0;
      let exitReason: BacktestTrade['exitReason'] = undefined;

      if (pendingExit) { exitPrice = bars[i].open; exitReason = pendingExit; pendingExit = undefined; }
      else if (tradeSide === 'LONG') {
        if (low <= stopPrice) { exitPrice = Math.min(bars[i].open, stopPrice); exitReason = 'stop'; }
        else if (high >= targetPrice) { exitPrice = targetPrice; exitReason = 'target'; }
        else if (result.direction === 'bearish' && result.score <= 40) { pendingExit = 'signal_flip'; }
        else if (i - entryIdx >= maxHoldBars) { pendingExit = 'timeout'; }
      } else {
        if (high >= stopPrice) { exitPrice = Math.max(bars[i].open, stopPrice); exitReason = 'stop'; }
        else if (low <= targetPrice) { exitPrice = targetPrice; exitReason = 'target'; }
        else if (result.direction === 'bullish' && result.score >= 60) { pendingExit = 'signal_flip'; }
        else if (i - entryIdx >= maxHoldBars) { pendingExit = 'timeout'; }
      }

      if (exitPrice > 0 && exitReason) {
        exitPrice = scannerExitFill(tradeSide, exitPrice);
        const pnl = scannerTradeNet(tradeSide, entryPrice, exitPrice, notional, assetType);
        const pnlPct = pnl / notional * 100;
        balance += pnl;

        // Compute MFE/MAE
        let mfe = 0, mae = 0;
        for (let j = entryIdx; j <= i; j++) {
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

    const unrealized = inTrade ? scannerTradeNet(tradeSide, entryPrice, scannerExitFill(tradeSide, close), notional, assetType) : 0;
    markedBalances.set(date, balance + unrealized);
    // Signals use this completed bar; entries fill at the following bar's open.
    if (!inTrade && balance > 0 && i < bars.length - 1 && Number.isFinite(atrVal) && atrVal > 0) {
      const atrSafe = atrVal;
      notional = Math.min(initialCapital, balance) * 0.95;

      if (result.direction === 'bullish' && result.score >= minScore) {
        inTrade = true;
        tradeSide = 'LONG';
        entryPrice = bars[i + 1].open * (1 + (tradeSide === 'LONG' ? 1 : -1) * BACKTEST_SLIPPAGE_BPS / 10000);
        entryDate = bars[i + 1].date;
        entryIdx = i + 1;
        stopPrice = entryPrice - atrSafe * stopMultiplier;
        targetPrice = entryPrice + atrSafe * targetMultiplier;
      } else if (allowShorts && result.direction === 'bearish' && result.score <= (100 - minScore)) {
        inTrade = true;
        tradeSide = 'SHORT';
        entryPrice = bars[i + 1].open * (1 + -1 * BACKTEST_SLIPPAGE_BPS / 10000);
        entryDate = bars[i + 1].date;
        entryIdx = i + 1;
        stopPrice = entryPrice + atrSafe * stopMultiplier;
        targetPrice = entryPrice - atrSafe * targetMultiplier;
      }
    }
  }

  // Close any open trade at end of data
  if (inTrade) {
    const lastBar = bars[bars.length - 1];
    const finalExit = scannerExitFill(tradeSide, lastBar.close);
    const pnl = scannerTradeNet(tradeSide, entryPrice, finalExit, notional, assetType);
    const pnlPct = pnl / notional * 100;
    balance += pnl;
    markedBalances.set(lastBar.date, balance);

    trades.push({
      entryDate,
      exitDate: lastBar.date,
      symbol,
      side: tradeSide,
      direction: tradeSide === 'LONG' ? 'long' : 'short',
      entryTs: entryDate,
      exitTs: lastBar.date,
      entry: entryPrice,
      exit: finalExit,
      return: pnl,
      returnPercent: pnlPct,
      exitReason: 'end_of_data',
      holdingPeriodDays: (bars.length - 1) - entryIdx,
    });
  }

  const dates = bars.slice(firstTradingIndex).map(b => b.date);
  const engineResult = buildBacktestEngineResult(trades, dates, initialCapital, { sourceBarMinutes: params.sourceBarMinutes, markedBalances });

  const executionAssumptions = buildBacktestAssumptionsMetadata({ strategyId: TECHNICAL_PROXY_VERSION, timeframe: params.timeframe ?? 'daily', assetType,
    totalTrades: trades.length, bars: dates.length, volumeUnavailable: bars.some(bar => !(bar.volume > 0)) });
  executionAssumptions.fillModel.entryTiming = 'Completed-bar signals enter at the next bar open with adverse slippage.';
  executionAssumptions.fillModel.exitTiming = 'Gap-through stops fill at the worse of open or stop plus slippage; signal flips/timeouts exit at the next open.';
  executionAssumptions.liquidity.sizeModel = '95% of the lesser of initial and available realized capital; one position at a time; no compounding above initial capital.';
  executionAssumptions.warnings.push('Technical-indicator proxy only: historical MSP permissions, options, funding, news and institutional scores are not replayed.');
  return {
    ...engineResult,
    executionAssumptions,
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
