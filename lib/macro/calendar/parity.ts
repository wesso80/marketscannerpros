import { COUNTRIES } from './countries';
import { isUnmappedIndicator } from './indicators';
import { releaseMsOf } from './merge';
import { normalizeReferencePeriod } from './referencePeriod';
import { getZonedParts } from './time';
import type { CountryCode, ProviderId, RawCalendarInput } from './types';

/**
 * Development-only provider parity report.
 *
 * Baseline = curated seed ("expected"). Each live provider is compared on the
 * canonical identity (indicator + country + reference period). No provider is
 * promoted to production-primary until this report has been reviewed.
 */

export interface ParityDiff {
  key: string;
  field: 'timing' | 'actual' | 'previous' | 'importance';
  baseline: string;
  provider: string;
  /** Timing only, in minutes. */
  deltaMinutes?: number;
}

export interface ProviderParity {
  providerId: ProviderId;
  status: string;
  error: string | null;
  eventsExpected: number;
  eventsFromProvider: number;
  eventsMatched: number;
  /** Curated identities the provider did not return. */
  missing: string[];
  /** Provider identities absent from curated (mapped + unmapped counted separately). */
  extraMapped: string[];
  extraUnmappedCount: number;
  timingDifferences: ParityDiff[];
  actualDifferences: ParityDiff[];
  previousDifferences: ParityDiff[];
  importanceDifferences: ParityDiff[];
  consensusCoverage: { withConsensus: number; total: number; pct: number };
  countryCoverage: Record<CountryCode, { expected: number; matched: number; fromProvider: number }>;
  /** Curated indicators that were required but the provider never produced (any period). */
  indicatorGaps: string[];
}

export interface ParityReport {
  windowFromUtc: string;
  windowToUtc: string;
  generatedAt: string;
  countries: CountryCode[];
  providers: ProviderParity[];
}

interface Keyed {
  key: string;
  input: RawCalendarInput;
  releaseMs: number;
}

function keyOf(input: RawCalendarInput): Keyed {
  const releaseMs = releaseMsOf(input);
  const local = getZonedParts(releaseMs, COUNTRIES[input.countryCode].timezone);
  const period = normalizeReferencePeriod(input.referencePeriod, { year: local.year, month: local.month });
  return { key: `${input.countryCode}|${input.canonicalIndicatorId}|${period ?? '?'}`, input, releaseMs };
}

function emptyCountryCoverage(countries: CountryCode[]): ProviderParity['countryCoverage'] {
  const out = {} as ProviderParity['countryCoverage'];
  for (const c of countries) out[c] = { expected: 0, matched: 0, fromProvider: 0 };
  return out;
}

export function compareProvider(args: {
  providerId: ProviderId;
  status: string;
  error: string | null;
  baseline: RawCalendarInput[];
  provider: RawCalendarInput[];
  countries: CountryCode[];
}): ProviderParity {
  const base = args.baseline.map(keyOf);
  const prov = args.provider.map(keyOf);
  const provByKey = new Map(prov.map((k) => [k.key, k]));
  const baseKeys = new Set(base.map((k) => k.key));

  const coverage = emptyCountryCoverage(args.countries);
  for (const b of base) if (coverage[b.input.countryCode]) coverage[b.input.countryCode].expected++;
  for (const p of prov) if (coverage[p.input.countryCode]) coverage[p.input.countryCode].fromProvider++;

  const missing: string[] = [];
  const timingDifferences: ParityDiff[] = [];
  const actualDifferences: ParityDiff[] = [];
  const previousDifferences: ParityDiff[] = [];
  const importanceDifferences: ParityDiff[] = [];
  let matched = 0;

  for (const b of base) {
    const p = provByKey.get(b.key);
    if (!p) {
      missing.push(b.key);
      continue;
    }
    matched++;
    if (coverage[b.input.countryCode]) coverage[b.input.countryCode].matched++;
    const deltaMinutes = Math.round((p.releaseMs - b.releaseMs) / 60_000);
    if (Math.abs(deltaMinutes) >= 1) {
      timingDifferences.push({ key: b.key, field: 'timing', baseline: new Date(b.releaseMs).toISOString(), provider: new Date(p.releaseMs).toISOString(), deltaMinutes });
    }
    if (b.input.actual != null && p.input.actual != null && b.input.actual !== p.input.actual) {
      actualDifferences.push({ key: b.key, field: 'actual', baseline: String(b.input.actual), provider: String(p.input.actual) });
    }
    if (b.input.previous != null && p.input.previous != null && b.input.previous !== p.input.previous) {
      previousDifferences.push({ key: b.key, field: 'previous', baseline: String(b.input.previous), provider: String(p.input.previous) });
    }
    if (b.input.importance && p.input.importance && b.input.importance !== p.input.importance) {
      importanceDifferences.push({ key: b.key, field: 'importance', baseline: b.input.importance, provider: p.input.importance });
    }
  }

  const extraMapped: string[] = [];
  let extraUnmappedCount = 0;
  for (const p of prov) {
    if (baseKeys.has(p.key)) continue;
    if (isUnmappedIndicator(p.input.canonicalIndicatorId)) extraUnmappedCount++;
    else extraMapped.push(p.key);
  }

  const withConsensus = prov.filter((p) => p.input.consensus != null).length;
  const baselineIndicators = new Set(base.map((b) => `${b.input.countryCode}|${b.input.canonicalIndicatorId}`));
  const providerIndicators = new Set(prov.map((p) => `${p.input.countryCode}|${p.input.canonicalIndicatorId}`));
  const indicatorGaps = [...baselineIndicators].filter((k) => !providerIndicators.has(k)).sort();

  return {
    providerId: args.providerId,
    status: args.status,
    error: args.error,
    eventsExpected: base.length,
    eventsFromProvider: prov.length,
    eventsMatched: matched,
    missing: missing.sort(),
    extraMapped: extraMapped.sort(),
    extraUnmappedCount,
    timingDifferences,
    actualDifferences,
    previousDifferences,
    importanceDifferences,
    consensusCoverage: { withConsensus, total: prov.length, pct: prov.length ? Math.round((withConsensus / prov.length) * 100) : 0 },
    countryCoverage: coverage,
    indicatorGaps,
  };
}

export function formatParityReport(report: ParityReport): string {
  const lines: string[] = [];
  lines.push(`Calendar provider parity — ${report.windowFromUtc.slice(0, 10)} → ${report.windowToUtc.slice(0, 10)} (generated ${report.generatedAt})`);
  lines.push(`Countries: ${report.countries.join(', ')}`);
  for (const p of report.providers) {
    lines.push('');
    lines.push(`== ${p.providerId} [${p.status}]${p.error ? ` error: ${p.error}` : ''}`);
    lines.push(`  events expected (curated): ${p.eventsExpected}`);
    lines.push(`  events from provider:      ${p.eventsFromProvider}`);
    lines.push(`  events matched:            ${p.eventsMatched}`);
    lines.push(`  missing events:            ${p.missing.length}`);
    lines.push(`  extra events (mapped):     ${p.extraMapped.length}`);
    lines.push(`  extra events (unmapped):   ${p.extraUnmappedCount}`);
    lines.push(`  timing differences:        ${p.timingDifferences.length}`);
    lines.push(`  actual differences:        ${p.actualDifferences.length}`);
    lines.push(`  previous differences:      ${p.previousDifferences.length}`);
    lines.push(`  importance differences:    ${p.importanceDifferences.length}`);
    lines.push(`  consensus coverage:        ${p.consensusCoverage.withConsensus}/${p.consensusCoverage.total} (${p.consensusCoverage.pct}%)`);
    lines.push('  country coverage:');
    for (const [cc, c] of Object.entries(p.countryCoverage)) {
      lines.push(`    ${cc}: expected ${c.expected}, matched ${c.matched}, provider ${c.fromProvider}`);
    }
    if (p.indicatorGaps.length) {
      lines.push(`  indicator gaps (${p.indicatorGaps.length}):`);
      for (const g of p.indicatorGaps) lines.push(`    - ${g}`);
    }
    if (p.timingDifferences.length) {
      lines.push('  timing differences (first 20):');
      for (const d of p.timingDifferences.slice(0, 20)) lines.push(`    - ${d.key}: curated ${d.baseline} vs provider ${d.provider} (${d.deltaMinutes}m)`);
    }
  }
  return lines.join('\n');
}
