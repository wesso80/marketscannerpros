import { describe, it, expect, vi, afterEach } from 'vitest';
import { ALL_COUNTRIES } from '../lib/macro/calendar/countries';
import { getIndicator, isUnmappedIndicator, matchIndicator, unmappedIndicatorId } from '../lib/macro/calendar/indicators';
import { normalizeReferencePeriod, referencePeriodOrdinal } from '../lib/macro/calendar/referencePeriod';
import { mergeInputs, mergeGroup } from '../lib/macro/calendar/merge';
import { deriveConfidence, deriveDataStatus, normalizeAll, normalizeEvent, propagateRevisions } from '../lib/macro/calendar/normalize';
import { mapEodhdRow, eodhdProvider, eodhdCountryToCode, __clearEodhdCache } from '../lib/macro/calendar/providers/eodhd';
import { curatedProvider, curatedCoverage, CURATED_COVERAGE_WARNING, CURATED_COVERAGE_WARN_DAYS } from '../lib/macro/calendar/providers/curated';
import { PROVIDERS, resolveProviderOrder, getProvider } from '../lib/macro/calendar/providers';
import type { EconomicCalendarProvider } from '../lib/macro/calendar/providers/types';
import { buildCalendarFeed } from '../lib/macro/calendar/feed';
import { compareProvider, formatParityReport } from '../lib/macro/calendar/parity';
import { scoreRelevance, selectNextRelevantEvent, parseFocusAssets, DEFAULT_FOCUS_ASSETS } from '../lib/macro/calendar/relevance';
import { CURATED_EVENTS } from '../lib/macro/calendar/curated';
import type { CountryCode, ProviderId, RawCalendarInput } from '../lib/macro/calendar/types';

const NOW = Date.UTC(2026, 8, 16, 12, 0, 0);
const ORDER: ProviderId[] = ['trading-economics', 'eodhd', 'curated'];

function row(providerId: ProviderId, id: string, releaseTimeUtc: string, extra: Partial<RawCalendarInput> = {}): RawCalendarInput {
  const countryCode = id.slice(0, 2) as CountryCode;
  const isCurated = providerId === 'curated';
  return {
    providerId,
    countryCode,
    canonicalIndicatorId: id,
    localDate: releaseTimeUtc.slice(0, 10),
    localTime: releaseTimeUtc.slice(11, 16),
    releaseTimeUtc,
    referencePeriod: 'Aug',
    timingStatus: isCurated ? 'ESTIMATED' : 'CONFIRMED',
    sourceAuthority: isCurated ? 'CURATED' : 'PROVIDER',
    providerStatus: isCurated ? 'FALLBACK' : 'LIVE',
    lastUpdated: new Date(NOW - 60_000).toISOString(),
    ...extra,
  };
}

// ─── Canonical IDs ───────────────────────────────────────────────────────────

describe('canonical indicator ids', () => {
  it('every registry id is <CC>_… and resolves to its own country', () => {
    for (const cc of ALL_COUNTRIES) expect(getIndicator(`${cc}_NOPE`)).toBeNull();
    expect(Object.keys(PROVIDERS).sort()).toEqual(['curated', 'eodhd', 'trading-economics']);
    for (const id of ['US_CPI_HEADLINE_YOY', 'US_CPI_HEADLINE_MOM', 'US_CPI_CORE_YOY', 'US_CPI_CORE_MOM', 'US_PCE_HEADLINE_YOY', 'US_PCE_CORE_YOY',
      'JP_CPI_NATIONAL_HEADLINE_YOY', 'JP_CPI_NATIONAL_CORE_YOY', 'JP_CPI_NATIONAL_CORECORE_YOY', 'JP_CPI_TOKYO_HEADLINE_YOY', 'JP_CPI_TOKYO_CORE_YOY', 'JP_CPI_TOKYO_CORECORE_YOY',
      'EU_HICP_FLASH_HEADLINE_YOY', 'EU_HICP_FLASH_CORE_YOY', 'EU_HICP_FINAL_HEADLINE_YOY', 'EU_HICP_FINAL_CORE_YOY']) {
      const def = getIndicator(id)!;
      expect(def.id).toBe(id);
      expect(def.countryCode).toBe(id.slice(0, 2));
    }
  });

  it('every curated row references a registered canonical id', () => {
    for (const r of CURATED_EVENTS) {
      expect(getIndicator(r.canonicalIndicatorId), r.canonicalIndicatorId).not.toBeNull();
      expect(r.canonicalIndicatorId.startsWith(`${r.countryCode}_`)).toBe(true);
    }
  });

  it('unmapped provider rows get a deterministic, recognisable id', () => {
    const id = unmappedIndicatorId('US', '3-Month Bill Auction');
    expect(id).toBe('US_UNMAPPED_3_MONTH_BILL_AUCTION');
    expect(isUnmappedIndicator(id)).toBe(true);
    expect(isUnmappedIndicator('US_CPI_HEADLINE_YOY')).toBe(false);
  });

  it('flash and final HICP resolve to distinct ids from the same base label', () => {
    expect(matchIndicator('EU', 'Inflation Rate YoY Flash', 'Inflation Rate')).toBe('EU_HICP_FLASH_HEADLINE_YOY');
    expect(matchIndicator('EU', 'Inflation Rate YoY Final', 'Inflation Rate')).toBe('EU_HICP_FINAL_HEADLINE_YOY');
    expect(matchIndicator('EU', 'Core Inflation Rate YoY Flash', 'Core Inflation Rate')).toBe('EU_HICP_FLASH_CORE_YOY');
    expect(matchIndicator('EU', 'Core Inflation Rate YoY Final', 'Core Inflation Rate')).toBe('EU_HICP_FINAL_CORE_YOY');
  });

  it('Tokyo and National CPI never share an id', () => {
    expect(matchIndicator('JP', 'Tokyo CPI YoY', 'Tokyo CPI')).toBe('JP_CPI_TOKYO_HEADLINE_YOY');
    expect(matchIndicator('JP', 'Inflation Rate YoY', 'Inflation Rate')).toBe('JP_CPI_NATIONAL_HEADLINE_YOY');
    expect(matchIndicator('JP', 'Tokyo Core CPI YoY', 'Tokyo Core CPI')).toBe('JP_CPI_TOKYO_CORE_YOY');
    expect(matchIndicator('JP', 'Core Inflation Rate YoY', 'Core Inflation Rate')).toBe('JP_CPI_NATIONAL_CORE_YOY');
    expect(getIndicator('JP_CPI_TOKYO_HEADLINE_YOY')!.tags).toContain('LEADING INFLATION SIGNAL');
    expect(getIndicator('JP_CPI_NATIONAL_HEADLINE_YOY')!.tags ?? []).not.toContain('LEADING INFLATION SIGNAL');
    expect(getIndicator('JP_CASH_EARNINGS_YOY')!.category).toBe('wages');
  });
});

// ─── Reference periods ───────────────────────────────────────────────────────

describe('reference period normalization', () => {
  it('resolves the year from the release month, rolling back across year-end', () => {
    expect(normalizeReferencePeriod('Aug', { year: 2026, month: 9 })).toBe('Aug 2026');
    expect(normalizeReferencePeriod('Sep', { year: 2026, month: 9 })).toBe('Sep 2026'); // same-month flash / Tokyo CPI
    expect(normalizeReferencePeriod('Dec', { year: 2027, month: 1 })).toBe('Dec 2026'); // Dec CPI released in Jan
    expect(normalizeReferencePeriod('Q3', { year: 2026, month: 10 })).toBe('Q3 2026');
    expect(normalizeReferencePeriod('Q4', { year: 2027, month: 1 })).toBe('Q4 2026');  // Q4 GDP released in Jan
    expect(normalizeReferencePeriod('Q3', { year: 2026, month: 9 })).toBe('Q3 2026');  // quarter ending this month
  });

  it('accepts already-canonical and provider-specific forms', () => {
    expect(normalizeReferencePeriod('Aug 2026', { year: 2026, month: 9 })).toBe('Aug 2026');
    expect(normalizeReferencePeriod('2026-08', { year: 2026, month: 9 })).toBe('Aug 2026');
    expect(normalizeReferencePeriod('Q3 2026', { year: 2026, month: 10 })).toBe('Q3 2026');
    expect(normalizeReferencePeriod('Aug/01', { year: 2026, month: 8 })).toBe('Aug 2026'); // TE weekly reference keeps the month
    expect(normalizeReferencePeriod('2026', { year: 2026, month: 12 })).toBe('2026');
  });

  it('never invents a period', () => {
    expect(normalizeReferencePeriod(null, { year: 2026, month: 9 })).toBeNull();
    expect(normalizeReferencePeriod('', { year: 2026, month: 9 })).toBeNull();
    expect(normalizeReferencePeriod('whatever', { year: 2026, month: 9 })).toBe('whatever');
  });

  it('orders periods chronologically', () => {
    expect(referencePeriodOrdinal('Aug 2026')!).toBeLessThan(referencePeriodOrdinal('Sep 2026')!);
    expect(referencePeriodOrdinal('Q3 2026')!).toBeGreaterThan(referencePeriodOrdinal('Aug 2026')!);
    expect(referencePeriodOrdinal('Dec 2026')!).toBeLessThan(referencePeriodOrdinal('Jan 2027')!);
    expect(referencePeriodOrdinal(null)).toBeNull();
  });

  it('normalized events carry the full reference period', () => {
    const e = normalizeEvent(row('curated', 'US_CPI_HEADLINE_YOY', '2027-01-13T13:30:00.000Z', { referencePeriod: 'Dec' }), { nowUtcMs: NOW })!;
    expect(e.referencePeriod).toBe('Dec 2026');
    const q = normalizeEvent(row('curated', 'US_GDP_QOQ_ADVANCE', '2027-01-28T13:30:00.000Z', { referencePeriod: 'Q4' }), { nowUtcMs: NOW })!;
    expect(q.referencePeriod).toBe('Q4 2026');
  });
});

// ─── Merge: identity + precedence ────────────────────────────────────────────

describe('canonical merge', () => {
  it('merges on canonical id + country + reference period, not on names', () => {
    const inputs = [
      row('curated', 'JP_CPI_TOKYO_HEADLINE_YOY', '2026-09-24T23:30:00.000Z', { referencePeriod: 'Sep' }),
      row('trading-economics', 'JP_CPI_TOKYO_HEADLINE_YOY', '2026-09-24T23:30:00.000Z', { referencePeriod: 'Sep', consensus: 2.7 }),
      // Same day, same country, similar name family — different canonical id must stay separate.
      row('trading-economics', 'JP_CPI_TOKYO_CORE_YOY', '2026-09-24T23:30:00.000Z', { referencePeriod: 'Sep', consensus: 2.5 }),
      // National CPI must never collapse into Tokyo CPI.
      row('trading-economics', 'JP_CPI_NATIONAL_HEADLINE_YOY', '2026-09-17T23:30:00.000Z', { referencePeriod: 'Aug', consensus: 2.9 }),
    ];
    const { merged } = mergeInputs(inputs, ORDER);
    expect(merged).toHaveLength(3);
    const tokyo = merged.find((m) => m.canonicalIndicatorId === 'JP_CPI_TOKYO_HEADLINE_YOY')!;
    expect(tokyo.contributors).toEqual(['trading-economics', 'curated']);
    expect(tokyo.consensus).toBe(2.7);
  });

  it('keeps flash and final releases of the same period as separate events', () => {
    const inputs = [
      row('trading-economics', 'EU_HICP_FLASH_HEADLINE_YOY', '2026-09-30T09:00:00.000Z', { referencePeriod: 'Sep', consensus: 2.1 }),
      row('trading-economics', 'EU_HICP_FINAL_HEADLINE_YOY', '2026-10-16T09:00:00.000Z', { referencePeriod: 'Sep', consensus: 2.1 }),
    ];
    expect(mergeInputs(inputs, ORDER).merged).toHaveLength(2);
  });

  it('does not merge same identity when releases are >3 days apart; flags a conflict', () => {
    const inputs = [
      row('curated', 'AU_RBA_RATE_DECISION', '2026-09-29T04:30:00.000Z', { referencePeriod: 'Sep' }),
      row('eodhd', 'AU_RBA_RATE_DECISION', '2026-09-22T04:30:00.000Z', { referencePeriod: 'Sep' }),
    ];
    const { merged, identityConflicts } = mergeInputs(inputs, ORDER);
    expect(merged).toHaveLength(2);
    expect(identityConflicts).toHaveLength(1);
  });

  it('OFFICIAL timing beats a live provider; live provider beats CURATED estimate', () => {
    const official = row('curated', 'US_FOMC_RATE_DECISION', '2026-10-28T18:00:00.000Z', { referencePeriod: 'Oct', timingStatus: 'CONFIRMED', sourceAuthority: 'OFFICIAL' });
    const te = row('trading-economics', 'US_FOMC_RATE_DECISION', '2026-10-28T18:10:00.000Z', { referencePeriod: 'Oct', consensus: 4.0 });
    const m1 = mergeInputs([te, official], ORDER).merged[0];
    expect(m1.releaseTimeUtc).toBe('2026-10-28T18:00:00.000Z');
    expect(m1.sourceAuthority).toBe('OFFICIAL');
    expect(m1.consensus).toBe(4.0); // values still come from the live provider
    expect(m1.disagreements.some((d) => d.startsWith('timing:'))).toBe(true);

    const estimate = row('curated', 'UK_CPI_HEADLINE_YOY', '2026-10-21T06:00:00.000Z', { referencePeriod: 'Sep' });
    const live = row('eodhd', 'UK_CPI_HEADLINE_YOY', '2026-10-21T06:00:00.000Z', { referencePeriod: 'Sep', consensus: 3.1 });
    const m2 = mergeInputs([estimate, live], ORDER).merged[0];
    expect(m2.providerId).toBe('eodhd');
    expect(m2.timingStatus).toBe('CONFIRMED');
  });

  it('value precedence follows provider order; consensus never comes from curated or TEForecast', () => {
    const te = row('trading-economics', 'US_NFP', '2026-10-02T12:30:00.000Z', { referencePeriod: 'Sep', actual: 150, consensus: null, providerForecast: 165, previous: 79 });
    const eod = row('eodhd', 'US_NFP', '2026-10-02T12:30:00.000Z', { referencePeriod: 'Sep', actual: 152, consensus: 160, previous: 80 });
    const cur = row('curated', 'US_NFP', '2026-10-02T12:30:00.000Z', { referencePeriod: 'Sep', consensus: 999 as unknown as number });
    const m = mergeInputs([cur, eod, te], ORDER).merged[0];
    expect(m.actual).toBe(150);          // TE first in order
    expect(m.consensus).toBe(160);       // TE had none → EODHD; curated 999 ignored
    expect(m.providerForecast).toBe(165);
    expect(m.previous).toBe(79);
    expect(m.disagreements).toContain('actual: eodhd 152 vs trading-economics 150');
    expect(m.disagreements).toContain('previous: eodhd 80 vs trading-economics 79');
  });

  it('provider order is configurable and curated is always last', () => {
    expect(resolveProviderOrder(undefined)).toEqual(['trading-economics', 'eodhd', 'curated']);
    expect(resolveProviderOrder('eodhd,trading-economics')).toEqual(['eodhd', 'trading-economics', 'curated']);
    expect(resolveProviderOrder('eodhd')).toEqual(['eodhd', 'curated']);
    expect(resolveProviderOrder('curated,bogus')).toEqual(['trading-economics', 'eodhd', 'curated']);
    const te = row('trading-economics', 'US_NFP', '2026-10-02T12:30:00.000Z', { referencePeriod: 'Sep', actual: 150 });
    const eod = row('eodhd', 'US_NFP', '2026-10-02T12:30:00.000Z', { referencePeriod: 'Sep', actual: 152 });
    expect(mergeInputs([te, eod], ['eodhd', 'trading-economics', 'curated']).merged[0].actual).toBe(152);
  });

  it('attaches a period-less provider row to a mapped cluster only within ±36h', () => {
    const cur = row('curated', 'CA_CPI_HEADLINE_YOY', '2026-10-20T12:30:00.000Z', { referencePeriod: 'Sep' });
    const noPeriod = row('eodhd', 'CA_CPI_HEADLINE_YOY', '2026-10-20T12:30:00.000Z', { referencePeriod: null, consensus: 2.1 });
    const far = row('eodhd', 'CA_CPI_HEADLINE_YOY', '2026-10-24T12:30:00.000Z', { referencePeriod: null, consensus: 2.2 });
    const { merged } = mergeInputs([cur, noPeriod, far], ORDER);
    expect(merged).toHaveLength(2);
    expect(merged.find((m) => m.consensus === 2.1)!.contributors).toContain('curated');
  });

  it('mergeGroup keeps registry naming for mapped ids and provider naming for unmapped ids', () => {
    const unmapped = row('trading-economics', 'US_UNMAPPED_3_MONTH_BILL_AUCTION', '2026-09-21T15:30:00.000Z', { eventName: '3-Month Bill Auction', referencePeriod: null });
    const m = mergeGroup([{ input: unmapped, releaseMs: Date.parse(unmapped.releaseTimeUtc!), period: null, rank: 0 }]);
    expect(m.eventName).toBe('3-Month Bill Auction');
  });
});

// ─── Split data-quality model ────────────────────────────────────────────────

describe('split data-quality states', () => {
  it('curated OFFICIAL/CONFIRMED rows are HIGH confidence; CURATED/ESTIMATED are LOW', () => {
    const fomc = normalizeEvent(CURATED_EVENTS.find((r) => r.canonicalIndicatorId === 'US_FOMC_RATE_DECISION' && r.localDate === '2026-10-28')!, { nowUtcMs: NOW })!;
    expect(fomc.sourceAuthority).toBe('OFFICIAL');
    expect(fomc.timingStatus).toBe('CONFIRMED');
    expect(fomc.confidence).toBe('HIGH');
    expect(fomc.providerStatus).toBe('FALLBACK');
    expect(fomc.releaseStatus).toBe('UPCOMING');
    expect(fomc.providerId).toBe('curated');

    const au = normalizeEvent(CURATED_EVENTS.find((r) => r.canonicalIndicatorId === 'AU_CPI_MONTHLY_HEADLINE_YOY' && r.localDate === '2026-09-30')!, { nowUtcMs: NOW })!;
    expect(au.sourceAuthority).toBe('CURATED');
    expect(au.timingStatus).toBe('ESTIMATED');
    expect(au.confidence).toBe('LOW');

    const boj = normalizeEvent(CURATED_EVENTS.find((r) => r.canonicalIndicatorId === 'JP_BOJ_RATE_DECISION' && r.localDate === '2026-10-30')!, { nowUtcMs: NOW })!;
    expect(boj.sourceAuthority).toBe('OFFICIAL');
    expect(boj.timingStatus).toBe('TENTATIVE');
    expect(boj.confidence).toBe('MEDIUM');
    expect(boj.timingConfirmed).toBe(false);
  });

  it('deriveConfidence covers provider rows', () => {
    expect(deriveConfidence({ sourceAuthority: 'PROVIDER', timingStatus: 'CONFIRMED', canonicalMatched: true })).toBe('HIGH');
    expect(deriveConfidence({ sourceAuthority: 'PROVIDER', timingStatus: 'UNKNOWN', canonicalMatched: true })).toBe('MEDIUM');
    expect(deriveConfidence({ sourceAuthority: 'PROVIDER', timingStatus: 'CONFIRMED', canonicalMatched: false })).toBe('LOW');
  });

  it('dataStatus is derived from the split states', () => {
    const base = { releaseMs: NOW + 3_600_000, nowMs: NOW, actual: null, consensus: 2.7, lastUpdatedMs: NOW - 1000 } as const;
    expect(deriveDataStatus({ ...base, releaseStatus: 'UPCOMING', timingStatus: 'CONFIRMED', providerStatus: 'LIVE' }).status).toBe('LIVE');
    expect(deriveDataStatus({ ...base, releaseStatus: 'UPCOMING', timingStatus: 'ESTIMATED', providerStatus: 'LIVE' }).status).toBe('UNCONFIRMED');
    expect(deriveDataStatus({ ...base, releaseStatus: 'UPCOMING', timingStatus: 'TENTATIVE', providerStatus: 'LIVE' }).status).toBe('UNCONFIRMED');
    expect(deriveDataStatus({ ...base, releaseStatus: 'UPCOMING', timingStatus: 'CONFIRMED', providerStatus: 'STALE' }).status).toBe('STALE');
    expect(deriveDataStatus({ ...base, releaseStatus: 'UPCOMING', timingStatus: 'CONFIRMED', providerStatus: 'FALLBACK', consensus: null }).status).toBe('MISSING');
    expect(deriveDataStatus({ ...base, releaseStatus: 'RELEASED', timingStatus: 'CONFIRMED', providerStatus: 'LIVE', releaseMs: NOW - 3_600_000 }).status).toBe('DELAYED');
    expect(deriveDataStatus({ ...base, releaseStatus: 'RELEASED', timingStatus: 'CONFIRMED', providerStatus: 'LIVE', releaseMs: NOW - 3_600_000, actual: 2.9 }).status).toBe('LIVE');
    expect(deriveDataStatus({ ...base, releaseStatus: 'REVISED', timingStatus: 'CONFIRMED', providerStatus: 'LIVE', releaseMs: NOW - 86_400_000 * 30, actual: 2.9 }).detail).toMatch(/revised/i);
  });

  it('release status: UPCOMING → RELEASED → REVISED via a later revisedPrevious', () => {
    const events = normalizeAll([
      row('trading-economics', 'US_NFP', '2026-08-07T12:30:00.000Z', { referencePeriod: 'Jul', actual: 73, consensus: 100, previous: 147 }),
      row('trading-economics', 'US_NFP', '2026-09-04T12:30:00.000Z', { referencePeriod: 'Aug', actual: 22, consensus: 75, previous: 73, revisedPrevious: 79 }),
      row('trading-economics', 'US_NFP', '2026-10-02T12:30:00.000Z', { referencePeriod: 'Sep' }),
    ], { nowUtcMs: NOW });
    const jul = events.find((e) => e.referencePeriod === 'Jul 2026')!;
    const aug = events.find((e) => e.referencePeriod === 'Aug 2026')!;
    const sep = events.find((e) => e.referencePeriod === 'Sep 2026')!;
    expect(jul.releaseStatus).toBe('REVISED');
    expect(jul.actual).toBe(73);          // original preserved
    expect(jul.revisedActual).toBe(79);   // revision attached
    expect(aug.releaseStatus).toBe('RELEASED');
    expect(aug.display.previous).toBe('79K');
    expect(sep.releaseStatus).toBe('UPCOMING');
    // propagateRevisions is idempotent
    expect(propagateRevisions(events).find((e) => e.referencePeriod === 'Jul 2026')!.revisedActual).toBe(79);
  });

  it('a stale provider feed marks even fresh-looking rows STALE', () => {
    const e = normalizeEvent(row('trading-economics', 'US_CPI_HEADLINE_YOY', '2026-10-13T12:30:00.000Z', { referencePeriod: 'Sep', consensus: 2.8, providerStatus: 'STALE' }), { nowUtcMs: NOW })!;
    expect(e.providerStatus).toBe('STALE');
    expect(e.dataStatus).toBe('STALE');
  });
});

// ─── Provider interface ──────────────────────────────────────────────────────

describe('generic provider interface', () => {
  afterEach(() => {
    __clearEodhdCache();
    delete process.env.EODHD_API_KEY;
    delete process.env.TRADING_ECONOMICS_API_KEY;
    vi.restoreAllMocks();
  });

  it('exposes curated, trading-economics and eodhd through one interface', () => {
    for (const id of ['curated', 'trading-economics', 'eodhd'] as ProviderId[]) {
      const p: EconomicCalendarProvider = getProvider(id);
      expect(p.id).toBe(id);
      expect(typeof p.getEvents).toBe('function');
      expect(typeof p.isConfigured).toBe('function');
    }
    expect(curatedProvider.kind).toBe('seed');
    expect(eodhdProvider.kind).toBe('live');
  });

  it('curated provider filters by window and country and reports FALLBACK', async () => {
    const res = await curatedProvider.getEvents({ countries: ['JP'], fromUtcMs: NOW, toUtcMs: NOW + 14 * 86_400_000, nowMs: NOW });
    expect(res.status).toBe('FALLBACK');
    expect(res.inputs.length).toBeGreaterThan(0);
    expect(res.inputs.every((i) => i.countryCode === 'JP' && i.providerId === 'curated')).toBe(true);
    expect(res.inputs.every((i) => i.actual === undefined && i.consensus === undefined)).toBe(true);
  });

  it('falls back to curated when every live provider is unavailable', async () => {
    process.env.TRADING_ECONOMICS_API_KEY = 'k';
    process.env.EODHD_API_KEY = 'k';
    const failing = vi.fn().mockRejectedValue(new Error('network down'));
    const feed = await buildCalendarFeed({ nowMs: NOW, days: 14, countries: ['US', 'JP'], fetchImpl: failing as unknown as typeof fetch });
    expect(feed.meta.providers.find((p) => p.id === 'trading-economics')!.status).toBe('UNAVAILABLE');
    expect(feed.meta.providers.find((p) => p.id === 'eodhd')!.status).toBe('UNAVAILABLE');
    expect(feed.meta.providerStatus).toBe('UNAVAILABLE');
    expect(feed.meta.provider).toBe('curated');
    expect(feed.events.length).toBeGreaterThan(0);
    expect(feed.events.every((e) => e.providerId === 'curated' && e.providerStatus === 'FALLBACK')).toBe(true);
    expect(feed.meta.warnings.some((w) => w.includes('unavailable'))).toBe(true);
  });

  it('downstream events never expose provider payload shapes', async () => {
    const feed = await buildCalendarFeed({ nowMs: NOW, days: 7, countries: ['US'] });
    for (const e of feed.events) {
      expect(e).not.toHaveProperty('CalendarId');
      expect(e).not.toHaveProperty('TEForecast');
      expect(e).not.toHaveProperty('estimate');
      expect(e).toHaveProperty('canonicalIndicatorId');
      expect(e).toHaveProperty('sourceAuthority');
      expect(e).toHaveProperty('timingStatus');
      expect(e).toHaveProperty('providerStatus');
      expect(e).toHaveProperty('releaseStatus');
    }
  });
});

// ─── EODHD ───────────────────────────────────────────────────────────────────

describe('EODHD adapter', () => {
  afterEach(() => {
    __clearEodhdCache();
    delete process.env.EODHD_API_KEY;
    vi.restoreAllMocks();
  });

  const fetchedAt = new Date(NOW).toISOString();

  it('maps ISO2 country codes (GB → UK, EU handled)', () => {
    expect(eodhdCountryToCode('GB')).toBe('UK');
    expect(eodhdCountryToCode('US')).toBe('US');
    expect(eodhdCountryToCode('JP')).toBe('JP');
    expect(eodhdCountryToCode('EU')).toBe('EU');
    expect(eodhdCountryToCode('XX')).toBeNull();
  });

  it('normalizes a released Japan row (UTC date, estimate→consensus, canonical id)', () => {
    const input = mapEodhdRow({ type: 'Inflation Rate', comparison: 'yoy', period: 'Aug', country: 'JP', date: '2026-09-17 23:30:00', actual: 2.9, previous: 2.8, estimate: 2.7 }, fetchedAt, Date.UTC(2026, 8, 18))!;
    expect(input.providerId).toBe('eodhd');
    expect(input.countryCode).toBe('JP');
    expect(input.canonicalIndicatorId).toBe('JP_CPI_NATIONAL_HEADLINE_YOY');
    expect(input.releaseTimeUtc).toBe('2026-09-17T23:30:00.000Z');
    expect(input.actual).toBe(2.9);
    expect(input.consensus).toBe(2.7);
    expect(input.providerForecast).toBeNull();
    expect(input.timingStatus).toBe('CONFIRMED');
    const e = normalizeEvent(input, { nowUtcMs: Date.UTC(2026, 8, 18) })!;
    expect(e.releaseTimeLocal).toBe('08:30 JST');
    expect(e.referencePeriod).toBe('Aug 2026');
    expect(e.surprise?.label).toBe('+0.2pp');
    expect(e.importance).toBe('high'); // from registry — EODHD has no importance field
  });

  it('marks upcoming rows UNKNOWN timing and keeps Tokyo CPI distinct', () => {
    const tokyo = mapEodhdRow({ type: 'Tokyo CPI', comparison: 'yoy', period: 'Sep', country: 'JP', date: '2026-09-24 23:30:00', actual: null, previous: 2.5, estimate: 2.6 }, fetchedAt, NOW)!;
    expect(tokyo.canonicalIndicatorId).toBe('JP_CPI_TOKYO_HEADLINE_YOY');
    expect(tokyo.timingStatus).toBe('UNKNOWN');
    const e = normalizeEvent(tokyo, { nowUtcMs: NOW })!;
    expect(e.dataStatus).toBe('UNCONFIRMED');
    expect(e.tags).toContain('LEADING INFLATION SIGNAL');
  });

  it('keeps unmapped rows with provider naming and inferred category', () => {
    const r = mapEodhdRow({ type: 'Jobs/applications ratio', comparison: null, period: 'Jan', country: 'JP', date: '2025-03-03 23:30:00', actual: 1.26, previous: 1.25, estimate: 1.25 }, fetchedAt, NOW)!;
    expect(isUnmappedIndicator(r.canonicalIndicatorId)).toBe(true);
    expect(r.eventName).toBe('Jobs/applications ratio');
    expect(r.importance).toBe('medium');
    expect(mapEodhdRow({ type: 'x', country: 'ZZ', date: '2026-01-01 00:00:00' }, fetchedAt, NOW)).toBeNull();
  });

  it('fetches one request per country and tolerates partial failures', async () => {
    process.env.EODHD_API_KEY = 'k';
    const impl = vi.fn(async (url: string) => {
      if (url.includes('country=JP')) return { ok: true, json: async () => [{ type: 'Inflation Rate', comparison: 'yoy', period: 'Aug', country: 'JP', date: '2026-09-17 23:30:00', actual: null, previous: 2.8, estimate: 2.7 }] };
      return { ok: false, status: 403 };
    });
    const res = await eodhdProvider.getEvents({ countries: ['JP', 'US'], fromUtcMs: NOW, toUtcMs: NOW + 30 * 86_400_000, nowMs: NOW, fetchImpl: impl as unknown as typeof fetch });
    expect(impl).toHaveBeenCalledTimes(2);
    expect(res.status).toBe('LIVE');
    expect(res.inputs).toHaveLength(1);
    expect(res.error).toMatch(/403/);
    expect(res.countriesAvailable).toEqual(['JP']);
  });

  it('reports NOT_CONFIGURED without a key', async () => {
    const res = await eodhdProvider.getEvents({ countries: ['JP'], fromUtcMs: NOW, toUtcMs: NOW + 86_400_000, nowMs: NOW });
    expect(res.status).toBe('NOT_CONFIGURED');
  });
});

// ─── Relevance ───────────────────────────────────────────────────────────────

describe('catalyst relevance', () => {
  const events = normalizeAll([
    row('curated', 'NZ_GDP_QOQ', '2026-09-16T22:45:00.000Z', { referencePeriod: 'Q2', timingStatus: 'CONFIRMED', sourceAuthority: 'OFFICIAL' }),
    row('curated', 'US_FOMC_RATE_DECISION', '2026-09-17T18:00:00.000Z', { referencePeriod: 'Sep', timingStatus: 'CONFIRMED', sourceAuthority: 'OFFICIAL' }),
    row('curated', 'JP_BOJ_RATE_DECISION', '2026-09-18T03:00:00.000Z', { referencePeriod: 'Sep', timingStatus: 'TENTATIVE', sourceAuthority: 'OFFICIAL' }),
  ], { nowUtcMs: NOW });

  it('scores US central bank highest for equity/USD focus, NZ GDP lowest', () => {
    const fomc = events.find((e) => e.canonicalIndicatorId === 'US_FOMC_RATE_DECISION')!;
    const nz = events.find((e) => e.canonicalIndicatorId === 'NZ_GDP_QOQ')!;
    expect(scoreRelevance(fomc, ['SPX', 'NQ']).score).toBe(100);
    expect(scoreRelevance(nz, ['SPX', 'NQ']).score).toBeLessThan(10);
    expect(scoreRelevance(nz, ['AUD']).score).toBeGreaterThan(20);
  });

  it('distinguishes next global event from next market-relevant event', () => {
    const relevant = selectNextRelevantEvent(events, NOW, ['SPX', 'NQ', 'USD'])!;
    expect(relevant.event.canonicalIndicatorId).toBe('US_FOMC_RATE_DECISION'); // NZ GDP is earlier but not relevant
    const jpy = selectNextRelevantEvent(events, NOW, ['JPY'])!;
    expect(jpy.event.canonicalIndicatorId).toBe('JP_BOJ_RATE_DECISION');
    expect(jpy.relevance.reasons.length).toBeGreaterThan(0);
  });

  it('parses focus assets defensively', () => {
    expect(parseFocusAssets(null)).toEqual(DEFAULT_FOCUS_ASSETS);
    expect(parseFocusAssets('btc,eth,gold')).toEqual(['BTC', 'ETH', 'Gold']);
    expect(parseFocusAssets('nonsense')).toEqual(DEFAULT_FOCUS_ASSETS);
  });
});

// ─── Curated coverage expiry ─────────────────────────────────────────────────

describe('curated coverage expiry', () => {
  it('is healthy today and expiring when the seed horizon is inside the 45-day guard', () => {
    const today = curatedCoverage(NOW);
    expect(today.latestFutureEventUtc).not.toBeNull();
    expect(today.daysRemaining!).toBeGreaterThan(CURATED_COVERAGE_WARN_DAYS);
    expect(today.expiring).toBe(false);

    const latest = Date.parse(today.latestFutureEventUtc!);
    const late = curatedCoverage(latest - 30 * 86_400_000);
    expect(late.expiring).toBe(true);
    expect(late.daysRemaining).toBeLessThan(CURATED_COVERAGE_WARN_DAYS);

    const beyond = curatedCoverage(latest + 86_400_000);
    expect(beyond.expiring).toBe(true);
    expect(beyond.latestFutureEventUtc).toBeNull();
  });

  it('surfaces CURATED CALENDAR COVERAGE EXPIRING in feed warnings', async () => {
    const latest = Date.parse(curatedCoverage(NOW).latestFutureEventUtc!);
    const feed = await buildCalendarFeed({ nowMs: latest - 20 * 86_400_000, days: 14, countries: ALL_COUNTRIES });
    expect(feed.meta.curatedCoverage.expiring).toBe(true);
    expect(feed.meta.warnings.some((w) => w.startsWith(CURATED_COVERAGE_WARNING))).toBe(true);
    const healthy = await buildCalendarFeed({ nowMs: NOW, days: 14, countries: ALL_COUNTRIES });
    expect(healthy.meta.warnings.some((w) => w.startsWith(CURATED_COVERAGE_WARNING))).toBe(false);
  });
});

// ─── Parity report ───────────────────────────────────────────────────────────

describe('provider parity report', () => {
  it('reports matched, missing, extra, timing and consensus coverage against the curated baseline', () => {
    const baseline = [
      row('curated', 'US_CPI_HEADLINE_YOY', '2026-10-13T12:30:00.000Z', { referencePeriod: 'Sep' }),
      row('curated', 'JP_CPI_TOKYO_HEADLINE_YOY', '2026-09-24T23:30:00.000Z', { referencePeriod: 'Sep' }),
      row('curated', 'UK_BOE_RATE_DECISION', '2026-09-17T11:00:00.000Z', { referencePeriod: 'Sep' }),
    ];
    const provider = [
      row('eodhd', 'US_CPI_HEADLINE_YOY', '2026-10-13T12:30:00.000Z', { referencePeriod: 'Sep', consensus: 2.8 }),
      row('eodhd', 'UK_BOE_RATE_DECISION', '2026-09-17T11:05:00.000Z', { referencePeriod: 'Sep' }),
      row('eodhd', 'US_UNMAPPED_3_MONTH_BILL_AUCTION', '2026-09-21T15:30:00.000Z', { referencePeriod: null, eventName: '3-Month Bill Auction' }),
      row('eodhd', 'US_NFP', '2026-10-02T12:30:00.000Z', { referencePeriod: 'Sep', consensus: 150 }),
    ];
    const p = compareProvider({ providerId: 'eodhd', status: 'LIVE', error: null, baseline, provider, countries: ['US', 'JP', 'UK'] });
    expect(p.eventsExpected).toBe(3);
    expect(p.eventsFromProvider).toBe(4);
    expect(p.eventsMatched).toBe(2);
    expect(p.missing).toEqual(['JP|JP_CPI_TOKYO_HEADLINE_YOY|Sep 2026']);
    expect(p.extraMapped).toEqual(['US|US_NFP|Sep 2026']);
    expect(p.extraUnmappedCount).toBe(1);
    expect(p.timingDifferences).toHaveLength(1);
    expect(p.timingDifferences[0].deltaMinutes).toBe(5);
    expect(p.consensusCoverage).toEqual({ withConsensus: 2, total: 4, pct: 50 });
    expect(p.countryCoverage.JP).toEqual({ expected: 1, matched: 0, fromProvider: 0 });
    expect(p.indicatorGaps).toEqual(['JP|JP_CPI_TOKYO_HEADLINE_YOY']);
    const text = formatParityReport({ windowFromUtc: new Date(NOW).toISOString(), windowToUtc: new Date(NOW + 30 * 86_400_000).toISOString(), generatedAt: new Date(NOW).toISOString(), countries: ['US', 'JP', 'UK'], providers: [p] });
    expect(text).toContain('== eodhd [LIVE]');
    expect(text).toContain('missing events:            1');
  });
});
