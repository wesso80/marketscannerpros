import { COUNTRIES } from './countries';
import { categoryFromProvider, getIndicator, isUnmappedIndicator } from './indicators';
import { normalizeReferencePeriod, referencePeriodOrdinal } from './referencePeriod';
import { buildAssetImpact, computeSurprise, formatValue } from './surprise';
import { ET_ZONE, formatLocalRelease, getZonedParts, zonedClock, zonedDateKey, zonedTimeToUtc } from './time';
import type {
  BojContext,
  CalendarEvent,
  Confidence,
  ContextPoint,
  CountryCode,
  DataStatus,
  EventCategory,
  Importance,
  ProviderStatus,
  RawCalendarInput,
  ReleaseStatus,
  SourceAuthority,
  TimingStatus,
} from './types';

const IMPORTANCE_RANK: Record<Importance, number> = { high: 3, medium: 2, low: 1 };

/** Release-time-passed thresholds for actual availability. */
const DELAYED_WINDOW_MS = 6 * 60 * 60 * 1000;
/** Provider value freshness threshold. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface NormalizeOptions {
  nowUtcMs: number;
  /** Used only to populate releaseTimeUser; null leaves it for the client. */
  userTimezone?: string | null;
}

/**
 * Backwards-compatible roll-up. Derived strictly from the split states so the
 * two views can never disagree.
 */
export function deriveDataStatus(args: {
  releaseStatus: ReleaseStatus;
  timingStatus: TimingStatus;
  providerStatus: ProviderStatus;
  releaseMs: number;
  nowMs: number;
  actual: number | null;
  consensus: number | null;
  lastUpdatedMs: number | null;
}): { status: DataStatus; detail: string } {
  const { releaseStatus, timingStatus, providerStatus, releaseMs, nowMs, actual, consensus, lastUpdatedMs } = args;
  const ageMs = lastUpdatedMs !== null ? nowMs - lastUpdatedMs : null;
  const providerStale = providerStatus === 'STALE' || (ageMs !== null && ageMs > STALE_AFTER_MS);

  if (releaseStatus === 'UPCOMING') {
    if (timingStatus !== 'CONFIRMED') return { status: 'UNCONFIRMED', detail: `Release time is ${timingStatus.toLowerCase()}, not confirmed by an official schedule.` };
    if (consensus === null) return { status: 'MISSING', detail: 'Consensus not available for this release.' };
    if (providerStale) return { status: 'STALE', detail: 'Consensus snapshot is older than 24h or the provider feed is stale.' };
    return { status: 'LIVE', detail: 'Scheduled; consensus current.' };
  }

  if (actual === null) {
    if (nowMs - releaseMs <= DELAYED_WINDOW_MS) return { status: 'DELAYED', detail: 'Release time passed; actual not yet received.' };
    return { status: 'MISSING', detail: 'Actual not available from any configured source.' };
  }
  if (providerStale) return { status: 'STALE', detail: 'Actual received, but the snapshot is older than 24h (possible revisions not reflected).' };
  return { status: 'LIVE', detail: releaseStatus === 'REVISED' ? 'Actual received; a later release revised this print.' : 'Actual received.' };
}

export function deriveConfidence(args: { sourceAuthority: SourceAuthority; timingStatus: TimingStatus; canonicalMatched: boolean }): Confidence {
  const { sourceAuthority, timingStatus, canonicalMatched } = args;
  if (sourceAuthority === 'OFFICIAL' && timingStatus === 'CONFIRMED') return 'HIGH';
  if (sourceAuthority === 'PROVIDER' && timingStatus === 'CONFIRMED' && canonicalMatched) return 'HIGH';
  if (sourceAuthority === 'OFFICIAL' && timingStatus === 'TENTATIVE') return 'MEDIUM';
  if (sourceAuthority === 'PROVIDER' && canonicalMatched) return 'MEDIUM';
  if (sourceAuthority === 'CURATED' && timingStatus === 'ESTIMATED' && canonicalMatched) return 'LOW';
  return 'LOW';
}

function buildId(countryCode: CountryCode, canonicalIndicatorId: string, releaseUtc: Date, referencePeriod: string | null): string {
  const ymd = releaseUtc.toISOString().slice(0, 10);
  return `${countryCode}:${canonicalIndicatorId}:${ymd}${referencePeriod ? `:${referencePeriod.replace(/\s+/g, '')}` : ''}`.toLowerCase();
}

/** Normalize one raw input (curated or provider) into the canonical model. */
export function normalizeEvent(input: RawCalendarInput, opts: NormalizeOptions): CalendarEvent | null {
  const meta = COUNTRIES[input.countryCode];
  if (!meta) return null;

  const indicator = getIndicator(input.canonicalIndicatorId);
  const canonicalMatched = indicator !== null && !isUnmappedIndicator(input.canonicalIndicatorId);
  const eventName = input.eventName ?? indicator?.name;
  if (!eventName) return null;

  const category: EventCategory = input.category ?? indicator?.category ?? categoryFromProvider('', eventName);
  const importance: Importance = indicator?.importance ?? input.importance ?? 'medium';
  const unit = input.unit !== undefined ? input.unit : indicator?.unit ?? null;
  const higherMeans = indicator?.higherMeans ?? (category === 'employment' && /unemploy/i.test(eventName) ? 'DOVISH' : 'HAWKISH');

  let releaseUtc: Date;
  if (input.releaseTimeUtc) {
    releaseUtc = new Date(input.releaseTimeUtc);
    if (Number.isNaN(releaseUtc.getTime())) return null;
  } else {
    try {
      releaseUtc = zonedTimeToUtc(input.localDate, input.localTime, meta.timezone);
    } catch {
      return null;
    }
  }
  const releaseMs = releaseUtc.getTime();
  const isReleased = releaseMs <= opts.nowUtcMs;
  const localParts = getZonedParts(releaseMs, meta.timezone);
  const referencePeriod = normalizeReferencePeriod(input.referencePeriod, { year: localParts.year, month: localParts.month });

  const actual = input.actual ?? null;
  const previous = input.previous ?? null;
  const revisedPrevious = input.revisedPrevious ?? null;
  const consensus = input.consensus ?? null;
  const providerForecast = input.providerForecast ?? null;
  const timingStatus: TimingStatus = input.timingStatus ?? 'UNKNOWN';
  const sourceAuthority: SourceAuthority = input.sourceAuthority ?? (input.providerId === 'curated' ? 'CURATED' : 'PROVIDER');
  const providerStatus: ProviderStatus = input.providerStatus ?? (input.providerId === 'curated' ? 'FALLBACK' : 'LIVE');
  const releaseStatus: ReleaseStatus = isReleased ? 'RELEASED' : 'UPCOMING';
  const lastUpdated = input.lastUpdated ?? new Date(opts.nowUtcMs).toISOString();
  const lastUpdatedRaw = input.lastUpdated ? new Date(input.lastUpdated).getTime() : NaN;
  const lastUpdatedMs = Number.isFinite(lastUpdatedRaw) ? lastUpdatedRaw : null;

  const { status, detail } = deriveDataStatus({ releaseStatus, timingStatus, providerStatus, releaseMs, nowMs: opts.nowUtcMs, actual, consensus, lastUpdatedMs });

  // Surprise only when the event has actually been released and both sides exist.
  const surprise = isReleased
    ? computeSurprise({ actual, consensus, higherMeans, unit, surpriseScale: indicator?.surpriseScale ?? null })
    : null;

  const tags = [...(indicator?.tags ?? []), ...(input.tags ?? [])];
  const consensusDisplay = formatValue(consensus, unit);

  return {
    id: buildId(input.countryCode, input.canonicalIndicatorId, releaseUtc, referencePeriod),
    canonicalIndicatorId: input.canonicalIndicatorId,
    canonicalMatched,
    country: meta.name,
    countryCode: meta.code,
    region: meta.region,
    currency: meta.currency,
    eventName,
    eventKey: input.canonicalIndicatorId,
    category,
    referencePeriod,
    releaseTimeUtc: releaseUtc.toISOString(),
    releaseTimeLocal: formatLocalRelease(releaseMs, meta.timezone, meta.tzAbbr),
    timezone: meta.timezone,
    releaseTimeUser: opts.userTimezone ? zonedClock(releaseMs, opts.userTimezone) : null,
    actual,
    revisedActual: null,
    previous,
    revisedPrevious,
    consensus,
    providerForecast,
    unit,
    importance,
    source: input.source ?? indicator?.source ?? 'Curated schedule',
    sourceUrl: input.sourceUrl !== undefined ? input.sourceUrl : indicator?.sourceUrl ?? null,
    sourceAuthority,
    confidence: deriveConfidence({ sourceAuthority, timingStatus, canonicalMatched }),
    providerId: input.providerId,
    contributors: input.contributors ?? [input.providerId],
    disagreements: input.disagreements ?? [],
    lastUpdated,
    timingStatus,
    providerStatus,
    releaseStatus,
    timingConfirmed: timingStatus === 'CONFIRMED',
    timingNote: input.timingNote ?? null,
    dataStatus: status,
    statusDetail: detail,
    isReleased,
    surprise,
    assetImpact: buildAssetImpact({ countryCode: meta.code, category, higherMeans, surprise }),
    tags,
    display: {
      actual: formatValue(actual, unit),
      previous: formatValue(revisedPrevious ?? previous, unit),
      consensus: consensusDisplay,
      surprise: surprise ? surprise.label : '--',
    },
    date: zonedDateKey(releaseMs, ET_ZONE),
    time: zonedClock(releaseMs, ET_ZONE),
    event: eventName,
    impact: importance,
    forecast: consensusDisplay === '--' ? undefined : consensusDisplay,
  };
}

/**
 * A later release carrying `revisedPrevious` means the prior print of the
 * same indicator was revised. Mark that earlier event REVISED and attach the
 * revised value without overwriting its original `actual`.
 */
export function propagateRevisions(events: CalendarEvent[]): CalendarEvent[] {
  const bySeries = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    if (!e.canonicalMatched) continue;
    const k = `${e.countryCode}|${e.canonicalIndicatorId}`;
    (bySeries.get(k) ?? bySeries.set(k, []).get(k)!).push(e);
  }
  for (const series of bySeries.values()) {
    series.sort((a, b) => Date.parse(a.releaseTimeUtc) - Date.parse(b.releaseTimeUtc));
    for (let i = 1; i < series.length; i++) {
      const later = series[i];
      if (later.revisedPrevious === null) continue;
      const laterOrd = referencePeriodOrdinal(later.referencePeriod);
      const earlier = [...series.slice(0, i)].reverse().find((e) => {
        const ord = referencePeriodOrdinal(e.referencePeriod);
        return e.isReleased && (laterOrd === null || ord === null || ord < laterOrd);
      });
      if (!earlier || earlier.actual === null) continue;
      earlier.releaseStatus = 'REVISED';
      earlier.revisedActual = later.revisedPrevious;
      earlier.statusDetail = `Actual received; revised to ${formatValue(later.revisedPrevious, earlier.unit)} in the ${later.referencePeriod ?? 'following'} release.`;
    }
  }
  return events;
}

export function normalizeAll(inputs: RawCalendarInput[], opts: NormalizeOptions): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    const ev = normalizeEvent(input, opts);
    if (!ev || seen.has(ev.id)) continue;
    seen.add(ev.id);
    out.push(ev);
  }
  propagateRevisions(out);
  return out.sort((a, b) => a.releaseTimeUtc.localeCompare(b.releaseTimeUtc) || IMPORTANCE_RANK[b.importance] - IMPORTANCE_RANK[a.importance]);
}

export interface EventFilter {
  countries?: CountryCode[] | null;
  minImportance?: Importance | null;
  importance?: Importance | 'all' | null;
  categories?: EventCategory[] | null;
  fromUtcMs?: number;
  toUtcMs?: number;
}

export function filterEvents(events: CalendarEvent[], filter: EventFilter): CalendarEvent[] {
  return events.filter((e) => {
    if (filter.countries && filter.countries.length && !filter.countries.includes(e.countryCode)) return false;
    if (filter.importance && filter.importance !== 'all' && e.importance !== filter.importance) return false;
    if (filter.minImportance && IMPORTANCE_RANK[e.importance] < IMPORTANCE_RANK[filter.minImportance]) return false;
    if (filter.categories && filter.categories.length && !filter.categories.includes(e.category)) return false;
    const ms = Date.parse(e.releaseTimeUtc);
    if (filter.fromUtcMs !== undefined && ms < filter.fromUtcMs) return false;
    if (filter.toUtcMs !== undefined && ms > filter.toUtcMs) return false;
    return true;
  });
}

/**
 * Next HIGH-impact event across the enabled countries, strictly in the future.
 * No country is preferred — the earliest release wins.
 */
export function selectNextMajorEvent(events: CalendarEvent[], nowUtcMs: number, countries?: CountryCode[] | null): CalendarEvent | null {
  const candidates = events
    .filter((e) => e.importance === 'high')
    .filter((e) => !countries || countries.length === 0 || countries.includes(e.countryCode))
    .filter((e) => Date.parse(e.releaseTimeUtc) > nowUtcMs)
    .sort((a, b) => Date.parse(a.releaseTimeUtc) - Date.parse(b.releaseTimeUtc));
  return candidates[0] ?? null;
}

export const HIGH_IMPACT_DANGER_WINDOW = { beforeMin: 30, afterMin: 30, label: 'T-30 → T+30' } as const;

export function isInsideDangerWindow(event: CalendarEvent, nowUtcMs: number): boolean {
  const ms = Date.parse(event.releaseTimeUtc);
  return nowUtcMs >= ms - HIGH_IMPACT_DANGER_WINDOW.beforeMin * 60000 && nowUtcMs <= ms + HIGH_IMPACT_DANGER_WINDOW.afterMin * 60000;
}

function toContextPoint(e: CalendarEvent): ContextPoint {
  return {
    eventName: e.eventName,
    referencePeriod: e.referencePeriod,
    actual: e.actual,
    consensus: e.consensus,
    previous: e.revisedPrevious ?? e.previous,
    releaseTimeUtc: e.releaseTimeUtc,
    isReleased: e.isReleased,
    dataStatus: e.dataStatus,
  };
}

/** Latest released event for a canonical id, else the next upcoming one. */
function pick(events: CalendarEvent[], canonicalId: string, nowUtcMs: number): CalendarEvent | null {
  const rows = events.filter((e) => e.countryCode === 'JP' && e.canonicalIndicatorId === canonicalId);
  const released = rows.filter((e) => Date.parse(e.releaseTimeUtc) <= nowUtcMs).sort((a, b) => Date.parse(b.releaseTimeUtc) - Date.parse(a.releaseTimeUtc));
  if (released[0]) return released[0];
  const upcoming = rows.filter((e) => Date.parse(e.releaseTimeUtc) > nowUtcMs).sort((a, b) => Date.parse(a.releaseTimeUtc) - Date.parse(b.releaseTimeUtc));
  return upcoming[0] ?? null;
}

/**
 * BoJ sensitivity context. Uses only released actuals for the trend read;
 * consensus is never substituted for a missing actual.
 */
export function buildBojContext(events: CalendarEvent[], nowUtcMs: number): BojContext {
  // Tokyo and National series are deliberately looked up by distinct canonical ids.
  const tokyo = pick(events, 'JP_CPI_TOKYO_CORE_YOY', nowUtcMs) ?? pick(events, 'JP_CPI_TOKYO_HEADLINE_YOY', nowUtcMs);
  const national = pick(events, 'JP_CPI_NATIONAL_CORE_YOY', nowUtcMs) ?? pick(events, 'JP_CPI_NATIONAL_HEADLINE_YOY', nowUtcMs);
  const wages = pick(events, 'JP_CASH_EARNINGS_YOY', nowUtcMs);
  const boj = events
    .filter((e) => e.countryCode === 'JP' && e.category === 'central_bank' && Date.parse(e.releaseTimeUtc) > nowUtcMs)
    .sort((a, b) => Date.parse(a.releaseTimeUtc) - Date.parse(b.releaseTimeUtc))[0] ?? null;

  const notes: string[] = [];
  const deltas: number[] = [];
  for (const [label, e] of [['Tokyo CPI', tokyo], ['National CPI', national]] as const) {
    if (e && e.isReleased && e.actual !== null && (e.revisedPrevious ?? e.previous) !== null) {
      const d = e.actual - (e.revisedPrevious ?? e.previous)!;
      deltas.push(d);
      notes.push(`${label} (${e.referencePeriod ?? 'latest'}): ${formatValue(e.actual, '%')} vs prior ${formatValue(e.revisedPrevious ?? e.previous, '%')}.`);
    } else if (e && e.isReleased && e.actual === null) {
      notes.push(`${label}: actual not yet received (${e.dataStatus}).`);
    } else if (e) {
      notes.push(`${label}: next release ${e.releaseTimeLocal}, ${e.timingConfirmed ? 'confirmed' : 'unconfirmed timing'}.`);
    }
  }
  if (tokyo) notes.push('Tokyo CPI leads the national print by roughly three weeks; treat it as the leading inflation signal.');
  if (wages && wages.isReleased && wages.actual !== null) notes.push(`Cash earnings (${wages.referencePeriod ?? 'latest'}): ${formatValue(wages.actual, '%')} YoY.`);

  let inflationTrend: BojContext['inflationTrend'] = 'UNKNOWN';
  if (deltas.length) {
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    inflationTrend = avg > 0.05 ? 'RISING' : avg < -0.05 ? 'EASING' : 'FLAT';
  }
  const lean: BojContext['lean'] = inflationTrend === 'RISING' ? 'HAWKISH' : inflationTrend === 'EASING' ? 'DOVISH' : inflationTrend === 'FLAT' ? 'NEUTRAL' : 'UNKNOWN';

  const statuses = [tokyo, national, wages].filter(Boolean).map((e) => e!.dataStatus);
  const dataStatus: DataStatus = statuses.includes('MISSING') ? 'MISSING' : statuses.includes('STALE') ? 'STALE' : statuses.includes('DELAYED') ? 'DELAYED' : statuses.includes('UNCONFIRMED') ? 'UNCONFIRMED' : statuses.length ? 'LIVE' : 'MISSING';

  if (inflationTrend === 'UNKNOWN') notes.push('No released actuals in the loaded window; BoJ lean cannot be inferred from inflation data alone.');

  return {
    inflationTrend,
    lean,
    tokyoCpi: tokyo ? toContextPoint(tokyo) : null,
    nationalCpi: national ? toContextPoint(national) : null,
    wages: wages ? toContextPoint(wages) : null,
    nextBojDecision: boj ? { releaseTimeUtc: boj.releaseTimeUtc, eventName: boj.eventName, timingConfirmed: boj.timingConfirmed } : null,
    dataStatus,
    notes,
  };
}
