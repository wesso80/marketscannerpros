import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  zonedTimeToUtc,
  zonedClock,
  zonedDateKey,
  formatLocalRelease,
  isDaylightSaving,
  formatCountdown,
  ET_ZONE,
} from '../lib/macro/calendar/time';
import { COUNTRIES, countryFlag, parseCountryFilter, providerCountryToCode, ALL_COUNTRIES } from '../lib/macro/calendar/countries';
import { getIndicator, matchIndicator } from '../lib/macro/calendar/indicators';
import { computeSurprise, parseProviderNumber, formatValue, buildAssetImpact } from '../lib/macro/calendar/surprise';
import {
  normalizeEvent,
  normalizeAll,
  filterEvents,
  selectNextMajorEvent,
  isInsideDangerWindow,
  buildBojContext,
  HIGH_IMPACT_DANGER_WINDOW,
} from '../lib/macro/calendar/normalize';
import { CURATED_EVENTS } from '../lib/macro/calendar/curated';
import { mapTradingEconomicsRow, tradingEconomicsProvider, __clearTradingEconomicsCache } from '../lib/macro/calendar/providers/tradingEconomics';
import { mergeInputs } from '../lib/macro/calendar/merge';
import { buildCalendarFeed } from '../lib/macro/calendar/feed';
import type { CountryCode, ProviderId, RawCalendarInput } from '../lib/macro/calendar/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

// Fixed "now": 2026-09-16 12:00:00Z (a Wednesday during northern DST).
const NOW = Date.UTC(2026, 8, 16, 12, 0, 0);

/** Provider-shaped row (live, confirmed timing) unless overridden. */
function raw(countryCode: CountryCode, canonicalIndicatorId: string, localDate: string, localTime: string, extra: Partial<RawCalendarInput> = {}): RawCalendarInput {
  return {
    providerId: 'trading-economics',
    countryCode,
    canonicalIndicatorId,
    localDate,
    localTime,
    referencePeriod: 'Aug',
    timingStatus: 'CONFIRMED',
    sourceAuthority: 'PROVIDER',
    ...extra,
  };
}

const CPI_FIXTURES: Array<{ label: string; input: RawCalendarInput; expectUtc: string; expectLocal: string; currency: string; tz: string }> = [
  { label: 'US CPI', input: raw('US', 'US_CPI_HEADLINE_YOY', '2026-09-11', '08:30'), expectUtc: '2026-09-11T12:30:00.000Z', expectLocal: '08:30 EDT', currency: 'USD', tz: 'America/New_York' },
  { label: 'Japan National CPI', input: raw('JP', 'JP_CPI_NATIONAL_HEADLINE_YOY', '2026-09-18', '08:30'), expectUtc: '2026-09-17T23:30:00.000Z', expectLocal: '08:30 JST', currency: 'JPY', tz: 'Asia/Tokyo' },
  { label: 'Japan Tokyo CPI', input: raw('JP', 'JP_CPI_TOKYO_HEADLINE_YOY', '2026-09-25', '08:30'), expectUtc: '2026-09-24T23:30:00.000Z', expectLocal: '08:30 JST', currency: 'JPY', tz: 'Asia/Tokyo' },
  { label: 'Eurozone HICP', input: raw('EU', 'EU_HICP_FLASH_HEADLINE_YOY', '2026-09-30', '11:00'), expectUtc: '2026-09-30T09:00:00.000Z', expectLocal: '11:00 CEST', currency: 'EUR', tz: 'Europe/Brussels' },
  { label: 'UK CPI', input: raw('UK', 'UK_CPI_HEADLINE_YOY', '2026-09-16', '07:00'), expectUtc: '2026-09-16T06:00:00.000Z', expectLocal: '07:00 BST', currency: 'GBP', tz: 'Europe/London' },
  { label: 'Australia CPI', input: raw('AU', 'AU_CPI_MONTHLY_HEADLINE_YOY', '2026-09-30', '11:30'), expectUtc: '2026-09-30T01:30:00.000Z', expectLocal: '11:30 AEST', currency: 'AUD', tz: 'Australia/Sydney' },
  { label: 'Canada CPI', input: raw('CA', 'CA_CPI_HEADLINE_YOY', '2026-09-15', '08:30'), expectUtc: '2026-09-15T12:30:00.000Z', expectLocal: '08:30 EDT', currency: 'CAD', tz: 'America/Toronto' },
  { label: 'China CPI', input: raw('CN', 'CN_CPI_HEADLINE_YOY', '2026-10-15', '09:30'), expectUtc: '2026-10-15T01:30:00.000Z', expectLocal: '09:30 CST', currency: 'CNY', tz: 'Asia/Shanghai' },
  { label: 'NZ CPI', input: raw('NZ', 'NZ_CPI_HEADLINE_QOQ', '2026-10-20', '10:45'), expectUtc: '2026-10-19T21:45:00.000Z', expectLocal: '10:45 NZDT', currency: 'NZD', tz: 'Pacific/Auckland' },
];

// ─── Timezone conversion ─────────────────────────────────────────────────────

describe('timezone conversion (UTC internal)', () => {
  it.each(CPI_FIXTURES)('$label converts local release time to UTC and labels the local zone', ({ input, expectUtc, expectLocal, tz }) => {
    const utc = zonedTimeToUtc(input.localDate, input.localTime, tz);
    expect(utc.toISOString()).toBe(expectUtc);
    expect(formatLocalRelease(utc.getTime(), tz, COUNTRIES[input.countryCode].tzAbbr)).toBe(expectLocal);
  });

  it('rolls the UTC calendar day back for early-morning Asia-Pacific releases', () => {
    const jp = zonedTimeToUtc('2026-09-18', '08:30', 'Asia/Tokyo');
    expect(zonedDateKey(jp.getTime(), 'UTC')).toBe('2026-09-17');
    expect(zonedDateKey(jp.getTime(), 'Asia/Tokyo')).toBe('2026-09-18');
    // Same instant is the previous evening in New York.
    expect(zonedDateKey(jp.getTime(), ET_ZONE)).toBe('2026-09-17');
    expect(zonedClock(jp.getTime(), ET_ZONE)).toBe('19:30');
  });

  it('rolls forward for late US releases viewed from Sydney', () => {
    const fomc = zonedTimeToUtc('2026-09-16', '14:00', ET_ZONE);
    expect(zonedDateKey(fomc.getTime(), 'Australia/Sydney')).toBe('2026-09-17');
    expect(zonedClock(fomc.getTime(), 'Australia/Sydney')).toBe('04:00');
  });

  it('handles DST on both hemispheres', () => {
    // UK: BST in September, GMT in December.
    expect(zonedTimeToUtc('2026-09-16', '07:00', 'Europe/London').toISOString()).toBe('2026-09-16T06:00:00.000Z');
    expect(zonedTimeToUtc('2026-12-16', '07:00', 'Europe/London').toISOString()).toBe('2026-12-16T07:00:00.000Z');
    expect(isDaylightSaving(Date.UTC(2026, 8, 16, 6), 'Europe/London')).toBe(true);
    expect(isDaylightSaving(Date.UTC(2026, 11, 16, 7), 'Europe/London')).toBe(false);
    // US: EDT in September, EST in December.
    expect(zonedTimeToUtc('2026-09-11', '08:30', ET_ZONE).toISOString()).toBe('2026-09-11T12:30:00.000Z');
    expect(zonedTimeToUtc('2026-12-10', '08:30', ET_ZONE).toISOString()).toBe('2026-12-10T13:30:00.000Z');
    // Australia: AEST in September, AEDT after the first Sunday of October.
    expect(zonedTimeToUtc('2026-09-30', '11:30', 'Australia/Sydney').toISOString()).toBe('2026-09-30T01:30:00.000Z');
    expect(zonedTimeToUtc('2026-10-28', '11:30', 'Australia/Sydney').toISOString()).toBe('2026-10-28T00:30:00.000Z');
    expect(formatLocalRelease(Date.UTC(2026, 9, 28, 0, 30), 'Australia/Sydney', COUNTRIES.AU.tzAbbr)).toBe('11:30 AEDT');
    // NZ: NZDT from late September.
    expect(zonedTimeToUtc('2026-09-17', '10:45', 'Pacific/Auckland').toISOString()).toBe('2026-09-16T22:45:00.000Z');
    expect(zonedTimeToUtc('2026-10-20', '10:45', 'Pacific/Auckland').toISOString()).toBe('2026-10-19T21:45:00.000Z');
    // Japan / China: no DST.
    expect(isDaylightSaving(Date.UTC(2026, 6, 1), 'Asia/Tokyo')).toBe(false);
    expect(isDaylightSaving(Date.UTC(2026, 6, 1), 'Asia/Shanghai')).toBe(false);
  });

  it('formats countdowns from UTC deltas', () => {
    expect(formatCountdown(NOW + 2 * 86_400_000 + 3 * 3_600_000, NOW)).toBe('2d 3h');
    expect(formatCountdown(NOW + 90 * 60_000, NOW)).toBe('1h 30m');
    expect(formatCountdown(NOW + 5 * 60_000, NOW)).toBe('5m');
    expect(formatCountdown(NOW - 60_000, NOW)).toBe('0m');
  });

  it('rejects malformed local times instead of guessing', () => {
    expect(() => zonedTimeToUtc('2026-09-16', 'noon', 'Asia/Tokyo')).toThrow();
  });
});

// ─── Country registry ────────────────────────────────────────────────────────

describe('country registry', () => {
  it('covers all required countries with currency and timezone', () => {
    expect(ALL_COUNTRIES).toEqual(['US', 'JP', 'EU', 'UK', 'AU', 'CA', 'CN', 'NZ', 'CH', 'KR', 'IN']);
    for (const f of CPI_FIXTURES) {
      expect(COUNTRIES[f.input.countryCode].currency).toBe(f.currency);
      expect(COUNTRIES[f.input.countryCode].timezone).toBe(f.tz);
    }
  });

  it('generates flag emoji at runtime from ISO codes (UK -> GB)', () => {
    expect(countryFlag('JP')).toBe(String.fromCodePoint(0x1f1ef, 0x1f1f5));
    expect(countryFlag('UK')).toBe(String.fromCodePoint(0x1f1ec, 0x1f1e7));
  });

  it('parses country filters with GLOBAL as default', () => {
    expect(parseCountryFilter(null)).toEqual(ALL_COUNTRIES);
    expect(parseCountryFilter('GLOBAL')).toEqual(ALL_COUNTRIES);
    expect(parseCountryFilter('jp,uk')).toEqual(['JP', 'UK']);
    expect(parseCountryFilter('GB')).toEqual(['UK']);
    expect(parseCountryFilter('XX')).toEqual(ALL_COUNTRIES);
  });

  it('maps provider country labels', () => {
    expect(providerCountryToCode('Euro Area')).toBe('EU');
    expect(providerCountryToCode('United Kingdom')).toBe('UK');
    expect(providerCountryToCode('South Korea')).toBe('KR');
    expect(providerCountryToCode('Narnia')).toBeNull();
  });
});

// ─── Indicator registry ──────────────────────────────────────────────────────

describe('indicator registry', () => {
  it('defines the required inflation indicators per country under canonical ids', () => {
    const required = [
      'US_CPI_HEADLINE_YOY', 'US_CPI_HEADLINE_MOM', 'US_CPI_CORE_YOY', 'US_CPI_CORE_MOM', 'US_PCE_HEADLINE_YOY', 'US_PCE_CORE_YOY',
      'JP_CPI_NATIONAL_HEADLINE_YOY', 'JP_CPI_NATIONAL_CORE_YOY', 'JP_CPI_NATIONAL_CORECORE_YOY', 'JP_CPI_TOKYO_HEADLINE_YOY', 'JP_CPI_TOKYO_CORE_YOY', 'JP_CPI_TOKYO_CORECORE_YOY',
      'EU_HICP_FLASH_HEADLINE_YOY', 'EU_HICP_FLASH_CORE_YOY', 'EU_HICP_FINAL_HEADLINE_YOY', 'EU_HICP_FINAL_CORE_YOY',
      'UK_CPI_HEADLINE_YOY', 'UK_CPI_HEADLINE_MOM', 'UK_CPI_CORE_YOY', 'UK_CPI_SERVICES_YOY',
      'AU_CPI_MONTHLY_HEADLINE_YOY', 'AU_CPI_TRIMMED_MEAN_QOQ',
      'CA_CPI_HEADLINE_YOY', 'CA_CPI_MEDIAN_YOY', 'CA_CPI_TRIM_YOY', 'CA_CPI_COMMON_YOY',
      'CN_CPI_HEADLINE_YOY', 'CN_CPI_HEADLINE_MOM', 'CN_PPI_YOY',
      'NZ_CPI_HEADLINE_QOQ', 'NZ_CPI_NONTRADABLE_QOQ',
      'CH_CPI_HEADLINE_YOY', 'KR_CPI_HEADLINE_YOY', 'IN_CPI_HEADLINE_YOY',
    ];
    for (const id of required) {
      const def = getIndicator(id);
      expect(def, id).not.toBeNull();
      expect(def!.id).toBe(id);
      expect(def!.countryCode).toBe(id.slice(0, 2));
      expect(def!.category).toBe('inflation');
      expect(def!.higherMeans).toBe('HAWKISH');
    }
  });

  it('defines every central bank decision as high-impact central_bank', () => {
    for (const id of ['US_FOMC_RATE_DECISION', 'JP_BOJ_RATE_DECISION', 'EU_ECB_RATE_DECISION', 'UK_BOE_RATE_DECISION', 'CA_BOC_RATE_DECISION', 'AU_RBA_RATE_DECISION', 'CN_PBOC_LPR_1Y', 'NZ_RBNZ_OCR_DECISION', 'CH_SNB_RATE_DECISION']) {
      const def = getIndicator(id)!;
      expect(def.category).toBe('central_bank');
      expect(def.importance).toBe('high');
    }
  });

  it('labels Tokyo CPI as the leading inflation signal', () => {
    expect(getIndicator('JP_CPI_TOKYO_HEADLINE_YOY')!.tags).toContain('LEADING INFLATION SIGNAL');
    expect(getIndicator('JP_CPI_NATIONAL_HEADLINE_YOY')!.tags ?? []).not.toContain('LEADING INFLATION SIGNAL');
  });

  it('matches provider labels to canonical ids', () => {
    expect(matchIndicator('JP', 'Tokyo Core CPI YoY', 'Tokyo Core CPI')).toBe('JP_CPI_TOKYO_CORE_YOY');
    expect(matchIndicator('US', 'Core Inflation Rate YoY', 'Core Inflation Rate')).toBe('US_CPI_CORE_YOY');
    expect(matchIndicator('UK', 'Inflation Rate YoY', 'Inflation Rate')).toBe('UK_CPI_HEADLINE_YOY');
    expect(matchIndicator('EU', 'Inflation Rate YoY Flash', 'Inflation Rate')).toBe('EU_HICP_FLASH_HEADLINE_YOY');
    expect(matchIndicator('US', 'Fed Interest Rate Decision', 'Interest Rate')).toBe('US_FOMC_RATE_DECISION');
    expect(matchIndicator('JP', 'Inflation Rate YoY', 'Inflation Rate')).toBe('JP_CPI_NATIONAL_HEADLINE_YOY');
    expect(matchIndicator('JP', 'Core Inflation Rate YoY', 'Core Inflation Rate')).toBe('JP_CPI_NATIONAL_CORE_YOY');
    expect(matchIndicator('CA', 'CPI Median YoY', 'Core Inflation Rate')).toBe('CA_CPI_MEDIAN_YOY');
    expect(matchIndicator('US', '3-Month Bill Auction', '3 Month Bill Yield')).toBeNull();
  });
});

// ─── Surprise engine ─────────────────────────────────────────────────────────

describe('surprise engine', () => {
  const cpi = { higherMeans: 'HAWKISH' as const, unit: '%', surpriseScale: 0.1 };

  it('parses provider strings without inventing values', () => {
    expect(parseProviderNumber('2.9%')).toBe(2.9);
    expect(parseProviderNumber('-0.1%')).toBe(-0.1);
    expect(parseProviderNumber('150K')).toBe(150);
    expect(parseProviderNumber('1,234')).toBe(1234);
    expect(parseProviderNumber('')).toBeNull();
    expect(parseProviderNumber(null)).toBeNull();
    expect(parseProviderNumber('n/a')).toBeNull();
  });

  it('formats values with units', () => {
    expect(formatValue(2.9, '%')).toBe('2.9%');
    expect(formatValue(2.75, '%')).toBe('2.75%');
    expect(formatValue(150, 'K')).toBe('150K');
    expect(formatValue(null, '%')).toBe('--');
  });

  it('higher CPI than consensus is HAWKISH, lower is DOVISH (not bullish/bearish)', () => {
    const hot = computeSurprise({ actual: 2.9, consensus: 2.7, ...cpi })!;
    expect(hot.raw).toBeCloseTo(0.2, 10);
    expect(hot.label).toBe('+0.2pp');
    expect(hot.direction).toBe('ABOVE');
    expect(hot.lean).toBe('HAWKISH');
    expect(hot.normalized).toBe(2);

    const cool = computeSurprise({ actual: 2.5, consensus: 2.7, ...cpi })!;
    expect(cool.label).toBe('-0.2pp');
    expect(cool.lean).toBe('DOVISH');
  });

  it('inverts the reading for indicators where higher is dovish (unemployment)', () => {
    const s = computeSurprise({ actual: 4.4, consensus: 4.2, higherMeans: 'DOVISH', unit: '%', surpriseScale: 0.1 })!;
    expect(s.direction).toBe('ABOVE');
    expect(s.lean).toBe('DOVISH');
  });

  it('marks in-line prints as neutral and handles K units', () => {
    expect(computeSurprise({ actual: 2.7, consensus: 2.7, ...cpi })!.lean).toBe('NEUTRAL');
    expect(computeSurprise({ actual: 2.7, consensus: 2.7, ...cpi })!.label).toBe('in line');
    const nfp = computeSurprise({ actual: 185, consensus: 150, higherMeans: 'HAWKISH', unit: 'K', surpriseScale: 50 })!;
    expect(nfp.label).toBe('+35K');
    expect(nfp.normalized).toBe(0.7);
  });

  it('returns null when actual or consensus is missing — never substitutes a forecast', () => {
    expect(computeSurprise({ actual: null, consensus: 2.7, ...cpi })).toBeNull();
    expect(computeSurprise({ actual: 2.9, consensus: null, ...cpi })).toBeNull();
  });

  it('builds scenario sensitivity for the 12 tracked assets with a disclaimer', () => {
    const hot = computeSurprise({ actual: 2.9, consensus: 2.7, ...cpi });
    const impact = buildAssetImpact({ countryCode: 'US', category: 'inflation', higherMeans: 'HAWKISH', surprise: hot });
    expect(impact.ifAbove).toBe('HAWKISH');
    expect(impact.ifBelow).toBe('DOVISH');
    expect(impact.disclaimer).toMatch(/not a prediction/i);
    const byAsset = Object.fromEntries(impact.realized!.map((r) => [r.asset, r.bias]));
    expect(Object.keys(byAsset).sort()).toEqual(['AUD', 'BTC', 'CAD', 'ETH', 'EUR', 'GBP', 'Gold', 'JPY', 'NQ', 'SPX', 'US10Y', 'USD'].sort());
    expect(byAsset.USD).toBe('SUPPORTIVE');
    expect(byAsset.NQ).toBe('PRESSURE');
    expect(byAsset.Gold).toBe('PRESSURE');
    expect(byAsset.BTC).toBe('PRESSURE');

    const jp = buildAssetImpact({ countryCode: 'JP', category: 'inflation', higherMeans: 'HAWKISH', surprise: hot });
    const jpBy = Object.fromEntries(jp.realized!.map((r) => [r.asset, r.bias]));
    expect(jpBy.JPY).toBe('SUPPORTIVE');
    expect(jpBy.USD).toBe('PRESSURE');
    expect(jp.primary[0]).toBe('JPY');
  });
});

// ─── Normalization ───────────────────────────────────────────────────────────

describe('normalizeEvent', () => {
  it.each(CPI_FIXTURES)('$label produces a complete normalized record', ({ input, expectUtc, expectLocal, currency }) => {
    const e = normalizeEvent(input, { nowUtcMs: NOW })!;
    expect(e).not.toBeNull();
    expect(e.releaseTimeUtc).toBe(expectUtc);
    expect(e.releaseTimeLocal).toBe(expectLocal);
    expect(e.currency).toBe(currency);
    expect(e.category).toBe('inflation');
    expect(e.countryCode).toBe(input.countryCode);
    expect(e.country).toBe(COUNTRIES[input.countryCode].name);
    expect(e.canonicalIndicatorId).toBe(input.canonicalIndicatorId);
    expect(e.canonicalMatched).toBe(true);
    expect(e.referencePeriod).toMatch(/^Aug 20\d\d$/);
    expect(e.source).not.toBe('');
    expect(e.sourceUrl).toMatch(/^https?:\/\//);
    // legacy compatibility
    expect(e.event).toBe(e.eventName);
    expect(e.impact).toBe(e.importance);
    expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(e.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it('maps actual / consensus / previous / revised and computes surprise for released events', () => {
    const e = normalizeEvent(raw('JP', 'JP_CPI_NATIONAL_HEADLINE_YOY', '2026-09-11', '08:30', {
      actual: 2.9, consensus: 2.7, previous: 2.8, revisedPrevious: null, providerForecast: 2.75, lastUpdated: new Date(NOW - 60_000).toISOString(),
    }), { nowUtcMs: NOW })!;
    expect(e.isReleased).toBe(true);
    expect(e.actual).toBe(2.9);
    expect(e.consensus).toBe(2.7);
    expect(e.previous).toBe(2.8);
    expect(e.providerForecast).toBe(2.75);
    expect(e.surprise?.label).toBe('+0.2pp');
    expect(e.surprise?.lean).toBe('HAWKISH');
    expect(e.display).toEqual({ actual: '2.9%', previous: '2.8%', consensus: '2.7%', surprise: '+0.2pp' });
    expect(e.forecast).toBe('2.7%');
    expect(e.dataStatus).toBe('LIVE');
  });

  it('prefers the revised previous for display but keeps the original', () => {
    const e = normalizeEvent(raw('US', 'US_NFP', '2026-09-04', '08:30', { actual: 150, consensus: 160, previous: 73, revisedPrevious: 79, lastUpdated: new Date(NOW).toISOString() }), { nowUtcMs: NOW })!;
    expect(e.previous).toBe(73);
    expect(e.revisedPrevious).toBe(79);
    expect(e.display.previous).toBe('79K');
  });

  it('never computes a surprise before the release time even if a consensus exists', () => {
    const e = normalizeEvent(raw('UK', 'UK_CPI_HEADLINE_YOY', '2026-10-21', '07:00', { consensus: 3.1, actual: 3.4 }), { nowUtcMs: NOW })!;
    expect(e.isReleased).toBe(false);
    expect(e.surprise).toBeNull();
  });

  it('tags Tokyo CPI as LEADING INFLATION SIGNAL', () => {
    const e = normalizeEvent(raw('JP', 'JP_CPI_TOKYO_CORE_YOY', '2026-09-25', '08:30'), { nowUtcMs: NOW })!;
    expect(e.tags).toContain('LEADING INFLATION SIGNAL');
  });
});

describe('data-quality status', () => {
  const fresh = new Date(NOW - 5 * 60_000).toISOString();
  const old = new Date(NOW - 30 * 3_600_000).toISOString();

  it('UNCONFIRMED for upcoming events with estimated timing', () => {
    const e = normalizeEvent(raw('AU', 'AU_RBA_RATE_DECISION', '2026-09-29', '14:30', { timingStatus: 'ESTIMATED', consensus: 3.6 }), { nowUtcMs: NOW })!;
    expect(e.dataStatus).toBe('UNCONFIRMED');
  });

  it('MISSING consensus for upcoming confirmed events without a forecast', () => {
    const e = normalizeEvent(raw('US', 'US_FOMC_RATE_DECISION', '2026-10-28', '14:00'), { nowUtcMs: NOW })!;
    expect(e.dataStatus).toBe('MISSING');
    expect(e.statusDetail).toMatch(/consensus/i);
  });

  it('LIVE / STALE for upcoming events depending on consensus freshness', () => {
    expect(normalizeEvent(raw('US', 'US_CPI_HEADLINE_YOY', '2026-10-13', '08:30', { consensus: 2.8, lastUpdated: fresh }), { nowUtcMs: NOW })!.dataStatus).toBe('LIVE');
    expect(normalizeEvent(raw('US', 'US_CPI_HEADLINE_YOY', '2026-10-13', '08:30', { consensus: 2.8, lastUpdated: old }), { nowUtcMs: NOW })!.dataStatus).toBe('STALE');
  });

  it('DELAYED within 6h of a passed release with no actual, MISSING after', () => {
    const twoHoursAgo = normalizeEvent(raw('UK', 'UK_CPI_HEADLINE_YOY', '2026-09-16', '11:00', { consensus: 3.2 }), { nowUtcMs: NOW })!; // 10:00Z
    expect(twoHoursAgo.isReleased).toBe(true);
    expect(twoHoursAgo.dataStatus).toBe('DELAYED');
    expect(twoHoursAgo.display.actual).toBe('--');

    const yesterday = normalizeEvent(raw('CA', 'CA_CPI_HEADLINE_YOY', '2026-09-15', '08:30', { consensus: 2.0 }), { nowUtcMs: NOW })!;
    expect(yesterday.dataStatus).toBe('MISSING');
    expect(yesterday.surprise).toBeNull();
  });

  it('STALE when a received actual has not been refreshed in 24h', () => {
    const e = normalizeEvent(raw('CN', 'CN_CPI_HEADLINE_YOY', '2026-09-09', '09:30', { actual: 0.4, consensus: 0.3, lastUpdated: old }), { nowUtcMs: NOW })!;
    expect(e.dataStatus).toBe('STALE');
    expect(e.surprise?.label).toBe('+0.1pp');
  });
});

// ─── Filtering / countdown ───────────────────────────────────────────────────

describe('filtering, countdown and danger window', () => {
  const events = normalizeAll([
    raw('US', 'US_CPI_HEADLINE_YOY', '2026-10-13', '08:30', { referencePeriod: 'Sep' }),   // 12:30Z Oct 13, high
    raw('JP', 'JP_CPI_NATIONAL_HEADLINE_YOY', '2026-09-18', '08:30'),                       // 23:30Z Sep 17, high
    raw('JP', 'JP_JIBUN_MFG_PMI_FLASH', '2026-09-24', '09:30', { referencePeriod: 'Sep' }), // medium
    raw('UK', 'UK_BOE_RATE_DECISION', '2026-09-17', '12:00', { referencePeriod: 'Sep' }),   // 11:00Z Sep 17, high
    raw('NZ', 'NZ_GDP_QOQ', '2026-09-17', '10:45', { referencePeriod: 'Q2' }),              // 22:45Z Sep 16, high — earliest
    raw('CA', 'CA_CPI_COMMON_YOY', '2026-10-20', '08:30', { referencePeriod: 'Sep' }),      // low
    raw('US', 'US_FOMC_RATE_DECISION', '2026-09-16', '14:00', { referencePeriod: 'Sep' }),  // 18:00Z Sep 16, high — after NOW (12:00Z) → earliest
  ], { nowUtcMs: NOW });

  it('filters by country', () => {
    expect(filterEvents(events, { countries: ['JP'] }).every((e) => e.countryCode === 'JP')).toBe(true);
    expect(filterEvents(events, { countries: ['JP'] })).toHaveLength(2);
    expect(filterEvents(events, { countries: ALL_COUNTRIES })).toHaveLength(events.length);
    expect(filterEvents(events, { countries: [] })).toHaveLength(events.length);
  });

  it('filters by impact', () => {
    expect(filterEvents(events, { importance: 'high' }).every((e) => e.importance === 'high')).toBe(true);
    expect(filterEvents(events, { minImportance: 'medium' }).some((e) => e.importance === 'low')).toBe(false);
    expect(filterEvents(events, { importance: 'all' })).toHaveLength(events.length);
  });

  it('filters by category', () => {
    expect(filterEvents(events, { categories: ['central_bank'] }).map((e) => e.canonicalIndicatorId).sort()).toEqual(['UK_BOE_RATE_DECISION', 'US_FOMC_RATE_DECISION']);
  });

  it('selects the earliest upcoming HIGH event globally, not the next US event', () => {
    const global = selectNextMajorEvent(events, NOW)!;
    expect(global.canonicalIndicatorId).toBe('US_FOMC_RATE_DECISION'); // 18:00Z today
    // After the FOMC: NZ GDP (22:45Z Sep 16) → BoE (11:00Z Sep 17) → Japan CPI (23:30Z Sep 17) → US CPI (Oct 13).
    const afterFomc = selectNextMajorEvent(events, Date.UTC(2026, 8, 16, 18, 1))!;
    expect(afterFomc.countryCode).toBe('NZ');
    const afterNz = selectNextMajorEvent(events, Date.UTC(2026, 8, 16, 23, 0))!;
    expect(afterNz.canonicalIndicatorId).toBe('UK_BOE_RATE_DECISION');
    const afterBoe = selectNextMajorEvent(events, Date.UTC(2026, 8, 17, 12, 0))!;
    expect(afterBoe.canonicalIndicatorId).toBe('JP_CPI_NATIONAL_HEADLINE_YOY');
    expect(afterBoe.countryCode).toBe('JP');
    const afterJp = selectNextMajorEvent(events, Date.UTC(2026, 8, 18, 0, 0))!;
    expect(afterJp.canonicalIndicatorId).toBe('US_CPI_HEADLINE_YOY');
    expect(afterJp.countryCode).toBe('US');
  });

  it('respects the enabled-country scope for the countdown', () => {
    expect(selectNextMajorEvent(events, NOW, ['US'])!.canonicalIndicatorId).toBe('US_FOMC_RATE_DECISION');
    expect(selectNextMajorEvent(events, NOW, ['UK'])!.canonicalIndicatorId).toBe('UK_BOE_RATE_DECISION');
    expect(selectNextMajorEvent(events, NOW, ['CA'])).toBeNull(); // CA event is low impact
  });

  it('skips medium/low events and past events', () => {
    const onlyMedium = normalizeAll([raw('JP', 'JP_JIBUN_MFG_PMI_FLASH', '2026-09-24', '09:30')], { nowUtcMs: NOW });
    expect(selectNextMajorEvent(onlyMedium, NOW)).toBeNull();
    expect(selectNextMajorEvent(events, Date.UTC(2027, 0, 1))).toBeNull();
  });

  it('applies a symmetric T-30 / T+30 danger window', () => {
    expect(HIGH_IMPACT_DANGER_WINDOW.label).toBe('T-30 → T+30');
    const fomc = events.find((e) => e.canonicalIndicatorId === 'US_FOMC_RATE_DECISION')!;
    const t = Date.parse(fomc.releaseTimeUtc);
    expect(isInsideDangerWindow(fomc, t - 31 * 60_000)).toBe(false);
    expect(isInsideDangerWindow(fomc, t - 30 * 60_000)).toBe(true);
    expect(isInsideDangerWindow(fomc, t + 30 * 60_000)).toBe(true);
    expect(isInsideDangerWindow(fomc, t + 31 * 60_000)).toBe(false);
  });

  it('sorts normalized events by UTC release time', () => {
    const times = events.map((e) => Date.parse(e.releaseTimeUtc));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

// ─── Japan / BoJ context ─────────────────────────────────────────────────────

describe('BoJ sensitivity context', () => {
  it('reads the inflation trend only from released actuals and flags Tokyo CPI as leading', () => {
    const fresh = new Date(NOW - 60_000).toISOString();
    const events = normalizeAll([
      raw('JP', 'JP_CPI_TOKYO_CORE_YOY', '2026-08-28', '08:30', { actual: 2.6, previous: 2.4, consensus: 2.5, lastUpdated: fresh }),
      raw('JP', 'JP_CPI_NATIONAL_CORE_YOY', '2026-08-21', '08:30', { referencePeriod: 'Jul', actual: 2.8, previous: 2.7, consensus: 2.8, lastUpdated: fresh }),
      raw('JP', 'JP_CASH_EARNINGS_YOY', '2026-09-07', '08:30', { referencePeriod: 'Jul', actual: 3.0, previous: 2.5, lastUpdated: fresh }),
      raw('JP', 'JP_BOJ_RATE_DECISION', '2026-09-18', '12:00', { referencePeriod: 'Sep', timingStatus: 'TENTATIVE' }),
      raw('JP', 'JP_CPI_TOKYO_CORE_YOY', '2026-09-25', '08:30', { referencePeriod: 'Sep' }),
    ], { nowUtcMs: NOW });
    const ctx = buildBojContext(events, NOW);
    expect(ctx.inflationTrend).toBe('RISING');
    expect(ctx.lean).toBe('HAWKISH');
    expect(ctx.tokyoCpi?.actual).toBe(2.6);
    expect(ctx.nationalCpi?.actual).toBe(2.8);
    expect(ctx.wages?.actual).toBe(3.0);
    expect(ctx.nextBojDecision?.eventName).toBe('BoJ Interest Rate Decision');
    expect(ctx.nextBojDecision?.timingConfirmed).toBe(false);
    expect(ctx.notes.join(' ')).toMatch(/leading inflation signal/i);
  });

  it('reports UNKNOWN when no actuals are available instead of inferring from consensus', () => {
    const events = normalizeAll([
      raw('JP', 'JP_CPI_TOKYO_CORE_YOY', '2026-09-25', '08:30', { referencePeriod: 'Sep', consensus: 2.7 }),
      raw('JP', 'JP_CPI_NATIONAL_CORE_YOY', '2026-09-18', '08:30', { consensus: 2.9 }),
    ], { nowUtcMs: NOW });
    const ctx = buildBojContext(events, NOW);
    expect(ctx.inflationTrend).toBe('UNKNOWN');
    expect(ctx.lean).toBe('UNKNOWN');
  });
});

// ─── Curated seed ────────────────────────────────────────────────────────────

describe('curated seed', () => {
  it('normalizes every curated row and covers all countries', () => {
    const events = normalizeAll(CURATED_EVENTS, { nowUtcMs: NOW });
    expect(events.length).toBe(CURATED_EVENTS.length);
    const countries = new Set(events.map((e) => e.countryCode));
    for (const cc of ALL_COUNTRIES) expect(countries.has(cc), cc).toBe(true);
  });

  it('includes the required global central banks and inflation prints in the Sep-Dec 2026 window', () => {
    const events = normalizeAll(CURATED_EVENTS, { nowUtcMs: NOW }).filter((e) => e.releaseTimeUtc >= '2026-09-16' && e.releaseTimeUtc < '2027-01-01');
    const ids = new Set(events.map((e) => e.canonicalIndicatorId));
    for (const k of ['US_FOMC_RATE_DECISION', 'JP_BOJ_RATE_DECISION', 'EU_ECB_RATE_DECISION', 'UK_BOE_RATE_DECISION', 'CA_BOC_RATE_DECISION', 'AU_RBA_RATE_DECISION', 'CN_PBOC_LPR_1Y', 'NZ_RBNZ_OCR_DECISION', 'CH_SNB_RATE_DECISION',
      'US_CPI_HEADLINE_YOY', 'JP_CPI_NATIONAL_HEADLINE_YOY', 'JP_CPI_TOKYO_HEADLINE_YOY', 'EU_HICP_FLASH_HEADLINE_YOY', 'UK_CPI_HEADLINE_YOY', 'AU_CPI_MONTHLY_HEADLINE_YOY', 'CA_CPI_HEADLINE_YOY', 'CN_CPI_HEADLINE_YOY', 'NZ_CPI_HEADLINE_QOQ']) {
      expect(ids.has(k), k).toBe(true);
    }
  });

  it('uses the Fed-published 2026 FOMC decision dates', () => {
    const fomc = CURATED_EVENTS.filter((e) => e.canonicalIndicatorId === 'US_FOMC_RATE_DECISION').map((e) => e.localDate);
    expect(fomc).toEqual(['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09']);
    expect(fomc).not.toContain('2026-11-04');
  });

  it('uses the BEA/BLS/Census/Fed published US dates for Sep-Dec 2026 (PCE was listed on Sep 25, BEA says Sep 30)', () => {
    const datesOf = (id: string) => CURATED_EVENTS
      .filter((e) => e.canonicalIndicatorId === id && e.localDate >= '2026-09-16' && e.localDate < '2027-01-01')
      .map((e) => e.localDate);
    // BEA release schedule (bea.gov/news/schedule): Personal Income and Outlays + GDP.
    expect(datesOf('US_PCE_HEADLINE_YOY')).toEqual(['2026-09-30', '2026-10-29', '2026-11-25', '2026-12-23']);
    expect(datesOf('US_PCE_CORE_YOY')).toEqual(['2026-09-30', '2026-10-29', '2026-11-25', '2026-12-23']);
    expect(datesOf('US_PCE_CORE_MOM')).toEqual(['2026-09-30']);
    expect(datesOf('US_GDP_QOQ_FINAL')).toEqual(['2026-09-30', '2026-12-23']);
    expect(datesOf('US_GDP_QOQ_ADVANCE')).toEqual(['2026-10-29']);
    expect(datesOf('US_GDP_QOQ_SECOND')).toEqual(['2026-11-25']);
    // BLS schedules (CPI, Employment Situation).
    for (const id of ['US_CPI_HEADLINE_YOY', 'US_CPI_HEADLINE_MOM', 'US_CPI_CORE_YOY', 'US_CPI_CORE_MOM']) {
      expect(datesOf(id), id).toEqual(['2026-10-14', '2026-11-10', '2026-12-10']);
    }
    expect(datesOf('US_NFP')).toEqual(['2026-10-02', '2026-11-06', '2026-12-04']);
    // Census advance retail sales.
    expect(datesOf('US_RETAIL_SALES_MOM')).toEqual(['2026-09-16', '2026-10-15', '2026-11-17', '2026-12-16']);
    // Official-schedule rows are CONFIRMED at 08:30 ET; nothing US high-impact left on Fri Sep 25.
    const pce = CURATED_EVENTS.filter((e) => e.canonicalIndicatorId.startsWith('US_PCE_') && e.localDate >= '2026-09-16');
    expect(pce.every((e) => e.timingStatus === 'CONFIRMED' && e.sourceAuthority === 'OFFICIAL' && e.localTime === '08:30')).toBe(true);
    expect(CURATED_EVENTS.filter((e) => e.countryCode === 'US' && e.localDate === '2026-09-25')).toEqual([]);
    const aug = normalizeEvent(CURATED_EVENTS.find((e) => e.canonicalIndicatorId === 'US_PCE_HEADLINE_YOY' && e.localDate === '2026-09-30')!, { nowUtcMs: NOW })!;
    expect(aug.releaseTimeUtc).toBe('2026-09-30T12:30:00.000Z'); // 08:30 EDT
  });

  it('marks estimated rows as unconfirmed so the UI cannot present them as scheduled', () => {
    const estimated = CURATED_EVENTS.filter((e) => e.timingStatus === 'ESTIMATED');
    expect(estimated.length).toBeGreaterThan(0);
    expect(estimated.every((e) => typeof e.timingNote === 'string' && e.timingNote.length > 0)).toBe(true);
    expect(estimated.every((e) => e.sourceAuthority === 'CURATED')).toBe(true);
    const e = normalizeEvent(CURATED_EVENTS.find((r) => r.canonicalIndicatorId === 'AU_RBA_RATE_DECISION' && r.localDate > '2026-09-16')!, { nowUtcMs: NOW })!;
    expect(e.dataStatus).toBe('UNCONFIRMED');
    expect(e.timingStatus).toBe('ESTIMATED');
  });
});

// ─── Provider adapter ────────────────────────────────────────────────────────

describe('Trading Economics adapter', () => {
  afterEach(() => {
    __clearTradingEconomicsCache();
    delete process.env.TRADING_ECONOMICS_API_KEY;
    vi.restoreAllMocks();
  });

  const teRow = {
    CalendarId: '1',
    Date: '2026-09-17T23:30:00',
    Country: 'Japan',
    Category: 'Inflation Rate',
    Event: 'Inflation Rate YoY',
    Reference: 'Aug',
    Source: 'Ministry of Internal Affairs & Communications',
    SourceURL: 'https://www.stat.go.jp',
    Actual: '2.9%',
    Previous: '2.8%',
    Forecast: '2.7%',
    TEForecast: '2.75%',
    Revised: '',
    DateSpan: '0',
    Importance: 3,
    LastUpdate: '2026-09-17T23:31:00',
    Currency: '',
    Unit: '%',
  };

  it('maps rows to the normalized input model (UTC, numeric values, canonical id)', () => {
    const input = mapTradingEconomicsRow(teRow, new Date(NOW).toISOString())!;
    expect(input.providerId).toBe('trading-economics');
    expect(input.countryCode).toBe('JP');
    expect(input.canonicalIndicatorId).toBe('JP_CPI_NATIONAL_HEADLINE_YOY');
    expect(input.releaseTimeUtc).toBe('2026-09-17T23:30:00.000Z');
    expect(input.actual).toBe(2.9);
    expect(input.previous).toBe(2.8);
    expect(input.consensus).toBe(2.7);
    expect(input.providerForecast).toBe(2.75);
    expect(input.timingStatus).toBe('CONFIRMED');
    expect(input.sourceAuthority).toBe('PROVIDER');
    expect(input.importance).toBe('high');
    expect(input.sourceUrl).toBe('https://www.stat.go.jp');

    const normalized = normalizeEvent(input, { nowUtcMs: Date.UTC(2026, 8, 18, 0, 0) })!;
    expect(normalized.releaseTimeLocal).toBe('08:30 JST');
    expect(normalized.referencePeriod).toBe('Aug 2026');
    expect(normalized.surprise?.label).toBe('+0.2pp');
    expect(normalized.surprise?.lean).toBe('HAWKISH');
  });

  it('handles revisions, estimated timing and unmatched events', () => {
    const input = mapTradingEconomicsRow({ ...teRow, Country: 'United States', Event: 'Non Farm Payrolls', Category: 'Non Farm Payrolls', Actual: '150K', Previous: '79K', Revised: '73K', Forecast: '160K', Unit: 'K', DateSpan: '1' }, new Date(NOW).toISOString())!;
    expect(input.canonicalIndicatorId).toBe('US_NFP');
    expect(input.previous).toBe(73);
    expect(input.revisedPrevious).toBe(79);
    expect(input.timingStatus).toBe('ESTIMATED');

    const unmatched = mapTradingEconomicsRow({ ...teRow, Country: 'United States', Event: '3-Month Bill Auction', Category: '3 Month Bill Yield', Importance: 1 }, new Date(NOW).toISOString())!;
    expect(unmatched.canonicalIndicatorId).toBe('US_UNMAPPED_3_MONTH_BILL_AUCTION');
    expect(unmatched.eventName).toBe('3-Month Bill Auction');
    expect(unmatched.importance).toBe('low');
  });

  it('drops rows with missing essentials or unknown countries', () => {
    expect(mapTradingEconomicsRow({ ...teRow, Date: '' }, new Date(NOW).toISOString())).toBeNull();
    expect(mapTradingEconomicsRow({ ...teRow, Country: 'Atlantis' }, new Date(NOW).toISOString())).toBeNull();
  });

  it('reports NOT_CONFIGURED without a key and never calls the network', async () => {
    const fetchImpl = vi.fn();
    expect(tradingEconomicsProvider.isConfigured()).toBe(false);
    const res = await tradingEconomicsProvider.getEvents({ countries: ['JP'], fromUtcMs: NOW, toUtcMs: NOW + 30 * 86_400_000, nowMs: NOW, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.status).toBe('NOT_CONFIGURED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('serves cached data as STALE when a refresh fails', async () => {
    process.env.TRADING_ECONOMICS_API_KEY = 'test-key';
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => [teRow] });
    const query = { countries: ['JP'] as CountryCode[], fromUtcMs: NOW, toUtcMs: NOW + 30 * 86_400_000, nowMs: NOW };
    const first = await tradingEconomicsProvider.getEvents({ ...query, fetchImpl: ok as unknown as typeof fetch });
    expect(first.status).toBe('LIVE');
    expect(first.inputs).toHaveLength(1);
    expect(String(ok.mock.calls[0][0])).toContain('/calendar/country/japan/2026-09-16/2026-10-16');

    const fail = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    const later = await tradingEconomicsProvider.getEvents({ ...query, nowMs: NOW + 11 * 60_000, fetchImpl: fail as unknown as typeof fetch });
    expect(later.status).toBe('STALE');
    expect(later.error).toMatch(/429/);
    expect(later.inputs).toHaveLength(1);
  });
});

// ─── Merge / feed ────────────────────────────────────────────────────────────

const ORDER: ProviderId[] = ['trading-economics', 'eodhd', 'curated'];

function curatedRow(id: string, localDate: string, localTime: string, extra: Partial<RawCalendarInput> = {}): RawCalendarInput {
  return { providerId: 'curated', countryCode: id.slice(0, 2) as CountryCode, canonicalIndicatorId: id, localDate, localTime, referencePeriod: 'Aug', timingStatus: 'ESTIMATED', sourceAuthority: 'CURATED', providerStatus: 'FALLBACK', ...extra };
}

describe('feed assembly', () => {
  it('lets provider rows supply values for the same canonical identity while curated keeps unmatched rows', () => {
    const curated = [curatedRow('JP_CPI_NATIONAL_HEADLINE_YOY', '2026-09-18', '08:30'), curatedRow('UK_CPI_HEADLINE_YOY', '2026-09-16', '07:00')];
    const provider = [raw('JP', 'JP_CPI_NATIONAL_HEADLINE_YOY', '2026-09-18', '08:30', { consensus: 2.7, releaseTimeUtc: '2026-09-17T23:30:00.000Z' })];
    const { merged } = mergeInputs([...provider, ...curated], ORDER);
    expect(merged).toHaveLength(2);
    const jp = merged.find((m) => m.countryCode === 'JP')!;
    expect(jp.consensus).toBe(2.7);
    expect(jp.contributors).toEqual(['trading-economics', 'curated']);
    expect(merged.find((m) => m.countryCode === 'UK')!.providerId).toBe('curated');
  });

  it('keeps curated rows for countries the provider did not return', () => {
    const curated = [curatedRow('AU_RBA_RATE_DECISION', '2026-09-29', '14:30', { referencePeriod: 'Sep' })];
    const provider = [raw('JP', 'JP_BOJ_RATE_DECISION', '2026-09-18', '12:00', { referencePeriod: 'Sep' })];
    expect(mergeInputs([...provider, ...curated], ORDER).merged).toHaveLength(2);
  });

  it('builds a curated-only feed with global countdown and Japan context when no provider is configured', async () => {
    delete process.env.TRADING_ECONOMICS_API_KEY;
    delete process.env.EODHD_API_KEY;
    const feed = await buildCalendarFeed({ nowMs: NOW, days: 14, countries: ALL_COUNTRIES });
    expect(feed.meta.provider).toBe('curated');
    expect(feed.meta.providerStatus).toBe('NOT_CONFIGURED');
    expect(feed.meta.providers.map((p) => p.id)).toEqual(['trading-economics', 'eodhd', 'curated']);
    expect(feed.events.length).toBeGreaterThan(20);
    expect(new Set(feed.events.map((e) => e.countryCode)).size).toBeGreaterThan(5);
    expect(feed.nextMajorEvent).not.toBeNull();
    expect(feed.nextMajorEvent!.importance).toBe('high');
    expect(Date.parse(feed.nextMajorEvent!.releaseTimeUtc)).toBeGreaterThan(NOW);
    expect(feed.regionalContext.japan.tokyoCpi).not.toBeNull();
    // Every event carries attribution + freshness fields.
    for (const e of feed.events) {
      expect(e.source.length).toBeGreaterThan(0);
      expect(['LIVE', 'DELAYED', 'STALE', 'MISSING', 'UNCONFIRMED']).toContain(e.dataStatus);
      expect(e.lastUpdated).toBeTruthy();
    }
  });

  it('honours the country scope end-to-end', async () => {
    const feed = await buildCalendarFeed({ nowMs: NOW, days: 30, countries: ['JP'] });
    expect(feed.events.every((e) => e.countryCode === 'JP')).toBe(true);
    expect(feed.nextMajorEvent?.countryCode).toBe('JP');
  });
});
