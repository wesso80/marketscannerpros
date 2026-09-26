import { dmi } from '@/lib/ta/core';
import { getOHLCRange } from '@/lib/coingecko';

/** Same minimum as equities (lib/equityTrendMetrics): 14 DI smoothing + 14 ADX smoothing + 2. */
export const CRYPTO_ADX_MIN_BARS = 30;
const DAY_MS = 86_400_000;

/**
 * Daily Wilder ADX(14) for a coin from CoinGecko daily OHLC rows ([candle CLOSE time ms, o, h, l, c]).
 * Only completed UTC days count (a candle whose close time is still in the future is dropped). Returns `undefined`
 * (never a default) with too little clean history, so the engine keeps its 'unknown_default_chop' basis.
 * RS-15: crypto used to get no ADX at all, so its market mode was always 'chop'.
 */
export function cryptoDailyAdx(rows: number[][] | null | undefined, nowMs: number = Date.now()): number | undefined {
  const byDay = new Map<number, { h: number; l: number; c: number }>();
  for (const r of rows ?? []) {
    if (!Array.isArray(r) || r.length < 5) continue;
    const [t, o, h, l, c] = r;
    if (![t, o, h, l, c].every((v) => typeof v === 'number' && Number.isFinite(v)) || !(l > 0) || h < l) continue;
    if (t > nowMs) continue; // candle not closed yet
    byDay.set(Math.round(t / DAY_MS), { h, l, c });
  }
  const bars = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
  if (bars.length < CRYPTO_ADX_MIN_BARS) return undefined;
  const { adx } = dmi(bars.map((b) => b.h), bars.map((b) => b.l), bars.map((b) => b.c), 14);
  return Number.isFinite(adx) ? Math.round(adx * 10) / 10 : undefined;
}

/** One CoinGecko daily OHLC call (~180 days). Fails soft to `undefined`. */
export async function fetchCryptoDailyAdx(coinId: string, nowMs: number = Date.now()): Promise<number | undefined> {
  try {
    const nowS = Math.floor(nowMs / 1000) - 60; // CoinGecko rejects `to` slightly ahead of its clock
    const rows = await getOHLCRange(coinId, nowS - 180 * 86_400, nowS, { timeoutMs: 8000, retries: 0 }, 'daily');
    return cryptoDailyAdx(rows, nowMs);
  } catch {
    return undefined;
  }
}
