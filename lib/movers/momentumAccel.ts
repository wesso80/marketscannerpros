/**
 * Movers momentum acceleration.
 * The worker stores a warmup status object in indicators_latest.warmup_json.
 * Older callers stored an OHLCV array in that same column. Both are accepted.
 * Bars for a status object come from ohlcv_bars (no schema change).
 */
export interface MomentumBar {
  close?: number;
  c?: number;
  high?: number;
  h?: number;
  low?: number;
  l?: number;
  volume?: number;
  v?: number;
}

const MIN_BARS = 35;

export function isWarmupStatus(value: unknown): boolean {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && ('barCount' in (value as object) || 'coreReady' in (value as object) || 'ready' in (value as object));
}

/** Same formula the movers route used when warmup_json was an OHLCV array. Null below 35 bars. */
export function momentumAccelFromBars(bars: MomentumBar[] | null | undefined): number | null {
  if (!Array.isArray(bars) || bars.length < MIN_BARS) return null;
  const closes = bars.map((bar) => Number(bar.close || bar.c || 0));
  const volumes = bars.map((bar) => Number(bar.volume || bar.v || 0));
  const highs = bars.map((bar) => Number(bar.high || bar.h || 0));
  const lows = bars.map((bar) => Number(bar.low || bar.l || 0));
  const lookback = 5;
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 1 - lookback];
  const recentVols = volumes.slice(-20);
  const avgVol = recentVols.reduce((sum, value) => sum + value, 0) / recentVols.length;
  const lastVol = volumes[volumes.length - 1] || 0;
  const volSurge = avgVol > 0 ? lastVol / avgVol : 1;
  const priceMove = lastClose - prevClose;
  let atrSum = 0;
  for (let i = bars.length - 14; i < bars.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[Math.max(0, i - 1)]),
      Math.abs(lows[i] - closes[Math.max(0, i - 1)]),
    );
    atrSum += tr;
  }
  const atrVal = atrSum / 14;
  const priceAtrMove = atrVal > 0 ? priceMove / atrVal : 0;
  const volScore = Math.min(25, Math.max(0, (volSurge - 1) * 25));
  const priceScore = Math.min(25, Math.abs(priceAtrMove) * 12.5);
  const accelScore = Math.round(volScore + priceScore);
  return Number.isFinite(accelScore) ? accelScore : null;
}

/**
 * Contract: an OHLCV array of at least 35 bars, or a warmup status object plus stored bars.
 * A status object alone cannot invent a score.
 */
export function momentumAccelFromWarmup(warmup: unknown, storedBars?: MomentumBar[] | null): number | null {
  if (Array.isArray(warmup)) return momentumAccelFromBars(warmup);
  if (isWarmupStatus(warmup)) return momentumAccelFromBars(storedBars);
  return null;
}
