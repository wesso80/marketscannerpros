/**
 * Shared move rule for both signal_outcomes labellers.
 *
 * Bands match the outcome_thresholds seed in migrations/003_signals_learning.sql:
 *   1h 60min ±0.5%, 4h 240min ±1%, 1d 1440min ±2%, 1w 10080min ±4%.
 * The worker still prefers the live table. This map is only the fallback when that
 * table has no usable rows, and the band for a horizon the session labeler uses
 * that is not in the map.
 *
 * Within ±band is neutral. At or beyond +band in the call's direction is correct.
 * At or beyond the band against it is wrong. The boundary is inclusive, and it is
 * defined only in classifyMove.
 */
export const DEFAULT_OUTCOME_BANDS: Readonly<Record<number, number>> = {
  60: 0.5,
  240: 1,
  1440: 2,
  10080: 4,
};

export const DEFAULT_HORIZON_LABELS: Readonly<Record<number, string>> = {
  60: '1h',
  240: '4h',
  1440: '1d',
  10080: '1w',
};

export type MoveLabel = 'correct' | 'wrong' | 'neutral';

export type ThresholdRow = {
  horizon_minutes: number;
  horizon_label: string;
  correct_threshold: number;
  wrong_threshold?: number;
};

export type HorizonBand = {
  horizon_minutes: number;
  horizon_label: string;
  bandPct: number;
};

/**
 * Band for a horizon in minutes.
 * An exact seeded (or supplied) horizon wins. Anything else uses the nearest
 * seeded horizon. A tie takes the shorter horizon, so the tighter band.
 *
 * The session labeler asks for horizons that are not seeded:
 *   5min and 30min (1m / 5m timeframes) → 60min, 0.5%
 *   960min (its 4h timeframe) → 1440min, 2%  (closer to 1d than to 4h)
 */
export function bandForHorizon(
  horizonMinutes: number,
  bands: Readonly<Record<number, number>> = DEFAULT_OUTCOME_BANDS,
): number {
  const entries = Object.entries(bands)
    .map(([minutes, band]) => ({ minutes: Number(minutes), band: Number(band) }))
    .filter((row) => Number.isFinite(row.minutes) && Number.isFinite(row.band));
  if (entries.length === 0) return DEFAULT_OUTCOME_BANDS[1440];
  const exact = entries.find((row) => row.minutes === horizonMinutes);
  if (exact) return exact.band;
  let best = entries[0];
  for (const row of entries) {
    const rowDist = Math.abs(row.minutes - horizonMinutes);
    const bestDist = Math.abs(best.minutes - horizonMinutes);
    if (rowDist < bestDist || (rowDist === bestDist && row.minutes < best.minutes)) best = row;
  }
  return best.band;
}

/**
 * Table rows win, one band per horizon (the row's correct_threshold; the seed
 * sets correct and wrong to the same number). A row with a non-numeric threshold
 * uses bandForHorizon. No usable rows → the default map.
 */
export function horizonsWithFallback(rows: readonly ThresholdRow[]): HorizonBand[] {
  const parsed: HorizonBand[] = [];
  for (const row of rows) {
    const minutes = Number(row.horizon_minutes);
    if (!Number.isFinite(minutes)) continue;
    const fromTable = Number(row.correct_threshold);
    parsed.push({
      horizon_minutes: minutes,
      horizon_label: row.horizon_label || DEFAULT_HORIZON_LABELS[minutes] || `${minutes}m`,
      bandPct: Number.isFinite(fromTable) ? fromTable : bandForHorizon(minutes),
    });
  }
  if (parsed.length > 0) return parsed;
  return Object.entries(DEFAULT_OUTCOME_BANDS)
    .map(([minutes, bandPct]) => ({
      horizon_minutes: Number(minutes),
      horizon_label: DEFAULT_HORIZON_LABELS[Number(minutes)] ?? `${minutes}m`,
      bandPct,
    }))
    .sort((a, b) => a.horizon_minutes - b.horizon_minutes);
}

/** Inclusive boundary. A non-finite move or band, or a direction other than bullish/bearish, is neutral. */
export function classifyMove(direction: string, pctMove: number, bandPct: number): MoveLabel {
  if (!Number.isFinite(pctMove) || !Number.isFinite(bandPct)) return 'neutral';
  const dir = direction.trim().toLowerCase();
  if (dir !== 'bullish' && dir !== 'bearish') return 'neutral';
  const band = Math.abs(bandPct);
  const signed = dir === 'bearish' ? -pctMove : pctMove;
  if (signed >= band) return 'correct';
  if (signed <= -band) return 'wrong';
  return 'neutral';
}
