/**
 * Share volume from one Alpha Vantage time-series row. The field name depends on the endpoint:
 * TIME_SERIES_DAILY_ADJUSTED puts volume in '6. volume' ('5.' is the adjusted close), while TIME_SERIES_DAILY and
 * TIME_SERIES_INTRADAY use '5. volume'. Reading only '5. volume' on the adjusted endpoint stored volume = 0 for every
 * daily bar the worker wrote since the Feb 2026 switch to DAILY_ADJUSTED, so the scanner's 20-day average volume
 * (liquidity check) and relative volume were always missing. Dependency-free: imported by the worker.
 */
export function avRowVolume(row: Record<string, unknown> | null | undefined): number {
  const raw = row?.['6. volume'] ?? row?.['5. volume'];
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
