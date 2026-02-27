/**
 * Backtest Indicator Library
 *
 * All technical-indicator math lives here.
 * Every function is pure (no side-effects, no network) and deterministic.
 *
 * Key fixes applied during the 2026-02-27 audit:
 *   - RSI uses proper Wilder smoothing (prevAvgGain/Loss carried explicitly)
 *   - All indicators are precomputed once — never inside the per-bar loop
 */

// ─── EMA ──────────────────────────────────────────────────────────────────
export function calculateEMA(prices: number[], period: number): number[] {
  if (period <= 0 || prices.length === 0) return [];
  const ema: number[] = new Array(prices.length);
  const multiplier = 2 / (period + 1);

  // Seed: SMA of the first `period` values
  let sum = 0;
  for (let i = 0; i < period && i < prices.length; i++) {
    sum += prices[i];
  }
  if (prices.length < period) return ema; // not enough data
  ema[period - 1] = sum / period;

  for (let i = period; i < prices.length; i++) {
    ema[i] = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }
  return ema;
}

// ─── SMA ──────────────────────────────────────────────────────────────────
export function calculateSMA(prices: number[], period: number): number[] {
  if (period <= 0 || prices.length === 0) return [];
  const sma: number[] = new Array(prices.length);

  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += prices[i - j];
    }
    sma[i] = sum / period;
  }
  return sma;
}

// ─── RSI (Wilder smoothing — correct implementation) ──────────────────────
/**
 * Standard RSI using Wilder's smoothed moving average:
 *
 *   1. Initial average gain/loss = simple average over first `period` changes
 *   2. Subsequent bars:
 *        avgGain = (prevAvgGain * (period-1) + currentGain) / period
 *        avgLoss = (prevAvgLoss * (period-1) + currentLoss) / period
 *   3. RS  = avgGain / avgLoss
 *   4. RSI = 100 - 100 / (1 + RS)
 *
 * Returns array same length as `prices`; indices before warmup are undefined.
 */
export function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = new Array(prices.length);
  if (prices.length <= period) return rsi;

  // 1) Accumulate initial gains & losses
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gainSum += change;
    else lossSum += Math.abs(change);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  // First RSI value
  const rs0 = avgGain / (avgLoss || 1e-10);
  rsi[period] = 100 - 100 / (1 + rs0);

  // 2) Wilder smoothing for all subsequent bars
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgGain / (avgLoss || 1e-10);
    rsi[i] = 100 - 100 / (1 + rs);
  }

  return rsi;
}

// ─── MACD ─────────────────────────────────────────────────────────────────
export interface MACDResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function calculateMACD(prices: number[]): MACDResult {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd: number[] = new Array(prices.length);

  for (let i = 0; i < prices.length; i++) {
    if (ema12[i] !== undefined && ema26[i] !== undefined) {
      macd[i] = ema12[i] - ema26[i];
    }
  }

  // Signal line = EMA-9 of the defined MACD values
  const macdValues = macd.filter((v) => v !== undefined);
  const signal = calculateEMA(macdValues, 9);
  const histogram: number[] = new Array(prices.length);

  // Map signal values back to original indices.
  // signalIdx tracks position in the dense macdValues/signal array and
  // MUST advance on every defined macd value, even when signal is still
  // in its warmup period, so that the indices stay aligned.
  let signalIdx = 0;
  for (let i = 0; i < macd.length; i++) {
    if (macd[i] !== undefined) {
      if (signal[signalIdx] !== undefined) {
        histogram[i] = macd[i] - signal[signalIdx];
      }
      signalIdx++;
    }
  }

  return { macd, signal, histogram };
}

// ─── ATR ──────────────────────────────────────────────────────────────────
export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14,
): number[] {
  const atr: number[] = new Array(closes.length);
  const tr: number[] = new Array(closes.length);

  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  let sum = 0;
  for (let i = 1; i <= period && i < closes.length; i++) {
    sum += tr[i] || 0;
  }
  if (closes.length > period) {
    atr[period] = sum / period;
  }

  for (let i = period + 1; i < closes.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }

  return atr;
}

// ─── ADX ──────────────────────────────────────────────────────────────────
export interface ADXResult {
  adx: number[];
  diPlus: number[];
  diMinus: number[];
}

export function calculateADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14,
): ADXResult {
  const adx: number[] = new Array(closes.length);
  const diPlus: number[] = new Array(closes.length);
  const diMinus: number[] = new Array(closes.length);
  const tr: number[] = new Array(closes.length);
  const dmPlus: number[] = new Array(closes.length);
  const dmMinus: number[] = new Array(closes.length);

  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);

    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];

    dmPlus[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    dmMinus[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  let smoothedTR = 0;
  let smoothedDMPlus = 0;
  let smoothedDMMinus = 0;

  for (let i = 1; i <= period; i++) {
    smoothedTR += tr[i] || 0;
    smoothedDMPlus += dmPlus[i] || 0;
    smoothedDMMinus += dmMinus[i] || 0;
  }

  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      smoothedTR = smoothedTR - smoothedTR / period + (tr[i] || 0);
      smoothedDMPlus = smoothedDMPlus - smoothedDMPlus / period + (dmPlus[i] || 0);
      smoothedDMMinus = smoothedDMMinus - smoothedDMMinus / period + (dmMinus[i] || 0);
    }

    diPlus[i] = smoothedTR > 0 ? (smoothedDMPlus / smoothedTR) * 100 : 0;
    diMinus[i] = smoothedTR > 0 ? (smoothedDMMinus / smoothedTR) * 100 : 0;

    const diDiff = Math.abs(diPlus[i] - diMinus[i]);
    const diSum = diPlus[i] + diMinus[i];
    const dx = diSum > 0 ? (diDiff / diSum) * 100 : 0;

    if (i === period) {
      adx[i] = dx;
    } else if (adx[i - 1] !== undefined) {
      adx[i] = (adx[i - 1] * (period - 1) + dx) / period;
    }
  }

  return { adx, diPlus, diMinus };
}

// ─── Bollinger Bands ──────────────────────────────────────────────────────
export interface BollingerBandsResult {
  upper: number[];
  middle: number[];
  lower: number[];
}

export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2,
): BollingerBandsResult {
  const bands: BollingerBandsResult = {
    upper: new Array(prices.length),
    middle: new Array(prices.length),
    lower: new Array(prices.length),
  };

  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / period;
    const variance =
      slice.reduce((sum, val) => sum + (val - avg) ** 2, 0) / period;
    const std = Math.sqrt(variance);

    bands.middle[i] = avg;
    bands.upper[i] = avg + stdDev * std;
    bands.lower[i] = avg - stdDev * std;
  }

  return bands;
}

// ─── Stochastic Oscillator ────────────────────────────────────────────────
export interface StochasticResult {
  k: number[];
  d: number[];
}

export function calculateStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod: number = 14,
  dPeriod: number = 3,
): StochasticResult {
  const k: number[] = new Array(closes.length);
  const d: number[] = new Array(closes.length);

  for (let i = kPeriod - 1; i < closes.length; i++) {
    const highSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);

    k[i] =
      highestHigh - lowestLow > 0
        ? ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100
        : 50;
  }

  for (let i = kPeriod - 1 + dPeriod - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = 0; j < dPeriod; j++) {
      sum += k[i - j] || 0;
    }
    d[i] = sum / dPeriod;
  }

  return { k, d };
}

// ─── CCI ──────────────────────────────────────────────────────────────────
export function calculateCCI(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 20,
): number[] {
  const cci: number[] = new Array(closes.length);
  const tp: number[] = new Array(closes.length);

  for (let i = 0; i < closes.length; i++) {
    tp[i] = (highs[i] + lows[i] + closes[i]) / 3;
  }

  for (let i = period - 1; i < closes.length; i++) {
    const tpSlice = tp.slice(i - period + 1, i + 1);
    const sma = tpSlice.reduce((a, b) => a + b, 0) / period;
    const meanDev =
      tpSlice.reduce((sum, val) => sum + Math.abs(val - sma), 0) / period;

    cci[i] = meanDev > 0 ? (tp[i] - sma) / (0.015 * meanDev) : 0;
  }

  return cci;
}

// ─── OBV ──────────────────────────────────────────────────────────────────
export function calculateOBV(closes: number[], volumes: number[]): number[] {
  const obv: number[] = [0];

  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      obv[i] = obv[i - 1] + volumes[i];
    } else if (closes[i] < closes[i - 1]) {
      obv[i] = obv[i - 1] - volumes[i];
    } else {
      obv[i] = obv[i - 1];
    }
  }

  return obv;
}
