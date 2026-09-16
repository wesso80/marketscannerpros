import { COUNTRIES, providerCountryToCode } from '../countries';
import { categoryFromProvider, matchIndicator, unmappedIndicatorId } from '../indicators';
import { parseProviderNumber } from '../surprise';
import type { CountryCode, Importance, RawCalendarInput } from '../types';
import { emptyResult, utcDateKey, type EconomicCalendarProvider, type ProviderCalendarResult, type ProviderQuery } from './types';

/**
 * Trading Economics calendar adapter.
 *
 * Endpoint: GET https://api.tradingeconomics.com/calendar/country/{countries}/{from}/{to}?c=KEY&f=json
 *   - `Date` is UTC without a Z suffix (documented). We append Z explicitly.
 *   - `DateSpan` "1" means estimated timing → timingStatus=ESTIMATED.
 *   - `Importance` 1..3 → low/medium/high.
 *   - `Actual`/`Previous`/`Forecast`/`TEForecast`/`Revised` are display strings ("2.9%", "150K", "").
 *   - `Forecast` = market consensus; `TEForecast` = TE model — kept separate, never conflated.
 *
 * Licensing: COMMERCIAL TERMS UNVERIFIED. Nothing here assumes a plan level;
 * the adapter simply reports UNAVAILABLE (with the HTTP status) if the key is
 * not entitled to the calendar endpoint. Key: TRADING_ECONOMICS_API_KEY.
 *
 * Caching: in-memory TTL per (countries, from, to). Failed refreshes serve the
 * previous snapshot with status=STALE — never silently.
 */

export interface TradingEconomicsRow {
  CalendarId?: string;
  Date?: string;
  Country?: string;
  Category?: string;
  Event?: string;
  Reference?: string;
  Source?: string;
  SourceURL?: string;
  Actual?: string | number | null;
  Previous?: string | number | null;
  Forecast?: string | number | null;
  TEForecast?: string | number | null;
  Revised?: string | number | null;
  DateSpan?: string | number;
  Importance?: number | string;
  LastUpdate?: string;
  Currency?: string;
  Unit?: string;
}

const TE_BASE = 'https://api.tradingeconomics.com/calendar/country';
const TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  fetchedAt: number;
  inputs: RawCalendarInput[];
  countries: CountryCode[];
}

const cache = new Map<string, CacheEntry>();

function toUtcIso(teDate: string): string | null {
  const s = teDate.trim();
  if (!s) return null;
  const iso = /(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function importanceFrom(v: number | string | undefined): Importance {
  const n = typeof v === 'string' ? parseInt(v, 10) : v;
  if (n === 3) return 'high';
  if (n === 2) return 'medium';
  return 'low';
}

/** Pure mapping — exported for tests. */
export function mapTradingEconomicsRow(row: TradingEconomicsRow, fetchedAtIso: string): RawCalendarInput | null {
  if (!row.Date || !row.Country || !row.Event) return null;
  const countryCode = providerCountryToCode(row.Country);
  if (!countryCode) return null;
  const releaseTimeUtc = toUtcIso(row.Date);
  if (!releaseTimeUtc) return null;

  const eventName = row.Event.trim();
  const category = row.Category ?? '';
  const matchedId = matchIndicator(countryCode, eventName, category);
  const canonicalIndicatorId = matchedId ?? unmappedIndicatorId(countryCode, eventName);
  const unitRaw = (row.Unit ?? '').trim();
  const unit = unitRaw === '%' ? '%' : unitRaw === 'K' ? 'K' : unitRaw ? unitRaw : null;
  const estimated = String(row.DateSpan ?? '0') === '1';

  // Provider `Previous` is post-revision; `Revised` holds the pre-revision print.
  const previous = parseProviderNumber(row.Previous);
  const revisedRaw = parseProviderNumber(row.Revised);

  return {
    providerId: 'trading-economics',
    countryCode,
    canonicalIndicatorId,
    localDate: releaseTimeUtc.slice(0, 10),
    localTime: releaseTimeUtc.slice(11, 16),
    releaseTimeUtc,
    referencePeriod: row.Reference?.trim() || null,
    timingStatus: estimated ? 'ESTIMATED' : 'CONFIRMED',
    timingNote: estimated ? 'Provider marks this release time as estimated (DateSpan=1).' : null,
    sourceAuthority: 'PROVIDER',
    actual: parseProviderNumber(row.Actual),
    previous: revisedRaw !== null ? revisedRaw : previous,
    revisedPrevious: revisedRaw !== null ? previous : null,
    consensus: parseProviderNumber(row.Forecast),
    providerForecast: parseProviderNumber(row.TEForecast),
    lastUpdated: row.LastUpdate ? (toUtcIso(row.LastUpdate) ?? fetchedAtIso) : fetchedAtIso,
    source: row.Source?.trim() || 'Trading Economics',
    sourceUrl: row.SourceURL?.trim() || null,
    importance: importanceFrom(row.Importance),
    eventName: matchedId ? undefined : eventName,
    category: matchedId ? undefined : categoryFromProvider(category, eventName),
    unit: matchedId ? undefined : unit,
  };
}

async function fetchCalendar(query: ProviderQuery): Promise<ProviderCalendarResult> {
  const apiKey = process.env.TRADING_ECONOMICS_API_KEY;
  const now = query.nowMs;
  if (!apiKey) return emptyResult('trading-economics', 'NOT_CONFIGURED');

  const fromDate = utcDateKey(query.fromUtcMs);
  const toDate = utcDateKey(query.toUtcMs);
  const key = `${[...query.countries].sort().join(',')}|${fromDate}|${toDate}`;
  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return { providerId: 'trading-economics', inputs: cached.inputs, status: 'LIVE', lastFetch: new Date(cached.fetchedAt).toISOString(), error: null, countriesAvailable: cached.countries };
  }

  const countryPath = query.countries.map((c) => encodeURIComponent(COUNTRIES[c].providerName.toLowerCase())).join(',');
  const url = `${TE_BASE}/${countryPath}/${fromDate}/${toDate}?c=${encodeURIComponent(apiKey)}&f=json`;
  const doFetch = query.fetchImpl ?? fetch;

  try {
    const res = await doFetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Trading Economics HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) throw new Error('Trading Economics returned a non-array payload');
    const fetchedAtIso = new Date(now).toISOString();
    const inputs = (json as TradingEconomicsRow[]).map((row) => mapTradingEconomicsRow(row, fetchedAtIso)).filter((x): x is RawCalendarInput => x !== null);
    const countries = [...new Set(inputs.map((i) => i.countryCode))];
    cache.set(key, { fetchedAt: now, inputs, countries });
    return { providerId: 'trading-economics', inputs, status: 'LIVE', lastFetch: fetchedAtIso, error: null, countriesAvailable: countries };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown provider error';
    if (cached) {
      return { providerId: 'trading-economics', inputs: cached.inputs, status: 'STALE', lastFetch: new Date(cached.fetchedAt).toISOString(), error: message, countriesAvailable: cached.countries };
    }
    return emptyResult('trading-economics', 'UNAVAILABLE', message);
  }
}

export const tradingEconomicsProvider: EconomicCalendarProvider = {
  id: 'trading-economics',
  kind: 'live',
  isConfigured: () => Boolean(process.env.TRADING_ECONOMICS_API_KEY),
  getEvents: fetchCalendar,
};

/** Test hook. */
export function __clearTradingEconomicsCache(): void {
  cache.clear();
}
