import { COUNTRIES } from '../countries';
import { CURATED_EVENTS } from '../curated';
import { zonedTimeToUtc } from '../time';
import type { CuratedCoverage } from '../types';
import type { EconomicCalendarProvider, ProviderCalendarResult, ProviderQuery } from './types';

/** Warn when the seed's last future event is closer than this. */
export const CURATED_COVERAGE_WARN_DAYS = 45;
export const CURATED_COVERAGE_WARNING = 'CURATED CALENDAR COVERAGE EXPIRING';

function releaseMs(input: { localDate: string; localTime: string; countryCode: keyof typeof COUNTRIES; releaseTimeUtc?: string }): number {
  if (input.releaseTimeUtc) return Date.parse(input.releaseTimeUtc);
  return zonedTimeToUtc(input.localDate, input.localTime, COUNTRIES[input.countryCode].timezone).getTime();
}

/** How far into the future the curated seed still has rows. */
export function curatedCoverage(nowMs: number): CuratedCoverage {
  let latest = -Infinity;
  for (const row of CURATED_EVENTS) {
    const ms = releaseMs(row);
    if (ms > nowMs && ms > latest) latest = ms;
  }
  if (!Number.isFinite(latest)) return { latestFutureEventUtc: null, daysRemaining: null, expiring: true };
  const daysRemaining = Math.floor((latest - nowMs) / 86_400_000);
  return { latestFutureEventUtc: new Date(latest).toISOString(), daysRemaining, expiring: daysRemaining < CURATED_COVERAGE_WARN_DAYS };
}

/**
 * Seed provider: official schedules + pattern estimates. Never supplies
 * actual/consensus/previous — those are live-provider only.
 */
export const curatedProvider: EconomicCalendarProvider = {
  id: 'curated',
  kind: 'seed',
  isConfigured: () => true,
  async getEvents(query: ProviderQuery): Promise<ProviderCalendarResult> {
    const inputs = CURATED_EVENTS.filter((row) => {
      if (!query.countries.includes(row.countryCode)) return false;
      const ms = releaseMs(row);
      return ms >= query.fromUtcMs && ms <= query.toUtcMs;
    }).map((row) => ({ ...row, lastUpdated: row.lastUpdated ?? new Date(query.nowMs).toISOString() }));
    return {
      providerId: 'curated',
      inputs,
      status: 'FALLBACK',
      lastFetch: new Date(query.nowMs).toISOString(),
      error: null,
      countriesAvailable: [...new Set(inputs.map((i) => i.countryCode))],
    };
  },
};
