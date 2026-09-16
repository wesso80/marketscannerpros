import { logger } from '../../logger';
import { mergeInputs } from './merge';
import { buildBojContext, filterEvents, normalizeAll, selectNextMajorEvent } from './normalize';
import { CURATED_COVERAGE_WARNING, curatedCoverage } from './providers/curated';
import { getProvider, resolveProviderOrder, type ProviderCalendarResult } from './providers';
import { DEFAULT_FOCUS_ASSETS, selectNextRelevantEvent } from './relevance';
import type { AssetTag, BojContext, CalendarEvent, CalendarFeedMeta, CountryCode, Importance, ProviderHealth, ProviderId, RelevanceScore } from './types';

export interface BuildFeedArgs {
  nowMs: number;
  days: number;
  countries: CountryCode[];
  importance?: Importance | 'all';
  /** Include events released up to this many hours ago (so today's prints keep their actuals visible). */
  lookbackHours?: number;
  /** Assets used for the market-relevant countdown. */
  focusAssets?: AssetTag[];
  /** Override provider precedence (tests / parity script). */
  providerOrder?: ProviderId[];
  fetchImpl?: typeof fetch;
}

export interface CalendarFeed {
  events: CalendarEvent[];
  /** Earliest upcoming HIGH event across enabled countries. */
  nextMajorEvent: CalendarEvent | null;
  /** Highest-relevance upcoming HIGH event for the focus assets (may equal nextMajorEvent). */
  nextRelevantEvent: { event: CalendarEvent; relevance: RelevanceScore } | null;
  focusAssets: AssetTag[];
  regionalContext: { japan: BojContext };
  meta: CalendarFeedMeta;
  dateRange: { fromUtc: string; toUtc: string };
}

function toHealth(r: ProviderCalendarResult): ProviderHealth {
  return { id: r.providerId, status: r.status, lastFetch: r.lastFetch, error: r.error, eventCount: r.inputs.length, countriesAvailable: r.countriesAvailable };
}

/** Fetch every provider in the precedence list; a throwing provider is reported UNAVAILABLE, never fatal. */
export async function collectProviderResults(args: {
  order: ProviderId[];
  countries: CountryCode[];
  fromUtcMs: number;
  toUtcMs: number;
  nowMs: number;
  fetchImpl?: typeof fetch;
}): Promise<ProviderCalendarResult[]> {
  const settled = await Promise.allSettled(
    args.order.map((id) => getProvider(id).getEvents({ countries: args.countries, fromUtcMs: args.fromUtcMs, toUtcMs: args.toUtcMs, nowMs: args.nowMs, fetchImpl: args.fetchImpl })),
  );
  return settled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : { providerId: args.order[i], inputs: [], status: 'UNAVAILABLE' as const, lastFetch: null, error: s.reason instanceof Error ? s.reason.message : String(s.reason), countriesAvailable: [] },
  );
}

export async function buildCalendarFeed(args: BuildFeedArgs): Promise<CalendarFeed> {
  const { nowMs, days, countries } = args;
  const lookbackMs = (args.lookbackHours ?? 12) * 60 * 60 * 1000;
  const fromMs = nowMs - lookbackMs;
  const toMs = nowMs + days * 24 * 60 * 60 * 1000;
  const focusAssets = args.focusAssets?.length ? args.focusAssets : DEFAULT_FOCUS_ASSETS;
  const order = args.providerOrder ?? resolveProviderOrder();

  const results = await collectProviderResults({ order, countries, fromUtcMs: fromMs, toUtcMs: toMs, nowMs, fetchImpl: args.fetchImpl });
  const health = results.map(toHealth);

  // Stamp each row with its provider's feed health so normalize can derive STALE.
  const inputs = results.flatMap((r) => r.inputs.map((i) => ({ ...i, providerStatus: i.providerStatus ?? r.status })));
  const { merged, identityConflicts } = mergeInputs(inputs, order);
  const all = normalizeAll(merged, { nowUtcMs: nowMs });
  const events = filterEvents(all, { countries, importance: args.importance ?? 'all', fromUtcMs: fromMs, toUtcMs: toMs });

  const liveResults = results.filter((r) => r.providerId !== 'curated');
  const primaryLive = liveResults.find((r) => r.status === 'LIVE' || r.status === 'STALE') ?? liveResults[0] ?? null;
  const timingCounts = new Map<ProviderId, number>();
  for (const e of events) timingCounts.set(e.providerId, (timingCounts.get(e.providerId) ?? 0) + 1);
  const dominant = [...timingCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'curated';

  const coverage = curatedCoverage(nowMs);
  const warnings: string[] = [];
  if (coverage.expiring) {
    warnings.push(`${CURATED_COVERAGE_WARNING}: latest curated future event ${coverage.latestFutureEventUtc ?? 'none'} (${coverage.daysRemaining ?? 0} days).`);
    logger.warn(CURATED_COVERAGE_WARNING, { latestFutureEventUtc: coverage.latestFutureEventUtc, daysRemaining: coverage.daysRemaining });
  }
  for (const r of liveResults) {
    if (r.status === 'STALE') warnings.push(`Provider ${r.providerId} is serving a stale snapshot: ${r.error ?? 'refresh failed'}.`);
    if (r.status === 'UNAVAILABLE') warnings.push(`Provider ${r.providerId} unavailable: ${r.error ?? 'unknown error'}.`);
  }
  if (identityConflicts.length) warnings.push(`${identityConflicts.length} identity conflict(s): same indicator+period reported >3 days apart; kept separate.`);

  return {
    events,
    nextMajorEvent: selectNextMajorEvent(events, nowMs, countries),
    nextRelevantEvent: selectNextRelevantEvent(events, nowMs, focusAssets, { countries }),
    focusAssets,
    regionalContext: { japan: buildBojContext(all, nowMs) },
    meta: {
      provider: dominant,
      providerOrder: order,
      providers: health,
      providerStatus: primaryLive?.status ?? 'NOT_CONFIGURED',
      providerLastFetch: primaryLive?.lastFetch ?? null,
      providerError: primaryLive?.error ?? null,
      countriesAvailable: [...new Set(liveResults.flatMap((r) => r.countriesAvailable))],
      curatedCoverage: coverage,
      warnings,
      generatedAt: new Date(nowMs).toISOString(),
    },
    dateRange: { fromUtc: new Date(fromMs).toISOString(), toUtc: new Date(toMs).toISOString() },
  };
}
