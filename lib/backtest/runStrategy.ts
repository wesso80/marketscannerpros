/**
 * Backtest Strategy Runner
 *
 * Pure function: given a strategy ID, price data and parameters, returns
 * trade list + dates + closes.  Zero framework dependencies (no Next.js,
 * no logger, no auth) — safe for unit-testing.
 *
 * Extracted from app/api/backtest/route.ts during the 2026-02-27 strategy audit.
 */

import type { BacktestTrade } from './engine';
import { runCoreStrategyStep } from './strategyExecutors';
import { parseBacktestTimeframe } from './timeframe';
import { enrichTradesWithMetadata } from './tradeForensics';
import {
  calculateEMA,
  calculateSMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateADX,
  calculateBollingerBands,
  calculateStochastic,
  calculateCCI,
  calculateOBV,
  calculateIchimoku,
} from './indicators';
import type { PriceData } from './providers';

// ─── Types ────────────────────────────────────────────────────────────────

export interface Trade {
  entryDate: string;
  exitDate: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  direction?: 'long' | 'short';
  entryTs?: string;
  exitTs?: string;
  entry: number;
  exit: number;
  return: number;
  returnPercent: number;
  mfe?: number;
  mae?: number;
  exitReason?: BacktestTrade['exitReason'];
  holdingPeriodDays: number;
}

export interface StrategyResult {
  trades: Trade[];
  dates: string[];
  closes: number[];
}

type Position = {
  side: 'LONG' | 'SHORT';
  entry: number;
  entryDate: string;
  entryIdx: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function calcReturnDollars(side: 'LONG' | 'SHORT', entry: number, exit: number, qty: number) {
  return side === 'LONG' ? (exit - entry) * qty : (entry - exit) * qty;
}

function calcReturnPercent(side: 'LONG' | 'SHORT', entry: number, exit: number) {
  return side === 'LONG'
    ? ((exit - entry) / entry) * 100
    : ((entry - exit) / entry) * 100;
}

function computeSLTP(
  side: 'LONG' | 'SHORT',
  entry: number,
  atrVal: number,
  slATR: number,
  tpATR: number,
) {
  const sl = side === 'LONG'
    ? entry - atrVal * slATR
    : entry + atrVal * slATR;

  const tp = side === 'LONG'
    ? entry + atrVal * tpATR
    : entry - atrVal * tpATR;

  return { sl, tp };
}

function checkHitSLTP(
  side: 'LONG' | 'SHORT',
  high: number,
  low: number,
  sl: number,
  tp: number,
) {
  const hitSL = side === 'LONG' ? low <= sl : high >= sl;
  const hitTP = side === 'LONG' ? high >= tp : low <= tp;
  return { hitSL, hitTP };
}

// ─── Main ─────────────────────────────────────────────────────────────────

export function runStrategy(
  strategy: string,
  priceData: PriceData,
  initialCapital: number,
  startDate: string,
  endDate: string,
  symbol: string,
  timeframe: string = 'daily'
): StrategyResult {
  // Signal-replay strategies require real-time signal packets — not available in historical backtest
  const replayStrategies = ['brain_signal_replay', 'options_signal_replay', 'time_scanner_signal_replay'];
  if (replayStrategies.includes(strategy)) {
    throw new Error(`${strategy} is a live-signal replay strategy that requires real-time decision packets. Use it from the Operator dashboard, not in historical backtest mode.`);
  }

  const parsedTimeframe = parseBacktestTimeframe(timeframe);
  const isIntraday = parsedTimeframe ? parsedTimeframe.kind === 'intraday' : timeframe !== 'daily';

  // Get all available dates and filter by date range
  const allDates = Object.keys(priceData).sort();

  const dates = allDates.filter(d => {
    const dateOnly = d.split(' ')[0];
    return dateOnly >= startDate && dateOnly <= endDate;
  });

  // Minimum data requirements
  const minDataPoints = isIntraday
    ? 50
    : (parsedTimeframe?.minutes ?? 1440) >= 525600
      ? 3
      : (parsedTimeframe?.minutes ?? 1440) >= 43200
        ? 24
        : (parsedTimeframe?.minutes ?? 1440) >= 10080
          ? 52
          : 100;
  if (dates.length < minDataPoints) {
    const tfLabel = isIntraday ? `${timeframe} bars` : 'days';
    throw new Error(`Insufficient data for ${symbol}. Got ${dates.length} ${tfLabel}, need at least ${minDataPoints}. Try adjusting date range.`);
  }

  const closes = dates.map(d => priceData[d].close);
  const trades: Trade[] = [];
  let position: Position | null = null;

  const highs = dates.map(d => priceData[d].high);
  const lows = dates.map(d => priceData[d].low);
  const volumes = dates.map(d => priceData[d].volume);

  // ── Indicator computation ──────────────────────────────────────────────

  let ema9: number[] = [];
  let ema21: number[] = [];
  let ema55: number[] = [];
  let ema200: number[] = [];
  let sma50: number[] = [];
  let sma200: number[] = [];
  let rsi: number[] = [];
  let rsi21: number[] = [];
  let macdData: { macd: number[]; signal: number[]; histogram: number[] } | null = null;
  let bbands: { upper: number[]; middle: number[]; lower: number[] } | null = null;
  let adxData: { adx: number[]; diPlus: number[]; diMinus: number[] } | null = null;
  let atr: number[] = [];
  let volSMA: number[] = [];

  const isMSP = strategy.startsWith('msp_');
  const isScalp = strategy.startsWith('scalp_');
  const isSwing = strategy.startsWith('swing_');
  const needsFullIndicators = isMSP || isScalp || isSwing
    || strategy === 'supertrend'
    || strategy === 'multi_confluence_5'
    || strategy === 'triple_ema'
    || strategy === 'keltner_atr_breakout'
    || strategy === 'volume_breakout'
    || strategy === 'volume_climax_reversal'
    || strategy === 'ichimoku_cloud';

  if (strategy.includes('ema') || strategy === 'multi_ema_rsi' || needsFullIndicators) {
    ema9 = calculateEMA(closes, 9);
    ema21 = calculateEMA(closes, 21);
  }

  if (needsFullIndicators) {
    ema55 = calculateEMA(closes, 55);
    const emaPeriod = closes.length >= 200 ? 200 : Math.max(55, Math.floor(closes.length * 0.6));
    ema200 = calculateEMA(closes, emaPeriod);
    adxData = calculateADX(highs, lows, closes, 14);
    atr = calculateATR(highs, lows, closes, 14);
    volSMA = calculateSMA(volumes, 20);
  }

  if (strategy.includes('sma')) {
    sma50 = calculateSMA(closes, 50);
    sma200 = calculateSMA(closes, 200);
  }

  if (strategy.includes('rsi') || strategy === 'multi_ema_rsi' || needsFullIndicators) {
    rsi = calculateRSI(closes, 14);
    rsi21 = calculateRSI(closes, 21);
  }

  if (strategy.includes('macd') || strategy === 'multi_macd_adx' || needsFullIndicators) {
    macdData = calculateMACD(closes);
  }

  if (strategy.includes('bbands') || strategy.includes('bb') || strategy === 'multi_bb_stoch' || strategy === 'multi_confluence_5' || isScalp) {
    bbands = calculateBollingerBands(closes, 20, 2);
  }

  let stochData: { k: number[]; d: number[] } | null = null;
  if (strategy.includes('stoch') || strategy === 'multi_bb_stoch') {
    stochData = calculateStochastic(highs, lows, closes, 14, 3);
  }

  let cci: number[] = [];
  if (strategy.includes('cci')) {
    cci = calculateCCI(highs, lows, closes, 20);
  }

  let obv: number[] = [];
  if (strategy.includes('obv')) {
    obv = calculateOBV(closes, volumes);
  }

  if (strategy === 'adx_trend' && !adxData) {
    adxData = calculateADX(highs, lows, closes, 14);
  }

  let ichimokuData: { tenkan: number[]; kijun: number[]; senkouA: number[]; senkouB: number[] } | null = null;
  if (strategy === 'ichimoku_cloud') {
    ichimokuData = calculateIchimoku(highs, lows);
  }

  // ── Start index ────────────────────────────────────────────────────────

  let startIdx: number;
  if (isScalp) {
    startIdx = 25;
  } else if (isMSP || isSwing) {
    startIdx = Math.min(60, Math.floor(dates.length * 0.2));
  } else if (strategy === 'sma_crossover' || strategy.includes('200')) {
    startIdx = Math.min(200, Math.floor(dates.length * 0.4));
  } else if (strategy === 'ichimoku_cloud') {
    startIdx = Math.min(78, Math.floor(dates.length * 0.3));
  } else {
    startIdx = 30;
  }

  // ── Per-bar loop ───────────────────────────────────────────────────────

  for (let i = startIdx; i < dates.length - 1; i++) {
    const date = dates[i];
    const close = closes[i];

    const coreStep = runCoreStrategyStep({
      strategy,
      i,
      date,
      close,
      initialCapital,
      symbol,
      position,
      trades,
      indicators: {
        highs, lows, ema9, ema21, sma50, sma200, rsi, closes, cci, obv,
        macdData, bbands, adxData, stochData,
      },
    });

    if (coreStep.handled) {
      position = coreStep.position;
      continue;
    }

    // ═══════════════════════════════════════════════════════════════════
    // MSP MULTI-TF DASHBOARD STRATEGY
    // ═══════════════════════════════════════════════════════════════════

    if ((strategy === 'msp_multi_tf' || strategy === 'msp_multi_tf_strict') && adxData && macdData) {
      const { adx, diPlus, diMinus } = adxData;
      const { macd, signal, histogram } = macdData;
      const minBias = strategy === 'msp_multi_tf_strict' ? 8 : 6;

      const tf1Trend = close > ema9[i] && ema9[i] > ema21[i] ? 1 : close < ema9[i] && ema9[i] < ema21[i] ? -1 : 0;
      const tf1RSI = rsi[i] > 55 ? 1 : rsi[i] < 45 ? -1 : 0;
      const tf1MACD = macd[i] > signal[i] && histogram[i] > 0 ? 1 : macd[i] < signal[i] && histogram[i] < 0 ? -1 : 0;
      const tf1Vol = volumes[i] > (volSMA[i] || 0) * 1.2 ? 1 : 0;
      const tf1Bias = tf1Trend + tf1RSI + tf1MACD + (tf1Trend !== 0 && tf1Vol ? (tf1Trend > 0 ? 1 : -1) : 0);

      const tf2Trend = close > ema21[i] && ema21[i] > ema55[i] ? 1 : close < ema21[i] && ema21[i] < ema55[i] ? -1 : 0;
      const tf2RSI = (rsi21[i] || 50) > 55 ? 1 : (rsi21[i] || 50) < 45 ? -1 : 0;
      const tf2Bias = tf2Trend + tf2RSI + tf1MACD;

      const tf3Trend = close > ema55[i] && ema55[i] > ema200[i] ? 1 : close < ema55[i] && ema55[i] < ema200[i] ? -1 : 0;
      const tf3Bias = tf3Trend + (adx[i] > 25 && diPlus[i] > diMinus[i] ? 1 : adx[i] > 25 && diMinus[i] > diPlus[i] ? -1 : 0);

      const tf4Trend = close > ema200[i] ? 1 : close < ema200[i] ? -1 : 0;
      const tf4Bias = tf4Trend;

      const totalBias = tf1Bias + tf2Bias + tf3Bias + tf4Bias;

      const adxOk = adx[i] > 20;
      const longSignal = totalBias >= minBias && adxOk && !position;
      const shortSignal = totalBias <= -minBias && adxOk && !position;

      const slATR = 1.5;
      const tpATR = 3.0;

      if (!position && longSignal) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (!position && shortSignal) {
        position = { side: 'SHORT', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const side = position.side;
        const entryPrice = position.entry;
        const atrVal = atr[i] || close * 0.02;
        const { sl, tp } = computeSLTP(side, entryPrice, atrVal, slATR, tpATR);
        const { hitSL, hitTP } = checkHitSLTP(side, highs[i], lows[i], sl, tp);
        const biasReversal = side === 'LONG' ? totalBias <= 0 : totalBias >= 0;
        const barsHeld = i - position.entryIdx;

        if (hitSL || hitTP || biasReversal) {
          let exitPrice = close;
          if (hitSL) exitPrice = sl;
          if (hitTP) exitPrice = tp;
          const exitReason: BacktestTrade['exitReason'] = hitSL ? 'stop' : hitTP ? 'target' : 'signal_flip';
          const shares = (initialCapital * 0.95) / entryPrice;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side,
            entry: entryPrice, exit: exitPrice,
            return: calcReturnDollars(side, entryPrice, exitPrice, shares),
            returnPercent: calcReturnPercent(side, entryPrice, exitPrice),
            exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // MSP DAY TRADER STRATEGIES
    // ═══════════════════════════════════════════════════════════════════

    if ((strategy === 'msp_day_trader' || strategy === 'msp_day_trader_strict' || strategy === 'msp_day_trader_v3' || strategy === 'msp_day_trader_v3_aggressive' || strategy === 'msp_trend_pullback' || strategy === 'msp_liquidity_reversal') && adxData && macdData) {
      const { adx, diPlus, diMinus } = adxData;
      const { macd, signal, histogram } = macdData;
      const minScore = strategy === 'msp_day_trader_strict' ? 6 : 5;

      const bullTrend = ema9[i] > ema21[i] && ema21[i] > ema55[i] && close > ema55[i];
      const bearTrend = ema9[i] < ema21[i] && ema21[i] < ema55[i] && close < ema55[i];
      const htfBull = close > ema200[i] && ema9[i] > ema200[i];
      const htfBear = close < ema200[i] && ema9[i] < ema200[i];
      const strongTrend = adx[i] >= 25;
      const trendUp = diPlus[i] > diMinus[i] && strongTrend;
      const trendDn = diMinus[i] > diPlus[i] && strongTrend;

      const rsiBull = rsi[i] > 55 && rsi[i] < 75;
      const rsiBear = rsi[i] < 45 && rsi[i] > 25;
      const macdBull = macd[i] > signal[i] && histogram[i] > 0 && histogram[i] > (histogram[i - 1] || 0);
      const macdBear = macd[i] < signal[i] && histogram[i] < 0 && histogram[i] < (histogram[i - 1] || 0);
      const momBull = rsiBull && macdBull;
      const momBear = rsiBear && macdBear;

      const volSpike = volumes[i] > (volSMA[i] || 0) * 1.3;

      const body = Math.abs(close - priceData[dates[i]].open);
      const upWick = highs[i] - Math.max(close, priceData[dates[i]].open);
      const dnWick = Math.min(close, priceData[dates[i]].open) - lows[i];
      const priorHH = Math.max(...highs.slice(Math.max(0, i - 10), i));
      const priorLL = Math.min(...lows.slice(Math.max(0, i - 10), i));
      const sweepLow = lows[i] < priorLL && dnWick > body * 1.5 && close > priorLL;
      const sweepHigh = highs[i] > priorHH && upWick > body * 1.5 && close < priorHH;

      const nearBullFVG = (i >= 1 && lows[i - 1] > highs[i - 3]) || (i >= 2 && lows[i - 2] > highs[i - 4]);
      const nearBearFVG = (i >= 1 && highs[i - 1] < lows[i - 3]) || (i >= 2 && highs[i - 2] < lows[i - 4]);

      let scoreBull = 0;
      scoreBull += bullTrend ? 1 : 0;
      scoreBull += htfBull ? 1 : 0;
      scoreBull += trendUp ? 1 : 0;
      scoreBull += momBull ? 1 : 0;
      scoreBull += sweepLow ? 1 : 0;
      scoreBull += nearBullFVG ? 1 : 0;
      scoreBull += volSpike ? 1 : 0;

      let scoreBear = 0;
      scoreBear += bearTrend ? 1 : 0;
      scoreBear += htfBear ? 1 : 0;
      scoreBear += trendDn ? 1 : 0;
      scoreBear += momBear ? 1 : 0;
      scoreBear += sweepHigh ? 1 : 0;
      scoreBear += nearBearFVG ? 1 : 0;
      scoreBear += volSpike ? 1 : 0;

      const isTrendPullback = strategy === 'msp_trend_pullback';
      const isLiquidityReversal = strategy === 'msp_liquidity_reversal';
      const isDayTraderV3 = strategy === 'msp_day_trader_v3';
      const isDayTraderV3Aggressive = strategy === 'msp_day_trader_v3_aggressive';

      let longSignal = false;
      let shortSignal = false;

      if (isTrendPullback) {
        longSignal = bullTrend && htfBull && momBull && scoreBull >= 4;
        shortSignal = bearTrend && htfBear && momBear && scoreBear >= 4;
      } else if (isLiquidityReversal) {
        longSignal = sweepLow && momBull && htfBull && scoreBull >= 4;
        shortSignal = sweepHigh && momBear && htfBear && scoreBear >= 4;
      } else if (isDayTraderV3) {
        longSignal = scoreBull >= 3 && bullTrend;
        shortSignal = scoreBear >= 3 && bearTrend;
      } else if (isDayTraderV3Aggressive) {
        longSignal = scoreBull >= 2 || (momBull && bullTrend);
        shortSignal = scoreBear >= 2 || (momBear && bearTrend);
      } else {
        longSignal = scoreBull >= minScore && htfBull && strongTrend;
        shortSignal = scoreBear >= minScore && htfBear && strongTrend;
      }

      const slATR = 1.0;
      const tpATR = 3.5;

      if (!position && longSignal) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (!position && shortSignal) {
        position = { side: 'SHORT', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const side = position.side;
        const entryPrice = position.entry;
        const atrVal = atr[i] || close * 0.02;
        const { sl, tp } = computeSLTP(side, entryPrice, atrVal, slATR, tpATR);
        const { hitSL, hitTP } = checkHitSLTP(side, highs[i], lows[i], sl, tp);
        const trendFlip = side === 'LONG'
          ? bearTrend && adx[i] > 25
          : bullTrend && adx[i] > 25;
        const barsHeld = i - position.entryIdx;
        const timeExit = side === 'LONG'
          ? barsHeld >= 20 && close < entryPrice + atrVal * 0.5
          : barsHeld >= 20 && close > entryPrice - atrVal * 0.5;

        if (hitSL || hitTP || trendFlip || timeExit) {
          let exitPrice = close;
          if (hitSL) exitPrice = sl;
          if (hitTP) exitPrice = tp;
          const exitReason: BacktestTrade['exitReason'] = hitSL ? 'stop' : hitTP ? 'target' : timeExit ? 'timeout' : 'signal_flip';
          const shares = (initialCapital * 0.95) / entryPrice;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side,
            entry: entryPrice, exit: exitPrice,
            return: calcReturnDollars(side, entryPrice, exitPrice, shares),
            returnPercent: calcReturnPercent(side, entryPrice, exitPrice),
            exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // INTRADAY SCALPING STRATEGIES
    // ═══════════════════════════════════════════════════════════════════

    if (strategy === 'scalp_vwap_bounce') {
      let cumTPV = 0;
      let cumVol = 0;
      for (let j = Math.max(0, i - 20); j <= i; j++) {
        const tp = (highs[j] + lows[j] + closes[j]) / 3;
        cumTPV += tp * volumes[j];
        cumVol += volumes[j];
      }
      const vwap = cumVol > 0 ? cumTPV / cumVol : close;
      const nearVWAP = Math.abs(close - vwap) / vwap < 0.005;
      const bounceUp = close > closes[i - 1] && lows[i] <= vwap * 1.003;

      if (!position && nearVWAP && bounceUp && rsi[i] > 40 && rsi[i] < 60) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        if (gain >= 0.008 || gain <= -0.005 || barsHeld >= 10) {
          const shares = (initialCapital * 0.95) / position.entry;
          const exitReason: BacktestTrade['exitReason'] = gain >= 0.008 ? 'target' : gain <= -0.005 ? 'stop' : 'timeout';
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100, exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    if (strategy === 'scalp_orb_15') {
      const orbHigh = Math.max(...highs.slice(Math.max(0, i - 2), i + 1));
      const orbLow = Math.min(...lows.slice(Math.max(0, i - 2), i + 1));
      const orbRange = orbHigh - orbLow;
      const breakoutUp = close > orbHigh && volumes[i] > (volSMA[i] || 0) * 1.2;

      if (!position && breakoutUp && i > 3) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const target = position.entry + orbRange;
        const stop = position.entry - orbRange * 0.5;
        const barsHeld = i - position.entryIdx;
        if (highs[i] >= target || lows[i] <= stop || barsHeld >= 15) {
          const exitPrice = highs[i] >= target ? target : lows[i] <= stop ? stop : close;
          const shares = (initialCapital * 0.95) / position.entry;
          const exitReason: BacktestTrade['exitReason'] = highs[i] >= target ? 'target' : lows[i] <= stop ? 'stop' : 'timeout';
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: exitPrice,
            return: (exitPrice - position.entry) * shares,
            returnPercent: ((exitPrice - position.entry) / position.entry) * 100,
            exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    if (strategy === 'scalp_momentum_burst') {
      const momentumBurst = rsi[i] > 65 && rsi[i] < 80
        && macdData && macdData.histogram[i] > 0
        && macdData.histogram[i] > (macdData.histogram[i - 1] || 0) * 1.5
        && volumes[i] > (volSMA[i] || 0) * 1.5;

      if (!position && momentumBurst) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        const momentumFading = macdData && macdData.histogram[i] < (macdData.histogram[i - 1] || 0);
        if (gain >= 0.015 || gain <= -0.008 || momentumFading || barsHeld >= 8) {
          const shares = (initialCapital * 0.95) / position.entry;
          const exitReason: BacktestTrade['exitReason'] = gain >= 0.015 ? 'target' : gain <= -0.008 ? 'stop' : barsHeld >= 8 ? 'timeout' : 'signal_flip';
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100, exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    if (strategy === 'scalp_mean_revert' && bbands) {
      const oversold = close <= bbands.lower[i] && rsi[i] < 30;
      if (!position && oversold) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const revertedToMean = close >= bbands.middle[i];
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        if (revertedToMean || gain <= -0.01 || barsHeld >= 12) {
          const shares = (initialCapital * 0.95) / position.entry;
          const exitReason: BacktestTrade['exitReason'] = revertedToMean ? 'target' : gain <= -0.01 ? 'stop' : 'timeout';
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100, exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // SWING TRADING STRATEGIES
    // ═══════════════════════════════════════════════════════════════════

    if (strategy === 'swing_pullback_buy') {
      const uptrend = ema21[i] > ema55[i] && close > ema200[i];
      const pullback = close < ema21[i] && close > ema55[i];
      const reversing = close > closes[i - 1] && rsi[i] > 40;
      if (!position && uptrend && pullback && reversing) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        const trendBroken = close < ema55[i];
        if (gain >= 0.08 || gain <= -0.03 || trendBroken || barsHeld >= 30) {
          const shares = (initialCapital * 0.95) / position.entry;
          const exitReason: BacktestTrade['exitReason'] = gain >= 0.08 ? 'target' : gain <= -0.03 ? 'stop' : barsHeld >= 30 ? 'timeout' : 'signal_flip';
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100, exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    if (strategy === 'swing_breakout') {
      const resistance = Math.max(...highs.slice(Math.max(0, i - 20), i));
      const breakout = close > resistance && volumes[i] > (volSMA[i] || 0) * 1.5;
      const trendConfirm = ema21[i] > ema55[i];
      if (!position && breakout && trendConfirm) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        const failedBreakout = close < position.entry * 0.97;
        if (gain >= 0.10 || failedBreakout || barsHeld >= 25) {
          const shares = (initialCapital * 0.95) / position.entry;
          const exitReason: BacktestTrade['exitReason'] = gain >= 0.10 ? 'target' : failedBreakout ? 'stop' : 'timeout';
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100, exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    if (strategy === 'swing_earnings_drift') {
      const gap = (priceData[dates[i]].open - closes[i - 1]) / closes[i - 1];
      const positiveGap = gap > 0.03;
      const volumeSpike = volumes[i] > (volSMA[i] || 0) * 3;
      if (!position && positiveGap && volumeSpike) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        if (gain >= 0.12 || gain <= -0.05 || barsHeld >= 15) {
          const shares = (initialCapital * 0.95) / position.entry;
          const exitReason: BacktestTrade['exitReason'] = gain >= 0.12 ? 'target' : gain <= -0.05 ? 'stop' : 'timeout';
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100, exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // ADDITIONAL ELITE STRATEGIES
    // ═══════════════════════════════════════════════════════════════════

    if (strategy === 'triple_ema') {
      const ribbonBull = ema9[i] > ema21[i] && ema21[i] > ema55[i];
      const ribbonBullPrev = ema9[i - 1] <= ema21[i - 1] || ema21[i - 1] <= ema55[i - 1];
      if (!position && ribbonBull && ribbonBullPrev) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const ribbonBear = ema9[i] < ema21[i];
        const barsHeld = i - position.entryIdx;
        if (ribbonBear) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: ((close - position.entry) / position.entry) * 100,
            exitReason: 'signal_flip', holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    if (strategy === 'supertrend') {
      const atrMultiplier = 3;
      const lowerBand = (highs[i] + lows[i]) / 2 - atrMultiplier * (atr[i] || close * 0.02);
      const superTrendBull = close > lowerBand;
      const superTrendBullPrev = closes[i - 1] <= ((highs[i - 1] + lows[i - 1]) / 2 - atrMultiplier * (atr[i - 1] || closes[i - 1] * 0.02));
      if (!position && superTrendBull && superTrendBullPrev) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const superTrendBear = close < lowerBand;
        const barsHeld = i - position.entryIdx;
        if (superTrendBear) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: ((close - position.entry) / position.entry) * 100,
            exitReason: 'signal_flip', holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    if (strategy === 'volume_breakout') {
      const priceBreakout = close > Math.max(...highs.slice(Math.max(0, i - 10), i));
      const volumeBreakout = volumes[i] > (volSMA[i] || 0) * 2;
      if (!position && priceBreakout && volumeBreakout) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const volumeDry = volumes[i] < (volSMA[i] || 0) * 0.5;
        const barsHeld = i - position.entryIdx;
        if (gain >= 0.06 || gain <= -0.025 || volumeDry || barsHeld >= 15) {
          const shares = (initialCapital * 0.95) / position.entry;
          const exitReason: BacktestTrade['exitReason'] = gain >= 0.06 ? 'target' : gain <= -0.025 ? 'stop' : barsHeld >= 15 ? 'timeout' : 'signal_flip';
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100, exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    if (strategy === 'volume_climax_reversal') {
      const climaxVolume = volumes[i] > (volSMA[i] || 0) * 3;
      const bearishCandle = close < priceData[dates[i]].open;
      const longWick = (highs[i] - Math.max(close, priceData[dates[i]].open)) > Math.abs(close - priceData[dates[i]].open) * 2;
      const potentialReversal = climaxVolume && bearishCandle && longWick && rsi[i] < 35;
      if (!position && potentialReversal) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        if (gain >= 0.05 || gain <= -0.03 || barsHeld >= 10) {
          const shares = (initialCapital * 0.95) / position.entry;
          const exitReason: BacktestTrade['exitReason'] = gain >= 0.05 ? 'target' : gain <= -0.03 ? 'stop' : 'timeout';
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100, exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    if (strategy === 'williams_r') {
      const period = 14;
      const highestHigh = Math.max(...highs.slice(Math.max(0, i - period + 1), i + 1));
      const lowestLow = Math.min(...lows.slice(Math.max(0, i - period + 1), i + 1));
      const williamsR = ((highestHigh - close) / (highestHigh - lowestLow)) * -100;
      if (!position && williamsR < -80 && close > closes[i - 1]) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const williamsROverbought = williamsR > -20;
        const barsHeld = i - position.entryIdx;
        if (williamsROverbought || barsHeld >= 15) {
          const shares = (initialCapital * 0.95) / position.entry;
          const exitReason: BacktestTrade['exitReason'] = williamsROverbought ? 'signal_flip' : 'timeout';
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: ((close - position.entry) / position.entry) * 100,
            exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    if (strategy === 'macd_histogram_reversal' && macdData) {
      const { histogram } = macdData;
      const histReversalUp = histogram[i] > histogram[i - 1] && histogram[i - 1] < histogram[i - 2] && histogram[i] < 0;
      if (!position && histReversalUp) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const histPeaked = histogram[i] < histogram[i - 1] && histogram[i] > 0;
        const barsHeld = i - position.entryIdx;
        if (histPeaked || barsHeld >= 20) {
          const shares = (initialCapital * 0.95) / position.entry;
          const exitReason: BacktestTrade['exitReason'] = histPeaked ? 'signal_flip' : 'timeout';
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: ((close - position.entry) / position.entry) * 100,
            exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    if (strategy === 'rsi_divergence') {
      const priceLowerLow = lows[i] < Math.min(...lows.slice(Math.max(0, i - 10), i));
      const rsiHigherLow = rsi[i] > Math.min(...rsi.slice(Math.max(0, i - 10), i).filter(r => r !== undefined));
      const bullishDivergence = priceLowerLow && rsiHigherLow && rsi[i] < 40;
      if (!position && bullishDivergence) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        if (rsi[i] > 65 || gain <= -0.03 || barsHeld >= 15) {
          const shares = (initialCapital * 0.95) / position.entry;
          const exitReason: BacktestTrade['exitReason'] = rsi[i] > 65 ? 'signal_flip' : gain <= -0.03 ? 'stop' : 'timeout';
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100, exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    if (strategy === 'keltner_atr_breakout') {
      const keltnerMid = ema21[i];
      const keltnerUpper = keltnerMid + 2 * (atr[i] || close * 0.02);
      const breakoutUp = close > keltnerUpper && closes[i - 1] <= (ema21[i - 1] + 2 * (atr[i - 1] || closes[i - 1] * 0.02));
      if (!position && breakoutUp) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const backInsideChannel = close < ema21[i];
        const barsHeld = i - position.entryIdx;
        if (backInsideChannel || barsHeld >= 20) {
          const shares = (initialCapital * 0.95) / position.entry;
          const exitReason: BacktestTrade['exitReason'] = backInsideChannel ? 'signal_flip' : 'timeout';
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: ((close - position.entry) / position.entry) * 100,
            exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    if (strategy === 'multi_confluence_5' && macdData && bbands && adxData) {
      const emaBull = ema9[i] > ema21[i];
      const rsiBull = rsi[i] > 50 && rsi[i] < 70;
      const macdBull = macdData.histogram[i] > 0;
      const aboveBBMid = close > bbands.middle[i];
      const adxStrong = adxData.adx[i] > 25 && adxData.diPlus[i] > adxData.diMinus[i];
      const confluenceScore = [emaBull, rsiBull, macdBull, aboveBBMid, adxStrong].filter(Boolean).length;
      if (!position && confluenceScore >= 4) {
        position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const exitScore = [emaBull, rsiBull, macdBull, aboveBBMid, adxStrong].filter(Boolean).length;
        const barsHeld = i - position.entryIdx;
        if (exitScore <= 2 || barsHeld >= 25) {
          const shares = (initialCapital * 0.95) / position.entry;
          const exitReason: BacktestTrade['exitReason'] = exitScore <= 2 ? 'signal_flip' : 'timeout';
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: ((close - position.entry) / position.entry) * 100,
            exitReason, holdingPeriodDays: barsHeld + 1,
          });
          position = null;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // ICHIMOKU CLOUD
    // ═══════════════════════════════════════════════════════════════════

    if (strategy === 'ichimoku_cloud' && ichimokuData) {
      const { tenkan, kijun, senkouA, senkouB } = ichimokuData;
      const tenkanVal = tenkan[i];
      const kijunVal = kijun[i];
      const spanA = senkouA[i];
      const spanB = senkouB[i];

      if (!isNaN(tenkanVal) && !isNaN(kijunVal) && !isNaN(spanA) && !isNaN(spanB)) {
        const cloudTop = Math.max(spanA, spanB);
        const cloudBot = Math.min(spanA, spanB);
        const priceAboveCloud = close > cloudTop;
        const priceBelowCloud = close < cloudBot;
        const tkCrossBull = tenkanVal > kijunVal
          && !isNaN(tenkan[i - 1]) && !isNaN(kijun[i - 1])
          && tenkan[i - 1] <= kijun[i - 1];

        if (!position && tkCrossBull && priceAboveCloud) {
          position = { side: 'LONG', entry: close, entryDate: date, entryIdx: i };
        } else if (position) {
          const tkCrossBear = tenkanVal < kijunVal
            && !isNaN(tenkan[i - 1]) && !isNaN(kijun[i - 1])
            && tenkan[i - 1] >= kijun[i - 1];
          const barsHeld = i - position.entryIdx;
          if (tkCrossBear || priceBelowCloud || barsHeld >= 30) {
            const shares = (initialCapital * 0.95) / position.entry;
            const exitReason: BacktestTrade['exitReason'] = tkCrossBear ? 'signal_flip' : priceBelowCloud ? 'stop' : 'timeout';
            trades.push({
              entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
              entry: position.entry, exit: close,
              return: (close - position.entry) * shares,
              returnPercent: ((close - position.entry) / position.entry) * 100,
              exitReason, holdingPeriodDays: barsHeld + 1,
            });
            position = null;
          }
        }
      }
    }
  }

  // ── Close open position at end of data ─────────────────────────────────

  if (position) {
    const side = position.side;
    const lastIdx = dates.length - 1;
    const exitDate = dates[lastIdx];
    const exitPrice = closes[lastIdx];
    const barsHeld = lastIdx - position.entryIdx;
    const shares = (initialCapital * 0.95) / position.entry;
    trades.push({
      entryDate: position.entryDate, exitDate, symbol, side,
      entry: position.entry, exit: exitPrice,
      return: calcReturnDollars(side, position.entry, exitPrice, shares),
      returnPercent: calcReturnPercent(side, position.entry, exitPrice),
      exitReason: 'end_of_data', holdingPeriodDays: barsHeld + 1,
    });
    position = null;
  }

  const enrichedTrades = enrichTradesWithMetadata(trades, dates, highs, lows);
  return { trades: enrichedTrades, dates, closes };
}
