/**
 * Local Technical Indicator Calculations
 * 
 * Computes indicators from OHLCV data locally instead of making separate API calls.
 * This reduces Alpha Vantage calls from ~10 per symbol to 1 (just OHLCV).
 * 
 * All functions expect arrays sorted from oldest to newest (chronological order).
 */

export interface OHLCVBar {
  timestamp: string | Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorResult {
  rsi14?: number;
  macdLine?: number;
  macdSignal?: number;
  macdHist?: number;
  ema9?: number;
  ema20?: number;
  ema50?: number;
  ema200?: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  atr14?: number;
  adx14?: number;
  plusDI?: number;
  minusDI?: number;
  stochK?: number;
  stochD?: number;
  cci20?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  obv?: number;
  vwap?: number;
  vwapIntraday?: number;
  atrPercent14?: number;
  bbWidthPercent20?: number;
}

export interface IndicatorWarmupStatus {
  timeframe: string;
  barCount: number;
  estimatedCoverageDays: number | null;
  ready: {
    rsi14: boolean;
    macd: boolean;
    atr14: boolean;
    adx14: boolean;
    ema200: boolean;
    sma200: boolean;
    bb20: boolean;
    squeeze: boolean;
  };
  coreReady: boolean;
  missingIndicators: string[];
}

const INDICATOR_MIN_BARS = {
  rsi14: 15,
  macd: 35,
  atr14: 15,
  adx14: 29,
  ema200: 200,
  sma200: 200,
  bb20: 20,
  squeeze: 34,
} as const;

function estimateCoverageDays(timeframe: string, barCount: number): number | null {
  const tf = timeframe.toLowerCase();
  if (tf === 'daily') return barCount;
  if (tf === 'weekly') return barCount * 7;
  if (tf === 'monthly') return barCount * 30;

  const minuteMap: Record<string, number> = {
    '1min': 1,
    '5min': 5,
    '15min': 15,
    '30min': 30,
    '60min': 60,
  };

  const intervalMins = minuteMap[tf];
  if (!intervalMins) return null;

  const barsPerTradingDay = Math.max(1, Math.floor(390 / intervalMins));
  return Math.round((barCount / barsPerTradingDay) * 10) / 10;
}

/**
 * Determine whether there is enough history for stable indicator computation.
 */
export function getIndicatorWarmupStatus(barCount: number, timeframe: string = 'daily'): IndicatorWarmupStatus {
  const ready = {
    rsi14: barCount >= INDICATOR_MIN_BARS.rsi14,
    macd: barCount >= INDICATOR_MIN_BARS.macd,
    atr14: barCount >= INDICATOR_MIN_BARS.atr14,
    adx14: barCount >= INDICATOR_MIN_BARS.adx14,
    ema200: barCount >= INDICATOR_MIN_BARS.ema200,
    sma200: barCount >= INDICATOR_MIN_BARS.sma200,
    bb20: barCount >= INDICATOR_MIN_BARS.bb20,
    squeeze: barCount >= INDICATOR_MIN_BARS.squeeze,
  };

  const coreReady = ready.rsi14 && ready.macd && ready.atr14 && ready.adx14 && ready.bb20 && ready.squeeze;

  const missingIndicators = Object.entries(ready)
    .filter(([, isReady]) => !isReady)
    .map(([name]) => name);

  return {
    timeframe,
    barCount,
    estimatedCoverageDays: estimateCoverageDays(timeframe, barCount),
    ready,
    coreReady,
    missingIndicators,
  };
}

/**
 * Calculate Simple Moving Average (SMA)
 */
export function sma(data: number[], period: number): number | null {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * Uses the standard formula: EMA = price * k + EMA(prev) * (1-k)
 * where k = 2 / (period + 1)
 */
export function ema(data: number[], period: number): number | null {
  if (data.length < period) return null;
  
  const k = 2 / (period + 1);
  
  // Start with SMA for first EMA value
  let emaValue = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  // Calculate EMA for remaining values
  for (let i = period; i < data.length; i++) {
    emaValue = data[i] * k + emaValue * (1 - k);
  }
  
  return emaValue;
}

/**
 * Calculate full EMA series aligned to input length.
 * Values prior to first valid EMA are NaN.
 */
export function emaSeries(data: number[], period: number): number[] {
  const output = Array(data.length).fill(Number.NaN);
  if (data.length < period) return output;

  const k = 2 / (period + 1);
  let emaValue = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  output[period - 1] = emaValue;

  for (let i = period; i < data.length; i++) {
    emaValue = data[i] * k + emaValue * (1 - k);
    output[i] = emaValue;
  }

  return output;
}

/**
 * Calculate RSI (Relative Strength Index)
 * Standard 14-period RSI
 */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (const change of changes) {
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Initial average gain/loss (SMA)
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  // Smoothed average (Wilder's smoothing)
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * Standard: 12-period EMA, 26-period EMA, 9-period signal
 */
export function macd(closes: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): { line: number; signal: number; histogram: number } | null {
  if (closes.length < slowPeriod + signalPeriod) return null;

  const fast = emaSeries(closes, fastPeriod);
  const slow = emaSeries(closes, slowPeriod);

  const macdSeries = closes.map((_, index) => (
    Number.isFinite(fast[index]) && Number.isFinite(slow[index])
      ? fast[index] - slow[index]
      : Number.NaN
  ));

  const validMacdSeries = macdSeries.filter(Number.isFinite);
  if (validMacdSeries.length < signalPeriod) return null;

  const signalSeries = emaSeries(validMacdSeries, signalPeriod);
  const signalLine = signalSeries[signalSeries.length - 1];
  const macdLine = validMacdSeries[validMacdSeries.length - 1];

  if (!Number.isFinite(signalLine)) return null;
  
  return {
    line: macdLine,
    signal: signalLine,
    histogram: macdLine - signalLine,
  };
}

/**
 * Calculate ATR (Average True Range)
 */
export function atr(bars: OHLCVBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  
  const trueRanges: number[] = [];
  
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  // Use Wilder's smoothing (similar to RSI smoothing)
  let atrValue = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < trueRanges.length; i++) {
    atrValue = (atrValue * (period - 1) + trueRanges[i]) / period;
  }
  
  return atrValue;
}

/**
 * Calculate ADX (Average Directional Index) with +DI and -DI
 */
export function adx(bars: OHLCVBar[], period = 14): { adx: number; plusDI: number; minusDI: number } | null {
  if (bars.length < period * 2 + 1) return null;
  
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];
  const trueRanges: number[] = [];
  
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevHigh = bars[i - 1].high;
    const prevLow = bars[i - 1].low;
    const prevClose = bars[i - 1].close;
    
    // True Range
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
    
    // Directional Movement
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  // Smoothed values using Wilder's smoothing
  let smoothedTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  
  const dxValues: number[] = [];
  
  for (let i = period; i < trueRanges.length; i++) {
    smoothedTR = smoothedTR - (smoothedTR / period) + trueRanges[i];
    smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDMs[i];
    smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDMs[i];
    
    const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;
    
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
    dxValues.push(dx);
  }
  
  if (dxValues.length < period) return null;
  
  // ADX is smoothed DX
  let adxValue = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adxValue = (adxValue * (period - 1) + dxValues[i]) / period;
  }
  
  // Calculate final +DI and -DI
  const finalPlusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
  const finalMinusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;
  
  return {
    adx: adxValue,
    plusDI: finalPlusDI,
    minusDI: finalMinusDI,
  };
}

/**
 * Calculate Stochastic Oscillator
 */
export function stochastic(bars: OHLCVBar[], kPeriod = 14, dPeriod = 3): { k: number; d: number } | null {
  if (bars.length < kPeriod + dPeriod - 1) return null;
  
  const kValues: number[] = [];
  
  for (let i = kPeriod - 1; i < bars.length; i++) {
    const slice = bars.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...slice.map(b => b.high));
    const lowestLow = Math.min(...slice.map(b => b.low));
    const currentClose = bars[i].close;
    
    const k = highestHigh !== lowestLow 
      ? ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100 
      : 50;
    kValues.push(k);
  }
  
  if (kValues.length < dPeriod) return null;
  
  const k = kValues[kValues.length - 1];
  const d = sma(kValues, dPeriod);
  
  return { k, d: d ?? k };
}

/**
 * Calculate CCI (Commodity Channel Index)
 */
export function cci(bars: OHLCVBar[], period = 20): number | null {
  if (bars.length < period) return null;
  
  const typicalPrices = bars.map(b => (b.high + b.low + b.close) / 3);
  const recentTP = typicalPrices.slice(-period);
  
  const smaTP = recentTP.reduce((a, b) => a + b, 0) / period;
  const meanDeviation = recentTP.reduce((acc, tp) => acc + Math.abs(tp - smaTP), 0) / period;
  
  if (meanDeviation === 0) return 0;
  
  const currentTP = typicalPrices[typicalPrices.length - 1];
  return (currentTP - smaTP) / (0.015 * meanDeviation);
}

/**
 * Calculate Bollinger Bands
 */
export function bollingerBands(closes: number[], period = 20, stdDevMult = 2): { upper: number; middle: number; lower: number } | null {
  if (closes.length < period) return null;
  
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  
  const variance = slice.reduce((acc, val) => acc + Math.pow(val - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  
  return {
    upper: middle + stdDevMult * stdDev,
    middle,
    lower: middle - stdDevMult * stdDev,
  };
}

/**
 * Calculate On-Balance Volume (OBV)
 */
export function obv(bars: OHLCVBar[]): number | null {
  if (bars.length < 2) return null;
  
  let obvValue = 0;
  
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) {
      obvValue += bars[i].volume;
    } else if (bars[i].close < bars[i - 1].close) {
      obvValue -= bars[i].volume;
    }
    // If close equals previous close, OBV stays the same
  }
  
  return obvValue;
}

/**
 * Calculate rolling VWAP over all provided bars.
 */
export function rollingVwap(bars: OHLCVBar[]): number | null {
  if (bars.length < 1) return null;
  
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativeTPV += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;
  }
  
  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : null;
}

/**
 * Calculate intraday VWAP for the latest session date in the provided bars.
 */
export function vwapIntraday(bars: OHLCVBar[]): number | null {
  if (!bars.length) return null;

  const lastDay = new Date(bars[bars.length - 1].timestamp).toDateString();
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (let i = bars.length - 1; i >= 0; i--) {
    const currentDay = new Date(bars[i].timestamp).toDateString();
    if (currentDay !== lastDay) break;

    const typicalPrice = (bars[i].high + bars[i].low + bars[i].close) / 3;
    cumulativeTPV += typicalPrice * bars[i].volume;
    cumulativeVolume += bars[i].volume;
  }

  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : null;
}

/**
 * Backward-compatible alias for rolling VWAP.
 */
export function vwap(bars: OHLCVBar[]): number | null {
  return rollingVwap(bars);
}

/**
 * Calculate ATR as percentage of latest close.
 */
export function atrPercent(bars: OHLCVBar[], period = 14): number | null {
  const atrValue = atr(bars, period);
  const lastClose = bars[bars.length - 1]?.close;
  if (atrValue === null || !lastClose) return null;
  return (atrValue / lastClose) * 100;
}

/**
 * Calculate Bollinger Band width as percentage of middle band.
 */
export function bbWidthPercent(closes: number[], period = 20, stdDevMult = 2): number | null {
  const bands = bollingerBands(closes, period, stdDevMult);
  if (!bands || bands.middle === 0) return null;
  return ((bands.upper - bands.lower) / bands.middle) * 100;
}

/**
 * Calculate all indicators from OHLCV data
 * This is the main function used by the worker to compute everything at once
 */
export function calculateAllIndicators(bars: OHLCVBar[]): IndicatorResult {
  if (bars.length === 0) return {};
  
  const closes = bars.map(b => b.close);
  
  const result: IndicatorResult = {};
  
  // RSI
  const rsiValue = rsi(closes, 14);
  if (rsiValue !== null) result.rsi14 = Math.round(rsiValue * 100) / 100;
  
  // MACD
  const macdResult = macd(closes, 12, 26, 9);
  if (macdResult) {
    result.macdLine = Math.round(macdResult.line * 10000) / 10000;
    result.macdSignal = Math.round(macdResult.signal * 10000) / 10000;
    result.macdHist = Math.round(macdResult.histogram * 10000) / 10000;
  }
  
  // EMAs
  const ema9Value = ema(closes, 9);
  const ema20Value = ema(closes, 20);
  const ema50Value = ema(closes, 50);
  const ema200Value = ema(closes, 200);
  if (ema9Value !== null) result.ema9 = Math.round(ema9Value * 100) / 100;
  if (ema20Value !== null) result.ema20 = Math.round(ema20Value * 100) / 100;
  if (ema50Value !== null) result.ema50 = Math.round(ema50Value * 100) / 100;
  if (ema200Value !== null) result.ema200 = Math.round(ema200Value * 100) / 100;
  
  // SMAs
  const sma20Value = sma(closes, 20);
  const sma50Value = sma(closes, 50);
  const sma200Value = sma(closes, 200);
  if (sma20Value !== null) result.sma20 = Math.round(sma20Value * 100) / 100;
  if (sma50Value !== null) result.sma50 = Math.round(sma50Value * 100) / 100;
  if (sma200Value !== null) result.sma200 = Math.round(sma200Value * 100) / 100;
  
  // ATR
  const atrValue = atr(bars, 14);
  if (atrValue !== null) result.atr14 = Math.round(atrValue * 100) / 100;
  
  // ADX
  const adxResult = adx(bars, 14);
  if (adxResult) {
    result.adx14 = Math.round(adxResult.adx * 100) / 100;
    result.plusDI = Math.round(adxResult.plusDI * 100) / 100;
    result.minusDI = Math.round(adxResult.minusDI * 100) / 100;
  }
  
  // Stochastic
  const stochResult = stochastic(bars, 14, 3);
  if (stochResult) {
    result.stochK = Math.round(stochResult.k * 100) / 100;
    result.stochD = Math.round(stochResult.d * 100) / 100;
  }
  
  // CCI
  const cciValue = cci(bars, 20);
  if (cciValue !== null) result.cci20 = Math.round(cciValue * 100) / 100;
  
  // Bollinger Bands
  const bbResult = bollingerBands(closes, 20, 2);
  if (bbResult) {
    result.bbUpper = Math.round(bbResult.upper * 100) / 100;
    result.bbMiddle = Math.round(bbResult.middle * 100) / 100;
    result.bbLower = Math.round(bbResult.lower * 100) / 100;
  }

  const bbWidthPercentValue = bbWidthPercent(closes, 20, 2);
  if (bbWidthPercentValue !== null) result.bbWidthPercent20 = Math.round(bbWidthPercentValue * 100) / 100;
  
  // OBV
  const obvValue = obv(bars);
  if (obvValue !== null) result.obv = obvValue;
  
  // VWAP
  const vwapValue = rollingVwap(bars);
  if (vwapValue !== null) result.vwap = Math.round(vwapValue * 100) / 100;

  const vwapIntradayValue = vwapIntraday(bars);
  if (vwapIntradayValue !== null) result.vwapIntraday = Math.round(vwapIntradayValue * 100) / 100;

  const atrPercentValue = atrPercent(bars, 14);
  if (atrPercentValue !== null) result.atrPercent14 = Math.round(atrPercentValue * 100) / 100;
  
  return result;
}

/**
 * Detect squeeze conditions (Bollinger Bands inside Keltner Channels)
 */
export function detectSqueeze(bars: OHLCVBar[], bbPeriod = 20, kcPeriod = 20, kcMult = 1.5): {
  inSqueeze: boolean;
  squeezeStrength: number; // 0-100
} | null {
  if (bars.length < Math.max(bbPeriod, kcPeriod) + 14) return null;
  
  const closes = bars.map(b => b.close);
  
  // Bollinger Bands
  const bb = bollingerBands(closes, bbPeriod, 2);
  if (!bb) return null;
  
  // Keltner Channel (EMA + ATR)
  const kcMiddle = ema(closes, kcPeriod);
  const kcAtr = atr(bars, kcPeriod);
  if (kcMiddle === null || kcAtr === null) return null;
  
  const kcUpper = kcMiddle + kcMult * kcAtr;
  const kcLower = kcMiddle - kcMult * kcAtr;
  
  // Squeeze: BB inside KC
  const inSqueeze = bb.lower > kcLower && bb.upper < kcUpper;
  
  // Squeeze strength: how tight (0 = loose, 100 = very tight)
  const bbWidth = bb.upper - bb.lower;
  const kcWidth = kcUpper - kcLower;
  if (kcWidth <= 0) return { inSqueeze: false, squeezeStrength: 0 };
  const squeezeStrength = inSqueeze 
    ? Math.min(100, Math.round((1 - bbWidth / kcWidth) * 100))
    : 0;
  
  return { inSqueeze, squeezeStrength };
}
