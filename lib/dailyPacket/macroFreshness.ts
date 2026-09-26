/**
 * Daily Packet macro freshness: judged by the OLDEST required daily FRED series, not the newest.
 *
 * It used to take the newest observation across every macro_series row, so one fresh series (e.g. Fed funds)
 * made the whole pane look "fresh" while VIX / HY OAS (what the regime actually reads) could be weeks old.
 *
 * Only the daily FRED series are required. Derived series (LIQ_TX, GM2) and monthly series (UNRATE, CPI_YOY,
 * US_M2) are ignored here: they update on their own schedule and would always look stale.
 */

export interface MacroFreshnessInput {
  seriesKey: string;
  latestObservedOn: string | null;
}

/** Required daily series → max age in calendar days (weekend + a holiday allowance; DTWEXBGS lags ~a week). */
export const REQUIRED_MACRO_SERIES: Readonly<Record<string, number>> = {
  VIX: 4,
  VIX3M: 4,
  US10Y: 4,
  US2Y: 4,
  YIELD_2S10S: 4,
  FED_FUNDS_RATE: 5,
  CREDIT_HY_OAS: 5,
  DXY: 10,
};

export interface MacroFreshnessResult {
  /** Oldest observation among the required series (null when none of them has data). */
  lastUpdated: string | null;
  freshness: 'fresh' | 'stale' | 'unknown';
  stale: { seriesKey: string; latestObservedOn: string | null; ageDays: number | null; maxAgeDays: number }[];
  notes?: string;
  /** Packet warning when anything required is stale or missing. */
  warning: string | null;
}

function ageDaysOf(observedOn: string, nowMs: number): number | null {
  const t = Date.parse(observedOn.length <= 10 ? `${observedOn}T00:00:00Z` : observedOn);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

export function assessMacroFreshness(
  rows: MacroFreshnessInput[],
  nowMs: number = Date.now(),
  required: Readonly<Record<string, number>> = REQUIRED_MACRO_SERIES,
): MacroFreshnessResult {
  if (rows.length === 0) {
    return { lastUpdated: null, freshness: 'unknown', stale: [], warning: null };
  }
  const byKey = new Map(rows.map((r) => [r.seriesKey, r.latestObservedOn]));
  const stale: MacroFreshnessResult['stale'] = [];
  let oldest: string | null = null;
  for (const [seriesKey, maxAgeDays] of Object.entries(required)) {
    const observed = byKey.get(seriesKey) ?? null;
    const ageDays = observed ? ageDaysOf(observed, nowMs) : null;
    if (observed && (!oldest || observed < oldest)) oldest = observed;
    if (ageDays === null || ageDays > maxAgeDays) stale.push({ seriesKey, latestObservedOn: observed, ageDays, maxAgeDays });
  }
  if (stale.length === 0) {
    return { lastUpdated: oldest, freshness: 'fresh', stale, warning: null };
  }
  const list = stale
    .map((s) => (s.latestObservedOn ? `${s.seriesKey} (${s.latestObservedOn}, ${s.ageDays}d > ${s.maxAgeDays}d)` : `${s.seriesKey} (missing)`))
    .join(', ');
  return {
    lastUpdated: oldest,
    freshness: 'stale',
    stale,
    notes: `Stale required series: ${list}`,
    warning: `Macro data stale: ${stale.map((s) => s.seriesKey).join(', ')} — check the admin-macro-ingest cron.`,
  };
}
