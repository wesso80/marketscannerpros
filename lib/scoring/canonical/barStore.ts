/**
 * Server-only: canonical verdict for one symbol from the worker's daily bar store (ohlcv_bars). No provider calls —
 * used by surfaces that do not otherwise hold daily bars for the underlying (options scanner cockpit). Fails soft
 * (returns null) when the store has too little history. Deliberately NOT exported from ./index (client bundles).
 */
import { q } from '@/lib/db';
import { canonicalForDailyPick } from './dailyPick';
import type { RegimeOverlayInputs } from './regimeOverlay';
import type { CanonicalAssetClass, CanonicalBar, CanonicalResult } from './types';

export async function loadStoredDailyBars(symbol: string, limit = 500): Promise<CanonicalBar[]> {
  const rows = await q<{ ts: Date | string; open: string | number; high: string | number; low: string | number; close: string | number; volume: string | number | null }>(
    `SELECT ts, open, high, low, close, volume FROM ohlcv_bars WHERE symbol = $1 AND timeframe = 'daily' ORDER BY ts DESC LIMIT $2`, [symbol, limit]);
  return rows.reverse().map((r) => {
    const vol = Number(r.volume);
    return {
      t: r.ts instanceof Date ? r.ts.toISOString() : new Date(String(r.ts)).toISOString(),
      open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
      volume: Number.isFinite(vol) && vol > 0 ? vol : null,
    };
  });
}

export async function canonicalFromBarStore(symbol: string, assetClass: CanonicalAssetClass, overlay: RegimeOverlayInputs | null = null): Promise<CanonicalResult | null> {
  try {
    const bars = await loadStoredDailyBars(symbol);
    return canonicalForDailyPick(bars, { symbol, assetClass, overlay });
  } catch {
    return null;
  }
}
