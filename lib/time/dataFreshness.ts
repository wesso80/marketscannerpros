/**
 * One staleness rule for daily market series (VIX, index / ETF closes, FX, crypto), counted in trading days.
 *
 * Before this, the market regime called a series stale after 4 calendar days (lib/marketRegime.ts) while the
 * liquidity engine allowed 7 (lib/intelligence/data/liquidityTransmissionInputBuilder.ts), so the same VIX close was
 * "stale" on the dashboard banner and "fresh" on /api/intelligence/liquidity.
 *
 * Rule: a daily series is stale when more than DAILY_SERIES_MAX_MISSING_SESSIONS completed sessions are missing
 * after its latest observation. One missing session is tolerated because FRED publishes VIXCLS (and other daily
 * series) the morning after the session. US equity sessions follow the NYSE calendar (weekends and holidays are not
 * counted); 24×7 series (crypto) count every completed UTC day.
 */
import { lastCompletedUsSessionDate, toYmd, usSessionsBetween } from './usSession';

export const DAILY_SERIES_MAX_MISSING_SESSIONS = 1;

export type SeriesCalendar = 'us-equity' | '24x7';

const DAY_MS = 86_400_000;

/** Completed sessions after `latest` (a YYYY-MM-DD or ISO date) up to `nowMs`. null when the date can't be read. */
export function missingSessions(latest: string | null | undefined, nowMs: number, calendar: SeriesCalendar = 'us-equity'): number | null {
  const ymd = toYmd(latest);
  if (!ymd || !Number.isFinite(Date.parse(`${ymd}T00:00:00Z`))) return null;
  if (calendar === '24x7') {
    const lastCompletedUtcDay = Date.parse(new Date(nowMs - DAY_MS).toISOString().slice(0, 10) + 'T00:00:00Z');
    return Math.max(0, Math.round((lastCompletedUtcDay - Date.parse(`${ymd}T00:00:00Z`)) / DAY_MS));
  }
  return usSessionsBetween(ymd, lastCompletedUsSessionDate(nowMs));
}

/** True when the series is missing more completed sessions than allowed, or its date can't be read. */
export function isDailySeriesStale(latest: string | null | undefined, nowMs: number, calendar: SeriesCalendar = 'us-equity'): boolean {
  const n = missingSessions(latest, nowMs, calendar);
  return n == null || n > DAILY_SERIES_MAX_MISSING_SESSIONS;
}
