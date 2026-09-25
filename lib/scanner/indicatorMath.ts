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

/**
 * Wilder ADX(period) — the standard definition (Wilder 1978; TradingView/TA-Lib `ADX`).
 * +DM/−DM/TR are smoothed with Wilder's recursive smoothing (S = S − S/n + x, seeded with the first n-bar sum), and
 * ADX is Wilder's running average of DX (seeded with the mean of the first n DX values). Needs ≥ 2·period bars;
 * returns NaN ADX otherwise. Inputs are oldest-first.
 *
 * The previous implementation used a simple 14-bar rolling SUM for DI and a 14-bar SMA of DX (no Wilder smoothing),
 * which overstated ADX by 10–24 points on daily equities (ADBE 33 vs 22.8, COST 42 vs 18 on 24 Sep 2026).
 */
export function adx(highs: number[], lows: number[], closes: number[], period=14) {
  const n = Math.min(highs.length, lows.length, closes.length);
  const plus_dm: number[] = [], minus_dm: number[] = [], trs: number[] = [];
  for (let i = 1; i < n; i++) {
    const upMove = highs[i] - highs[i-1];
    const downMove = lows[i-1] - lows[i];
    plus_dm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minus_dm.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const pc = closes[i-1];
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - pc), Math.abs(lows[i] - pc)));
  }
  if (period < 1 || trs.length < period) return { adx: NaN, plus_di: NaN, minus_di: NaN };

  let trS = 0, pdmS = 0, mdmS = 0;
  for (let i = 0; i < period; i++) { trS += trs[i]; pdmS += plus_dm[i]; mdmS += minus_dm[i]; }
  let diPlus = NaN, diMinus = NaN;
  const dx: number[] = [];
  const pushDx = () => {
    diPlus = trS > 0 ? (pdmS / trS) * 100 : 0;
    diMinus = trS > 0 ? (mdmS / trS) * 100 : 0;
    const diSum = diPlus + diMinus;
    dx.push(diSum === 0 ? 0 : (Math.abs(diPlus - diMinus) / diSum) * 100);
  };
  pushDx();
  for (let i = period; i < trs.length; i++) {
    trS = trS - trS / period + trs[i];
    pdmS = pdmS - pdmS / period + plus_dm[i];
    mdmS = mdmS - mdmS / period + minus_dm[i];
    pushDx();
  }

  let finalAdx = NaN;
  if (dx.length >= period) {
    finalAdx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dx.length; i++) finalAdx = (finalAdx * (period - 1) + dx[i]) / period;
  }
  // Clamp to 0-100 range as a safety measure
  const clampedAdx = Number.isFinite(finalAdx) ? Math.min(100, Math.max(0, finalAdx)) : NaN;
  return { adx: clampedAdx, plus_di: diPlus, minus_di: diMinus };
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
