/**
 * Scanner Indicator Library
 *
 * Shared technical-indicator calculations used by scanner/bulk and scan-universe.
 * Series-returning SMA/EMA with Wilder-smoothed RSI, proper MACD, and
 * OHLCV-struct-based oscillators (Stochastic, ADX, Aroon, CCI).
 *
 * Created to eliminate ~200 LOC of identical indicator code duplicated
 * across scanner routes.
 */

// ─── OHLCV Type ─────────────────────────────────────────────────────────────

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── SMA (series) ───────────────────────────────────────────────────────────

export function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

// ─── EMA (series) ───────────────────────────────────────────────────────────

export function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else if (i === period - 1) {
      result.push(ema);
    } else {
      ema = (data[i] - ema) * multiplier + ema;
      result.push(ema);
    }
  }
  return result;
}

// ─── RSI (Wilder smoothing, scalar return) ──────────────────────────────────

export function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return NaN;

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  let avgGain = 0, avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    if (changes[i] > 0) {
      avgGain = (avgGain * (period - 1) + changes[i]) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(changes[i])) / period;
    }
  }

  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

// ─── MACD (scalar return) ───────────────────────────────────────────────────

export function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(ema12[i]) || isNaN(ema26[i])) macdLine.push(NaN);
    else macdLine.push(ema12[i] - ema26[i]);
  }

  const validMacd = macdLine.filter(v => !isNaN(v));
  if (validMacd.length < 9) return { macd: NaN, signal: NaN, histogram: NaN };

  const signalLine = calculateEMA(validMacd, 9);
  const macd = validMacd[validMacd.length - 1];
  const signal = signalLine[signalLine.length - 1];

  return { macd, signal, histogram: macd - signal };
}

// ─── ADX ────────────────────────────────────────────────────────────────────

export function calculateADX(ohlcv: OHLCV[], period: number = 14): number {
  if (ohlcv.length < period * 2) return NaN;

  const tr: number[] = [], dmPlus: number[] = [], dmMinus: number[] = [];

  for (let i = 1; i < ohlcv.length; i++) {
    const { high, low } = ohlcv[i];
    const { high: prevHigh, low: prevLow, close: prevClose } = ohlcv[i - 1];

    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));

    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0);
    dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const smoothTR = calculateEMA(tr, period);
  const smoothDMPlus = calculateEMA(dmPlus, period);
  const smoothDMMinus = calculateEMA(dmMinus, period);

  const dx: number[] = [];
  for (let i = 0; i < smoothTR.length; i++) {
    if (smoothTR[i] === 0 || isNaN(smoothTR[i])) {
      dx.push(0);
    } else {
      const dip = (smoothDMPlus[i] / smoothTR[i]) * 100;
      const dim = (smoothDMMinus[i] / smoothTR[i]) * 100;
      const diSum = dip + dim;
      dx.push(diSum === 0 ? 0 : (Math.abs(dip - dim) / diSum) * 100);
    }
  }

  const adx = calculateEMA(dx.filter(v => !isNaN(v)), period);
  const result = adx.length > 0 ? adx[adx.length - 1] : NaN;
  return Number.isFinite(result) ? Math.min(100, Math.max(0, result)) : NaN;
}

// ─── Stochastic ─────────────────────────────────────────────────────────────

export function calculateStochastic(ohlcv: OHLCV[], period: number = 14, smoothK: number = 3): { k: number; d: number } {
  if (ohlcv.length < period + smoothK) return { k: NaN, d: NaN };

  const rawK: number[] = [];
  for (let i = period - 1; i < ohlcv.length; i++) {
    const slice = ohlcv.slice(i - period + 1, i + 1);
    const high = Math.max(...slice.map(d => d.high));
    const low = Math.min(...slice.map(d => d.low));
    const close = ohlcv[i].close;
    rawK.push(high === low ? 50 : ((close - low) / (high - low)) * 100);
  }

  const kSmoothed = calculateSMA(rawK, smoothK);
  const d = calculateSMA(kSmoothed.filter(v => !isNaN(v)), 3);

  return {
    k: kSmoothed[kSmoothed.length - 1] || NaN,
    d: d[d.length - 1] || NaN,
  };
}

// ─── Aroon ──────────────────────────────────────────────────────────────────

export function calculateAroon(ohlcv: OHLCV[], period: number = 25): { up: number; down: number } {
  if (ohlcv.length < period) return { up: NaN, down: NaN };

  const slice = ohlcv.slice(-period);
  let highestIdx = 0, lowestIdx = 0;
  let highestVal = slice[0].high, lowestVal = slice[0].low;

  for (let i = 1; i < slice.length; i++) {
    if (slice[i].high >= highestVal) { highestVal = slice[i].high; highestIdx = i; }
    if (slice[i].low <= lowestVal) { lowestVal = slice[i].low; lowestIdx = i; }
  }

  return {
    up: ((period - (period - 1 - highestIdx)) / period) * 100,
    down: ((period - (period - 1 - lowestIdx)) / period) * 100,
  };
}

// ─── CCI ────────────────────────────────────────────────────────────────────

export function calculateCCI(ohlcv: OHLCV[], period: number = 20): number {
  if (ohlcv.length < period) return NaN;

  const typicalPrices = ohlcv.map(d => (d.high + d.low + d.close) / 3);
  const sma = calculateSMA(typicalPrices, period);
  const lastSMA = sma[sma.length - 1];
  if (isNaN(lastSMA)) return NaN;

  const slice = typicalPrices.slice(-period);
  const meanDev = slice.reduce((sum, tp) => sum + Math.abs(tp - lastSMA), 0) / period;
  if (meanDev === 0) return 0;

  return (typicalPrices[typicalPrices.length - 1] - lastSMA) / (0.015 * meanDev);
}

// ─── ATR ────────────────────────────────────────────────────────────────────

export function calculateATR(highs: number[], lows: number[], closes: number[], period: number): number {
  if (highs.length < period + 1) return 0;
  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
}
