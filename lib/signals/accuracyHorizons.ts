/**
 * Horizons published on the setup-accuracy page and written by refresh_signal_accuracy.
 * Labelling still records every outcome_thresholds row. Shorter horizons stay off this
 * page because stored price bars are daily, so those outcomes are almost all unknown.
 * 1440 = 1d (±2%), 10080 = 1w (±4%). See migrations/003_signals_learning.sql.
 */
export const ACCURACY_DISPLAY_HORIZONS = [1440, 10080] as const;

export const ACCURACY_DISPLAY_HORIZON_SET = new Set<number>(ACCURACY_DISPLAY_HORIZONS);

export function isAccuracyDisplayHorizon(horizonMinutes: unknown): boolean {
  return ACCURACY_DISPLAY_HORIZON_SET.has(Number(horizonMinutes));
}
