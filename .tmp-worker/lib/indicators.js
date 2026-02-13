"use strict";
/**
 * Local Technical Indicator Calculations
 *
 * Computes indicators from OHLCV data locally instead of making separate API calls.
 * This reduces Alpha Vantage calls from ~10 per symbol to 1 (just OHLCV).
 *
 * All functions expect arrays sorted from oldest to newest (chronological order).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sma = sma;
exports.ema = ema;
exports.rsi = rsi;
exports.macd = macd;
exports.atr = atr;
exports.adx = adx;
exports.stochastic = stochastic;
exports.cci = cci;
exports.bollingerBands = bollingerBands;
exports.obv = obv;
exports.vwap = vwap;
exports.calculateAllIndicators = calculateAllIndicators;
exports.detectSqueeze = detectSqueeze;
/**
 * Calculate Simple Moving Average (SMA)
 */
function sma(data, period) {
    if (data.length < period)
        return null;
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
}
/**
 * Calculate Exponential Moving Average (EMA)
 * Uses the standard formula: EMA = price * k + EMA(prev) * (1-k)
 * where k = 2 / (period + 1)
 */
function ema(data, period) {
    if (data.length < period)
        return null;
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
 * Calculate RSI (Relative Strength Index)
 * Standard 14-period RSI
 */
function rsi(closes, period = 14) {
    if (closes.length < period + 1)
        return null;
    const changes = [];
    for (let i = 1; i < closes.length; i++) {
        changes.push(closes[i] - closes[i - 1]);
    }
    const gains = [];
    const losses = [];
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
    if (avgLoss === 0)
        return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}
/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * Standard: 12-period EMA, 26-period EMA, 9-period signal
 */
function macd(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (closes.length < slowPeriod + signalPeriod)
        return null;
    // Calculate MACD line history for signal calculation
    const macdHistory = [];
    for (let i = slowPeriod - 1; i < closes.length; i++) {
        const slice = closes.slice(0, i + 1);
        const fastEma = ema(slice, fastPeriod);
        const slowEma = ema(slice, slowPeriod);
        if (fastEma !== null && slowEma !== null) {
            macdHistory.push(fastEma - slowEma);
        }
    }
    if (macdHistory.length < signalPeriod)
        return null;
    const macdLine = macdHistory[macdHistory.length - 1];
    const signalLine = ema(macdHistory, signalPeriod);
    if (signalLine === null)
        return null;
    return {
        line: macdLine,
        signal: signalLine,
        histogram: macdLine - signalLine,
    };
}
/**
 * Calculate ATR (Average True Range)
 */
function atr(bars, period = 14) {
    if (bars.length < period + 1)
        return null;
    const trueRanges = [];
    for (let i = 1; i < bars.length; i++) {
        const high = bars[i].high;
        const low = bars[i].low;
        const prevClose = bars[i - 1].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
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
function adx(bars, period = 14) {
    if (bars.length < period * 2)
        return null;
    const plusDMs = [];
    const minusDMs = [];
    const trueRanges = [];
    for (let i = 1; i < bars.length; i++) {
        const high = bars[i].high;
        const low = bars[i].low;
        const prevHigh = bars[i - 1].high;
        const prevLow = bars[i - 1].low;
        const prevClose = bars[i - 1].close;
        // True Range
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
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
    const dxValues = [];
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
    if (dxValues.length < period)
        return null;
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
function stochastic(bars, kPeriod = 14, dPeriod = 3) {
    if (bars.length < kPeriod + dPeriod - 1)
        return null;
    const kValues = [];
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
    if (kValues.length < dPeriod)
        return null;
    const k = kValues[kValues.length - 1];
    const d = sma(kValues, dPeriod);
    return { k, d: d ?? k };
}
/**
 * Calculate CCI (Commodity Channel Index)
 */
function cci(bars, period = 20) {
    if (bars.length < period)
        return null;
    const typicalPrices = bars.map(b => (b.high + b.low + b.close) / 3);
    const recentTP = typicalPrices.slice(-period);
    const smaTP = recentTP.reduce((a, b) => a + b, 0) / period;
    const meanDeviation = recentTP.reduce((acc, tp) => acc + Math.abs(tp - smaTP), 0) / period;
    if (meanDeviation === 0)
        return 0;
    const currentTP = typicalPrices[typicalPrices.length - 1];
    return (currentTP - smaTP) / (0.015 * meanDeviation);
}
/**
 * Calculate Bollinger Bands
 */
function bollingerBands(closes, period = 20, stdDevMult = 2) {
    if (closes.length < period)
        return null;
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
function obv(bars) {
    if (bars.length < 2)
        return null;
    let obvValue = 0;
    for (let i = 1; i < bars.length; i++) {
        if (bars[i].close > bars[i - 1].close) {
            obvValue += bars[i].volume;
        }
        else if (bars[i].close < bars[i - 1].close) {
            obvValue -= bars[i].volume;
        }
        // If close equals previous close, OBV stays the same
    }
    return obvValue;
}
/**
 * Calculate VWAP (Volume Weighted Average Price)
 * Note: VWAP is typically calculated intraday from market open
 */
function vwap(bars) {
    if (bars.length < 1)
        return null;
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
 * Calculate all indicators from OHLCV data
 * This is the main function used by the worker to compute everything at once
 */
function calculateAllIndicators(bars) {
    if (bars.length === 0)
        return {};
    const closes = bars.map(b => b.close);
    const result = {};
    // RSI
    const rsiValue = rsi(closes, 14);
    if (rsiValue !== null)
        result.rsi14 = Math.round(rsiValue * 100) / 100;
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
    if (ema9Value !== null)
        result.ema9 = Math.round(ema9Value * 100) / 100;
    if (ema20Value !== null)
        result.ema20 = Math.round(ema20Value * 100) / 100;
    if (ema50Value !== null)
        result.ema50 = Math.round(ema50Value * 100) / 100;
    if (ema200Value !== null)
        result.ema200 = Math.round(ema200Value * 100) / 100;
    // SMAs
    const sma20Value = sma(closes, 20);
    const sma50Value = sma(closes, 50);
    const sma200Value = sma(closes, 200);
    if (sma20Value !== null)
        result.sma20 = Math.round(sma20Value * 100) / 100;
    if (sma50Value !== null)
        result.sma50 = Math.round(sma50Value * 100) / 100;
    if (sma200Value !== null)
        result.sma200 = Math.round(sma200Value * 100) / 100;
    // ATR
    const atrValue = atr(bars, 14);
    if (atrValue !== null)
        result.atr14 = Math.round(atrValue * 100) / 100;
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
    if (cciValue !== null)
        result.cci20 = Math.round(cciValue * 100) / 100;
    // Bollinger Bands
    const bbResult = bollingerBands(closes, 20, 2);
    if (bbResult) {
        result.bbUpper = Math.round(bbResult.upper * 100) / 100;
        result.bbMiddle = Math.round(bbResult.middle * 100) / 100;
        result.bbLower = Math.round(bbResult.lower * 100) / 100;
    }
    // OBV
    const obvValue = obv(bars);
    if (obvValue !== null)
        result.obv = obvValue;
    // VWAP
    const vwapValue = vwap(bars);
    if (vwapValue !== null)
        result.vwap = Math.round(vwapValue * 100) / 100;
    return result;
}
/**
 * Detect squeeze conditions (Bollinger Bands inside Keltner Channels)
 */
function detectSqueeze(bars, bbPeriod = 20, kcPeriod = 20, kcMult = 1.5) {
    if (bars.length < Math.max(bbPeriod, kcPeriod) + 14)
        return null;
    const closes = bars.map(b => b.close);
    // Bollinger Bands
    const bb = bollingerBands(closes, bbPeriod, 2);
    if (!bb)
        return null;
    // Keltner Channel (EMA + ATR)
    const kcMiddle = ema(closes, kcPeriod);
    const kcAtr = atr(bars, kcPeriod);
    if (kcMiddle === null || kcAtr === null)
        return null;
    const kcUpper = kcMiddle + kcMult * kcAtr;
    const kcLower = kcMiddle - kcMult * kcAtr;
    // Squeeze: BB inside KC
    const inSqueeze = bb.lower > kcLower && bb.upper < kcUpper;
    // Squeeze strength: how tight (0 = loose, 100 = very tight)
    const bbWidth = bb.upper - bb.lower;
    const kcWidth = kcUpper - kcLower;
    const squeezeStrength = inSqueeze
        ? Math.min(100, Math.round((1 - bbWidth / kcWidth) * 100))
        : 0;
    return { inSqueeze, squeezeStrength };
}
