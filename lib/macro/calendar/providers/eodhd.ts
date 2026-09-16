import { COUNTRIES } from '../countries';
import { categoryFromProvider, getIndicator, matchIndicator, unmappedIndicatorId } from '../indicators';
import { parseProviderNumber } from '../surprise';
import type { CountryCode, Importance, RawCalendarInput } from '../types';
import { emptyResult, utcDateKey, type EconomicCalendarProvider, type ProviderCalendarResult, type ProviderQuery } from './types';

/**
 * EODHD Economic Events adapter (prototype — NOT production-primary).
 *
 * Endpoint: GET https://eodhd.com/api/economic-events?api_token=KEY&fmt=json
 *           &country=US&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=1000
 *   - `country` is ISO-3166 alpha-2 (US, GB, JP...). Eurozone handling is
 *     unverified: we request "EU" and flag the result in parity.
 *   - `date` is "YYYY-MM-DD HH:MM:SS". The public sample (JP Capital
 *     Expenditure at 23:50 = 08:50 JST) indicates UTC; treated as UTC and
 *     marked for parity verification.
 *   - `type` + `comparison` ("yoy"/"mom"/"qoq"/null) identify the series.
 *   - `estimate` = consensus. No importance, source, revision or timing-
 *     confidence fields exist → timingStatus UNKNOWN for upcoming rows,
 *     importance from the registry when mapped (else 'medium').
 *
 * Licensing: COMMERCIAL TERMS UNVERIFIED. Key: EODHD_API_KEY.
 */

export interface EodhdRow {
  type?: string;
  comparison?: string | null;
  period?: string | null;
  country?: string;
  date?: string;
  actual?: number | string | null;
  previous?: number | string | null;
  estimate?: number | string | null;
  change?: number | null;
  change_percentage?: number | null;
}

const EODHD_BASE = 'https://eodhd.com/api/economic-events';
const TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  fetchedAt: number;
  inputs: RawCalendarInput[];
  countries: CountryCode[];
}
const cache = new Map<string, CacheEntry>();

/** EODHD ISO2 → internal code. */
export function eodhdCountryToCode(iso2: string): CountryCode | null {
  const c = iso2.trim().toUpperCase();
  if (c === 'GB') return 'UK';
  if (c === 'EU' || c === 'EA' || c === 'EZ') return 'EU';
  for (const meta of Object.values(COUNTRIES)) {
    if (meta.iso2 === c) return meta.code;
  }
  return null;
}

function codeToEodhdCountry(code: CountryCode): string {
  return COUNTRIES[code].iso2;
}

function toUtcIso(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = /(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s.replace(' ', 'T')}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function inferUnit(type: string, comparison: string | null | undefined): string | null {
  const t = type.toLowerCase();
  if (comparison === 'yoy' || comparison === 'mom' || comparison === 'qoq') return '%';
  if (t.includes('rate') || t.includes('inflation') || t.includes('cpi')) return '%';
  if (t.includes('pmi') || t.includes('index') || t.includes('confidence')) return 'index';
  if (t.includes('payroll') || t.includes('employment change') || t.includes('claims')) return 'K';
  return null;
}

/** Pure mapping — exported for tests. */
export function mapEodhdRow(row: EodhdRow, fetchedAtIso: string, nowMs: number): RawCalendarInput | null {
  if (!row.type || !row.country || !row.date) return null;
  const countryCode = eodhdCountryToCode(row.country);
  if (!countryCode) return null;
  const releaseTimeUtc = toUtcIso(row.date);
  if (!releaseTimeUtc) return null;

  const comparison = (row.comparison ?? '').toLowerCase() || null;
  const label = comparison ? `${row.type} ${comparison.toUpperCase()}` : row.type;
  const matchedId = matchIndicator(countryCode, label, row.type);
  const canonicalIndicatorId = matchedId ?? unmappedIndicatorId(countryCode, label);
  const definition = matchedId ? getIndicator(matchedId) : null;
  const actual = parseProviderNumber(row.actual);
  const released = Date.parse(releaseTimeUtc) <= nowMs;
  const importance: Importance = definition?.importance ?? 'medium';

  return {
    providerId: 'eodhd',
    countryCode,
    canonicalIndicatorId,
    localDate: releaseTimeUtc.slice(0, 10),
    localTime: releaseTimeUtc.slice(11, 16),
    releaseTimeUtc,
    referencePeriod: row.period?.trim() || null,
    // EODHD publishes no timing-confidence flag; a released row is de facto confirmed.
    timingStatus: released && actual !== null ? 'CONFIRMED' : 'UNKNOWN',
    timingNote: released && actual !== null ? null : 'EODHD does not publish timing confidence; treat as unconfirmed until released.',
    sourceAuthority: 'PROVIDER',
    actual,
    previous: parseProviderNumber(row.previous),
    revisedPrevious: null,
    consensus: parseProviderNumber(row.estimate),
    providerForecast: null,
    lastUpdated: fetchedAtIso,
    source: 'EODHD',
    sourceUrl: null,
    importance,
    eventName: matchedId ? undefined : label,
    category: matchedId ? undefined : categoryFromProvider('', row.type),
    unit: matchedId ? undefined : inferUnit(row.type, comparison),
  };
}

async function fetchCalendar(query: ProviderQuery): Promise<ProviderCalendarResult> {
  const apiKey = process.env.EODHD_API_KEY;
  const now = query.nowMs;
  if (!apiKey) return emptyResult('eodhd', 'NOT_CONFIGURED');

  const fromDate = utcDateKey(query.fromUtcMs);
  const toDate = utcDateKey(query.toUtcMs);
  const key = `${[...query.countries].sort().join(',')}|${fromDate}|${toDate}`;
  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return { providerId: 'eodhd', inputs: cached.inputs, status: 'LIVE', lastFetch: new Date(cached.fetchedAt).toISOString(), error: null, countriesAvailable: cached.countries };
  }

  const doFetch = query.fetchImpl ?? fetch;
  const fetchedAtIso = new Date(now).toISOString();
  const errors: string[] = [];
  const inputs: RawCalendarInput[] = [];

  // One request per country: the endpoint filters a single ISO2 code and caps at 1000 rows.
  const results = await Promise.allSettled(
    query.countries.map(async (code) => {
      const url = `${EODHD_BASE}?api_token=${encodeURIComponent(apiKey)}&fmt=json&country=${encodeURIComponent(codeToEodhdCountry(code))}&from=${fromDate}&to=${toDate}&limit=1000`;
      const res = await doFetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`EODHD HTTP ${res.status} (${code})`);
      const json = (await res.json()) as unknown;
      if (!Array.isArray(json)) throw new Error(`EODHD non-array payload (${code})`);
      return (json as EodhdRow[]).map((row) => mapEodhdRow(row, fetchedAtIso, now)).filter((x): x is RawCalendarInput => x !== null);
    }),
  );
  for (const r of results) {
    if (r.status === 'fulfilled') inputs.push(...r.value);
    else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
  }

  if (inputs.length === 0 && errors.length) {
    if (cached) {
      return { providerId: 'eodhd', inputs: cached.inputs, status: 'STALE', lastFetch: new Date(cached.fetchedAt).toISOString(), error: errors.join('; '), countriesAvailable: cached.countries };
    }
    return emptyResult('eodhd', 'UNAVAILABLE', errors.join('; '));
  }

  const countries = [...new Set(inputs.map((i) => i.countryCode))];
  cache.set(key, { fetchedAt: now, inputs, countries });
  return { providerId: 'eodhd', inputs, status: 'LIVE', lastFetch: fetchedAtIso, error: errors.length ? errors.join('; ') : null, countriesAvailable: countries };
}

export const eodhdProvider: EconomicCalendarProvider = {
  id: 'eodhd',
  kind: 'live',
  isConfigured: () => Boolean(process.env.EODHD_API_KEY),
  getEvents: fetchCalendar,
};

/** Test hook. */
export function __clearEodhdCache(): void {
  cache.clear();
}
