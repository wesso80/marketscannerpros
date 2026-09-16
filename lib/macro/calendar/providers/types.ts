import type { CountryCode, ProviderId, ProviderStatus, RawCalendarInput } from '../types';

export interface ProviderQuery {
  countries: CountryCode[];
  /** Inclusive UTC window. */
  fromUtcMs: number;
  toUtcMs: number;
  nowMs: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

export interface ProviderCalendarResult {
  providerId: ProviderId;
  /** Provider-shaped rows already mapped to the normalized input model. */
  inputs: RawCalendarInput[];
  status: ProviderStatus;
  lastFetch: string | null;
  error: string | null;
  countriesAvailable: CountryCode[];
}

/**
 * Every calendar source implements this. Downstream code (merge, normalize,
 * UI) only ever sees RawCalendarInput / CalendarEvent — never provider payloads.
 */
export interface EconomicCalendarProvider {
  readonly id: ProviderId;
  /** 'live' providers supply actual/consensus; 'seed' providers supply schedule only. */
  readonly kind: 'live' | 'seed';
  isConfigured(): boolean;
  getEvents(query: ProviderQuery): Promise<ProviderCalendarResult>;
}

export function emptyResult(providerId: ProviderId, status: ProviderStatus, error: string | null = null): ProviderCalendarResult {
  return { providerId, inputs: [], status, lastFetch: null, error, countriesAvailable: [] };
}

export function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
