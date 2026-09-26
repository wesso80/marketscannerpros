/**
 * `?assets=` filter for the scan-daily job: a comma list of equity, crypto, forex. Absent = every asset class (the
 * nightly full run). Lets a second, crypto-only run after the 00:00 UTC daily candle close refresh crypto rows without
 * re-scanning (or deleting) equities and forex.
 */
export type DailyScanAsset = 'equity' | 'crypto' | 'forex';
export const DAILY_SCAN_ASSETS: readonly DailyScanAsset[] = ['equity', 'crypto', 'forex'];

/** null = no filter (all assets); an empty array = the parameter was given but named nothing valid. */
export function parseDailyScanAssets(param: string | null | undefined): DailyScanAsset[] | null {
  if (param == null || param.trim() === '') return null;
  const wanted = new Set(param.split(',').map((a) => a.trim().toLowerCase()));
  return DAILY_SCAN_ASSETS.filter((a) => wanted.has(a));
}

/**
 * Asset classes whose stored rows a partial run may replace: only those it actually produced rows for, so a provider
 * outage during a crypto-only refresh leaves the existing crypto picks in place instead of wiping them.
 */
export function assetsToReplace(requested: readonly DailyScanAsset[], produced: ReadonlyArray<{ asset_class: string }>): DailyScanAsset[] {
  return requested.filter((a) => produced.some((r) => r.asset_class === a));
}
