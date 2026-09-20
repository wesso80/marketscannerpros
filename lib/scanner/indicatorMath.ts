/**
 * Scanner indicator math — the EXACT functions the Ranked scanner uses (lifted verbatim from app/api/scanner/run/route.ts).
 * Golden Egg computes RSI / ATR / ADX / EMA / MACD / stochastic with these same functions on the same canonical bars,
 * so the two surfaces cannot disagree on a market statistic for the same symbol and timeframe.
 */

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev: number | undefined;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (i === 0) prev = v;
    const cur = (v * k) + (prev! * (1 - k));
    out.push(cur);
    prev = cur;
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const ch = values[i] - values[i-1];
    if (ch >= 0) gains += ch; else losses -= ch;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  const rsiVal = 100 - (100 / (1 + (avgGain / (avgLoss || 1e-9))));
  out[period] = Math.min(100, Math.max(0, rsiVal));
  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i] - values[i-1];
    const gain = Math.max(0, ch);
    const loss = Math.max(0, -ch);
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    const val = 100 - (100 / (1 + (avgGain / (avgLoss || 1e-9))));
    out[i] = Math.min(100, Math.max(0, val));
  }
  return out;
}

export function macd(values: number[], fast=12, slow=26, signal=9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = emaFast.map((v, i) => v - (emaSlow[i] ?? v));
  const signalLine = ema(macdLine, signal);
  const hist = macdLine.map((v, i) => v - (signalLine[i] ?? v));
  return { macdLine, signalLine, hist };
}

export function atr(highs: number[], lows: number[], closes: number[], period=14): number[] {
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const h = highs[i], l = lows[i], pc = closes[i-1];
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    trs.push(tr);
  }
  const out: number[] = new Array(trs.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < trs.length; i++) {
    sum += trs[i];
    if (i >= period) sum -= trs[i - period];
    out[i] = (i + 1 >= period) ? (sum / period) : NaN;
  }
  return out;
}

export function adx(highs: number[], lows: number[], closes: number[], period=14) {
  const plus_dm: number[] = [], minus_dm: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i-1];
    const downMove = lows[i-1] - lows[i];
    plus_dm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minus_dm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const h = highs[i], l = lows[i], pc = closes[i-1];
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    trs.push(tr);
  }
  const plus_di: number[] = [], minus_di: number[] = [];
  let tr_sum = 0, pdm_sum = 0, mdm_sum = 0;
  for (let i = 0; i < trs.length; i++) {
    tr_sum += trs[i]; pdm_sum += plus_dm[i]; mdm_sum += minus_dm[i];
    if (i >= period - 1) {
      // Both numerator and denominator should be sums (or both averages)
      // DI+ = (sum of +DM / sum of TR) * 100
      // DI- = (sum of -DM / sum of TR) * 100
      const diPlus = tr_sum > 0 ? (pdm_sum / tr_sum) * 100 : 0;
      const diMinus = tr_sum > 0 ? (mdm_sum / tr_sum) * 100 : 0;
      plus_di.push(diPlus);
      minus_di.push(diMinus);
      if (i > period - 1) { tr_sum -= trs[i-period]; pdm_sum -= plus_dm[i-period]; mdm_sum -= minus_dm[i-period]; }
    }
  }
  const dx: number[] = [];
  for (let i = 0; i < plus_di.length; i++) {
    const diSum = plus_di[i] + minus_di[i];
    const diDiff = Math.abs(plus_di[i] - minus_di[i]);
    dx.push(diSum === 0 ? 0 : (diDiff / diSum) * 100);
  }
  const adx_out: number[] = [];
  let adx_sum = 0;
  for (let i = 0; i < dx.length; i++) {
    adx_sum += dx[i];
    if (i >= period - 1) {
      adx_out.push(adx_sum / period);
      adx_sum -= dx[i - period + 1];
    } else {
      adx_out.push(NaN);
    }
  }
  const finalAdx = adx_out.length > 0 ? adx_out[adx_out.length - 1] : NaN;
  // Clamp to 0-100 range as a safety measure
  const clampedAdx = Number.isFinite(finalAdx) ? Math.min(100, Math.max(0, finalAdx)) : NaN;
  return { adx: clampedAdx, plus_di: plus_di[plus_di.length - 1] ?? NaN, minus_di: minus_di[minus_di.length - 1] ?? NaN };
}

export function stochastic(highs: number[], lows: number[], closes: number[], period=14, smooth=3) {
  const k_vals: number[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    const h_max = Math.max(...highs.slice(i - period + 1, i + 1));
    const l_min = Math.min(...lows.slice(i - period + 1, i + 1));
    const k = ((closes[i] - l_min) / (h_max - l_min)) * 100;
    k_vals.push(Number.isNaN(k) ? 50 : k);
  }
  const k_smooth = ema(k_vals, smooth);
  const d_smooth = ema(k_smooth, smooth);
  const k = k_smooth[k_smooth.length - 1] ?? NaN;
  const d = d_smooth[d_smooth.length - 1] ?? NaN;
  // Clamp to 0-100
  return { 
    k: Number.isFinite(k) ? Math.min(100, Math.max(0, k)) : NaN, 
    d: Number.isFinite(d) ? Math.min(100, Math.max(0, d)) : NaN 
  };
}
