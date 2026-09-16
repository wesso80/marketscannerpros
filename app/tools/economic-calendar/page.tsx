'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ToolsPageHeader from '@/components/ToolsPageHeader';
import { useUserTier, canAccessPortfolioInsights } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';
import { PageHero } from '@/components/ui';
import { COUNTRIES, PRIMARY_COUNTRIES, SECONDARY_COUNTRIES, countryFlag } from '@/lib/macro/calendar/countries';
import { HIGH_IMPACT_DANGER_WINDOW } from '@/lib/macro/calendar/normalize';
import { ALL_FOCUS_ASSETS, DEFAULT_FOCUS_ASSETS, selectNextRelevantEvent } from '@/lib/macro/calendar/relevance';
import { ET_ZONE, formatCountdown, zonedClock, zonedDateKey } from '@/lib/macro/calendar/time';
import type {
  AssetTag,
  BojContext,
  CalendarEvent,
  CalendarFeedMeta,
  CountryFilter,
  DataStatus,
  EventCategory,
  PolicyLean,
  ReleaseStatus,
  TimingStatus,
} from '@/lib/macro/calendar/types';

interface CalendarData {
  events: CalendarEvent[];
  count: number;
  nextMajorEvent: CalendarEvent | null;
  daysUntilMajor: number | null;
  regionalContext?: { japan: BojContext };
  meta?: CalendarFeedMeta;
  warnings?: string[];
  lastUpdated?: string;
}

type SessionTag = 'PRE' | 'RTH' | 'AH';
type ReviewState = 'CLEAR' | 'CAUTION' | 'BLOCKED';
type TimeMode = 'user' | 'local' | 'et';

interface EnrichedEvent extends CalendarEvent {
  releaseMs: number;
  /** ET minute-of-day, used only for the US session timeline. */
  minuteOfDay: number;
  session: SessionTag;
  userClock: string;
  userDateKey: string;
  localDateKey: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  employment: 'JOBS',
  inflation: 'CPI',
  central_bank: 'CB',
  gdp: 'GDP',
  consumer: 'CONS',
  manufacturing: 'MFG',
  pmi: 'PMI',
  wages: 'WAGE',
  other: 'MAC',
};

const categoryList: EventCategory[] = ['employment', 'inflation', 'central_bank', 'gdp', 'pmi', 'consumer', 'manufacturing', 'wages'];

const STATUS_TONE: Record<DataStatus, string> = {
  LIVE: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  DELAYED: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
  STALE: 'border-orange-400/30 bg-orange-500/10 text-orange-200',
  MISSING: 'border-white/15 bg-white/5 text-white/55',
  UNCONFIRMED: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
};

const TIMING_TONE: Record<TimingStatus, string> = {
  CONFIRMED: 'text-emerald-300',
  TENTATIVE: 'text-amber-300',
  ESTIMATED: 'text-sky-300',
  UNKNOWN: 'text-white/45',
};

const RELEASE_TONE: Record<ReleaseStatus, string> = {
  UPCOMING: 'text-white/55',
  RELEASED: 'text-white/85',
  REVISED: 'text-orange-300',
};

function leanTone(lean: PolicyLean | undefined): string {
  if (lean === 'HAWKISH') return 'text-rose-300';
  if (lean === 'DOVISH') return 'text-emerald-300';
  return 'text-white/60';
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map((item) => parseInt(item, 10));
  return h * 60 + m;
}

function formatEt(time: string): string {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${minutes} ${ampm} ET`;
}

function inferSession(minuteOfDay: number): SessionTag {
  if (minuteOfDay < 570) return 'PRE';
  if (minuteOfDay <= 960) return 'RTH';
  return 'AH';
}

function resolveUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function isCentralBankEvent(event: CalendarEvent) {
  return event.category === 'central_bank';
}

function isInflationOrJobsEvent(event: CalendarEvent) {
  return event.category === 'inflation' || event.category === 'employment';
}

function displayTime(event: EnrichedEvent, mode: TimeMode): string {
  const base = mode === 'local' ? event.releaseTimeLocal : mode === 'et' ? formatEt(event.time) : event.userClock;
  return event.timingConfirmed ? base : `~${base}`;
}

export default function EconomicCalendarPage({ embeddedInResearch = false }: { embeddedInResearch?: boolean } = {}) {
  const { isAdmin, tier, isLoading: tierLoading } = useUserTier();
  const showAdminTools = isAdmin && !embeddedInResearch;
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [impactFilter, setImpactFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  // Default view emphasises market-moving catalysts; low-value rows are opt-in.
  const [hideLowImpact, setHideLowImpact] = useState(true);
  const [timeMode, setTimeMode] = useState<TimeMode>('user');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<CountryFilter>('GLOBAL');
  const [focusAssets, setFocusAssets] = useState<AssetTag[]>(DEFAULT_FOCUS_ASSETS);
  const [refreshKey, setRefreshKey] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [userTz, setUserTz] = useState('UTC');

  useEffect(() => {
    setUserTz(resolveUserTimezone());
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const fetchCalendar = async () => {
      try {
        setLoading(true);
        // Always pull GLOBAL so country switching is instant and countdown selection is global.
        const params = new URLSearchParams({ days: days.toString(), impact: 'all', countries: 'GLOBAL' });
        const res = await fetch(`/api/economic-calendar?${params}`);
        if (!res.ok) throw new Error('Failed to fetch calendar');
        const json = await res.json();
        setData(json);
        setNowMs(Date.now());
        setError(null);
      } catch (err) {
        setError('Failed to load economic calendar');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchCalendar();
  }, [days, refreshKey]);

  const allEvents = useMemo<EnrichedEvent[]>(() => {
    if (!data?.events) return [];
    return data.events.map((event) => {
      const releaseMs = Date.parse(event.releaseTimeUtc);
      const minuteOfDay = toMinutes(event.time);
      return {
        ...event,
        releaseMs,
        minuteOfDay,
        session: inferSession(minuteOfDay),
        userClock: zonedClock(releaseMs, userTz),
        userDateKey: zonedDateKey(releaseMs, userTz),
        localDateKey: zonedDateKey(releaseMs, event.timezone),
      };
    });
  }, [data, userTz]);

  const enrichedEvents = useMemo(() => {
    return allEvents
      .filter((event) => (selectedCountry === 'GLOBAL' ? true : event.countryCode === selectedCountry))
      .filter((event) => (impactFilter === 'all' ? true : event.impact === impactFilter))
      .filter((event) => (hideLowImpact ? event.impact !== 'low' : true))
      .filter((event) => (selectedCategories.length ? selectedCategories.includes(event.category) : true))
      .sort((a, b) => a.releaseMs - b.releaseMs);
  }, [allEvents, selectedCountry, impactFilter, hideLowImpact, selectedCategories]);

  const grouped = useMemo(() => {
    const map: Record<string, EnrichedEvent[]> = {};
    for (const event of enrichedEvents) {
      const key = timeMode === 'local' ? event.localDateKey : timeMode === 'et' ? event.date : event.userDateKey;
      if (!map[key]) map[key] = [];
      map[key].push(event);
    }
    return Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  }, [enrichedEvents, timeMode]);

  const statusCounts = useMemo(() => {
    const counts: Record<DataStatus, number> = { LIVE: 0, DELAYED: 0, STALE: 0, MISSING: 0, UNCONFIRMED: 0 };
    for (const event of enrichedEvents) counts[event.dataStatus] += 1;
    return counts;
  }, [enrichedEvents]);

  const gate = useMemo(() => {
    const dayMs = 86_400_000;
    const minutesTo = (event: EnrichedEvent) => Math.round((event.releaseMs - nowMs) / 60_000);
    const next24 = enrichedEvents.filter((event) => {
      const mins = minutesTo(event);
      return mins >= 0 && mins <= 1440;
    });
    const nextHigh = next24.filter((event) => event.impact === 'high');
    const closestHighMinutes = nextHigh.map(minutesTo).filter((m) => m >= 0).sort((a, b) => a - b)[0] ?? 9999;
    // A high-impact print inside T+30 still counts as the shock window.
    const insidePostWindow = enrichedEvents.some((event) => {
      const mins = minutesTo(event);
      return event.impact === 'high' && mins < 0 && mins >= -HIGH_IMPACT_DANGER_WINDOW.afterMin;
    });

    const isCentralBankDay = next24.some((event) => event.impact === 'high' && isCentralBankEvent(event));
    const isInflationOrJobs = next24.some((event) => event.impact === 'high' && isInflationOrJobsEvent(event));
    const highImpactCountNext24h = nextHigh.length;
    const highImpactWithinNext120m = closestHighMinutes <= 120;

    let reviewState: ReviewState = 'CLEAR';
    if (closestHighMinutes <= HIGH_IMPACT_DANGER_WINDOW.beforeMin || insidePostWindow) reviewState = 'BLOCKED';
    else if (highImpactCountNext24h >= 2 || isCentralBankDay) reviewState = 'CAUTION';

    const volRegime = closestHighMinutes <= 60 || isCentralBankDay
      ? 'Event Shock'
      : highImpactCountNext24h >= 2
        ? 'Expansion'
        : 'Compression';

    const riskState = isCentralBankDay || isInflationOrJobs ? 'Risk-Off' : highImpactCountNext24h ? 'Neutral' : 'Risk-On';
    const liquidity = closestHighMinutes <= 60 ? 'Spiky' : highImpactCountNext24h >= 2 ? 'Thin' : 'Stable';
    const density = highImpactCountNext24h >= 3 ? 'High' : highImpactCountNext24h >= 1 ? 'Medium' : 'Low';
    const researchMode = reviewState === 'BLOCKED' ? 'Observation' : volRegime === 'Compression' ? 'Trend review' : 'Mean-reversion review';

    // Global selection: earliest upcoming HIGH event across the enabled countries — no US preference.
    const nextMajorEvent = enrichedEvents.find((event) => event.impact === 'high' && event.releaseMs > nowMs) || null;
    const countdown = nextMajorEvent ? formatCountdown(nextMajorEvent.releaseMs, nowMs) : 'No major catalyst';
    const daysOut = nextMajorEvent ? Math.floor((nextMajorEvent.releaseMs - nowMs) / dayMs) : null;
    // Catalyst relevance for the focus assets — attention ranking, not a price call.
    const relevant = selectNextRelevantEvent(enrichedEvents, nowMs, focusAssets);
    const nextRelevantEvent = relevant && relevant.event.id !== nextMajorEvent?.id ? (enrichedEvents.find((e) => e.id === relevant.event.id) ?? null) : null;
    const nextRelevantScore = relevant?.relevance ?? null;
    const relevantCountdown = nextRelevantEvent ? formatCountdown(nextRelevantEvent.releaseMs, nowMs) : null;

    return {
      reviewState,
      riskState,
      volRegime,
      liquidity,
      density,
      researchMode,
      highImpactCountNext24h,
      highImpactWithinNext120m,
      isCentralBankDay,
      isInflationOrJobs,
      closestHighMinutes,
      nextMajorEvent,
      countdown,
      daysOut,
      nextRelevantEvent,
      nextRelevantScore,
      relevantCountdown,
      dangerWindow: HIGH_IMPACT_DANGER_WINDOW.label,
      reason:
        reviewState === 'BLOCKED'
          ? 'High-impact print is inside the immediate shock window; treat this as observation context.'
          : reviewState === 'CAUTION'
            ? 'Catalyst density is elevated; require stronger evidence before using the scenario.'
            : 'No immediate high-impact shock window is detected in the selected horizon.',
    };
  }, [enrichedEvents, nowMs, focusAssets]);

  const todayEvents = useMemo(() => {
    const todayEt = zonedDateKey(nowMs, ET_ZONE);
    return enrichedEvents.filter((event) => event.date === todayEt);
  }, [enrichedEvents, nowMs]);

  const japan = data?.regionalContext?.japan ?? null;
  const showJapanContext = Boolean(japan) && (selectedCountry === 'GLOBAL' || selectedCountry === 'JP');

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((item) => item !== category) : [...prev, category]
    );
  };

  const toggleFocusAsset = (asset: AssetTag) => {
    setFocusAssets((prev) => (prev.includes(asset) ? (prev.length > 1 ? prev.filter((a) => a !== asset) : prev) : [...prev, asset]));
  };

  if (tierLoading) return <div className="min-h-screen bg-[var(--msp-bg)]" />;
  if (!canAccessPortfolioInsights(tier)) return <UpgradeGate requiredTier="pro" feature="Economic Calendar" />;

  return (
    <div className={`${embeddedInResearch ? '' : 'min-h-screen bg-[var(--msp-bg)]'} text-white`}>
      {!embeddedInResearch && (
        <div className="mx-2 mt-2 md:mx-3">
          <PageHero
            ariaLabel="Economic Calendar command header"
            eyebrow="Global macro calendar"
            badges={[
              { label: 'Calendar' },
              { label: 'Catalysts' },
              { label: 'Risk gates' },
            ]}
            title="Economic Calendar"
            subtitle="Global market-moving events — Fed, BoJ, ECB, BoE, RBA, BoC, RBNZ, PBoC, inflation, jobs, GDP."
            actions={[
              { label: 'Refresh calendar', variant: 'primary', onClick: () => setRefreshKey((k) => k + 1) },
              { label: 'Open News', variant: 'secondary', href: '/tools/news' },
              { label: 'Open Research', variant: 'ghost', href: '/tools/research' },
            ]}
            metrics={[
              { label: 'Horizon', value: `${days}d`, tone: 'bull', detail: 'Window length' },
              { label: 'Review state', value: gate.reviewState, tone: gate.reviewState === 'CLEAR' ? 'bull' : gate.reviewState === 'BLOCKED' ? 'bear' : 'warn', detail: 'Macro gate' },
              { label: 'Risk state', value: gate.riskState, tone: 'info', detail: 'Session risk' },
              { label: 'Liquidity', value: gate.liquidity, tone: 'warn', detail: 'Session liquidity' },
            ]}
          />
        </div>
      )}
      {!embeddedInResearch && <ToolsPageHeader
        badge="GLOBAL MACRO CALENDAR"
        title="Economic Calendar"
        subtitle="Global market-moving events — Fed, BoJ, ECB, BoE, RBA, BoC, RBNZ, PBoC, inflation, jobs, GDP."
        icon="EC"
        actions={
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(event) => setDays(parseInt(event.target.value, 10))}
              className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-xs text-white"
            >
              <option value={7}>Show next: 7d</option>
              <option value={14}>Show next: 14d</option>
              <option value={30}>Show next: 30d</option>
            </select>
            <button type="button" onClick={() => setRefreshKey((k) => k + 1)} className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
              Refresh
            </button>
          </div>
        }
      />}

      <main className={embeddedInResearch ? 'mx-auto max-w-none pb-6' : 'mx-auto max-w-none px-4 pb-16'}>
        {loading && <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/60">Loading macro catalyst map...</div>}
        {error && <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}

        {!loading && !error && (
          <>
            <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <article className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm lg:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white/90">Macro Analysis Gate</h2>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                    gate.reviewState === 'CLEAR'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : gate.reviewState === 'BLOCKED'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    REVIEW: {gate.reviewState}
                  </span>
                </div>
                <p className="mb-3 text-sm text-white/70">{gate.reason}</p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {[
                    `Risk State: ${gate.riskState}`,
                    `Volatility Risk: ${gate.volRegime}`,
                    `Liquidity Window: ${gate.liquidity}`,
                    `Catalyst Density: ${gate.density}`,
                    `Research Mode: ${gate.researchMode}`,
                  ].map((chip) => (
                    <span key={chip} className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/80">
                      {chip}
                    </span>
                  ))}
                </div>
                <ul className="space-y-1 text-xs text-white/70">
                  <li>• Treat the {HIGH_IMPACT_DANGER_WINDOW.label} window around any high-impact release (any country) as elevated uncertainty.</li>
                  <li>• Compare leaders against breadth before relying on a scenario.</li>
                  <li>• Require post-window confirmation when event shock risk is active.</li>
                </ul>
              </article>

              <article className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-white/90">Next Major Event Countdown</h3>
                <p className="mb-2 text-[10px] uppercase tracking-wide text-white/45">
                  Scope: {selectedCountry === 'GLOBAL' ? 'Global — earliest high-impact release across enabled markets' : `${COUNTRIES[selectedCountry].name} only`}
                </p>
                {gate.nextMajorEvent ? (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-rose-300/80">Next global event</p>
                    <p className="text-sm font-semibold text-white/90">
                      <span aria-hidden="true">{countryFlag(gate.nextMajorEvent.countryCode)}</span> {CATEGORY_ICONS[gate.nextMajorEvent.category]} {gate.nextMajorEvent.eventName}
                      {gate.nextMajorEvent.referencePeriod ? <span className="text-white/55"> ({gate.nextMajorEvent.referencePeriod})</span> : null}
                    </p>
                    <p className="mt-1 text-xs text-white/65">
                      {gate.nextMajorEvent.country} • {displayTime(gate.nextMajorEvent, 'local')} • {gate.nextMajorEvent.userClock} your time
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300">High Impact</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">{gate.countdown}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[gate.nextMajorEvent.dataStatus]}`}>{gate.nextMajorEvent.dataStatus}</span>
                      <span className={`text-[10px] font-semibold ${TIMING_TONE[gate.nextMajorEvent.timingStatus]}`}>Timing {gate.nextMajorEvent.timingStatus}</span>
                    </div>
                    <p className="mt-2 text-xs text-amber-300">Danger window: {gate.dangerWindow}</p>
                    {!gate.nextMajorEvent.timingConfirmed ? (
                      <p className="mt-1 text-[11px] text-sky-300">Timing not confirmed by an official schedule — treat the countdown as approximate.</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-white/60">No upcoming high-impact event in selected horizon.</p>
                )}

                {gate.nextRelevantEvent ? (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-300/80">Next market-relevant event • {focusAssets.join(' / ')}</p>
                    <p className="text-sm font-semibold text-white/90">
                      <span aria-hidden="true">{countryFlag(gate.nextRelevantEvent.countryCode)}</span> {CATEGORY_ICONS[gate.nextRelevantEvent.category]} {gate.nextRelevantEvent.eventName}
                      {gate.nextRelevantEvent.referencePeriod ? <span className="text-white/55"> ({gate.nextRelevantEvent.referencePeriod})</span> : null}
                    </p>
                    <p className="mt-1 text-xs text-white/65">{gate.nextRelevantEvent.country} • {displayTime(gate.nextRelevantEvent, 'local')} • {gate.relevantCountdown}</p>
                    <p className="mt-1 text-[10px] text-white/45">Relevance {gate.nextRelevantScore?.score ?? '--'}/100 — catalyst attention only, not a directional view.</p>
                  </div>
                ) : gate.nextMajorEvent && gate.nextRelevantScore ? (
                  <p className="mt-3 border-t border-white/10 pt-2 text-[10px] text-white/45">Also the most relevant catalyst for {focusAssets.join(' / ')} (relevance {gate.nextRelevantScore.score}/100).</p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-1" role="group" aria-label="Focus assets">
                  <span className="mr-1 text-[10px] uppercase tracking-wide text-white/40">Focus</span>
                  {ALL_FOCUS_ASSETS.map((asset) => (
                    <button
                      type="button"
                      key={asset}
                      aria-pressed={focusAssets.includes(asset)}
                      onClick={() => toggleFocusAsset(asset)}
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${focusAssets.includes(asset) ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200' : 'border-white/10 bg-white/5 text-white/50'}`}
                    >
                      {asset}
                    </button>
                  ))}
                </div>
              </article>
            </section>

            {(data?.warnings?.length ?? 0) > 0 ? (
              <section className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                {data!.warnings!.map((w) => <div key={w}>{w}</div>)}
              </section>
            ) : null}

            <section className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/60">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  Source: <span className="text-white/85">{data?.meta?.provider === 'curated' || !data?.meta ? 'Curated official-schedule seed (no live provider configured)' : `Live provider (${data.meta.provider}) + curated seed`}</span>
                </span>
                {data?.meta ? (
                  <span>
                    Provider: <span className={data.meta.providerStatus === 'LIVE' ? 'text-emerald-300' : data.meta.providerStatus === 'NOT_CONFIGURED' ? 'text-white/70' : 'text-amber-300'}>{data.meta.providerStatus}</span>
                  </span>
                ) : null}
                {data?.meta?.curatedCoverage ? (
                  <span className={data.meta.curatedCoverage.expiring ? 'text-amber-300' : ''}>
                    Seed coverage: {data.meta.curatedCoverage.daysRemaining ?? 0}d
                  </span>
                ) : null}
                {data?.lastUpdated ? <span>Generated: <span className="text-white/85">{new Date(data.lastUpdated).toLocaleString()}</span></span> : null}
                <span>Times: UTC internally; shown in {timeMode === 'user' ? `your zone (${userTz})` : timeMode === 'local' ? 'release-country local time' : 'ET'}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {(Object.keys(statusCounts) as DataStatus[]).map((status) => (
                  <span key={status} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[status]}`}>
                    {status} {statusCounts[status]}
                  </span>
                ))}
              </div>
            </section>

            {showJapanContext && japan ? (
              <section className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white/90"><span aria-hidden="true">{countryFlag('JP')}</span> BoJ Sensitivity Context</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[japan.dataStatus]}`}>{japan.dataStatus}</span>
                    <span className={`rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold ${leanTone(japan.lean)}`}>Lean: {japan.lean}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/75">Inflation trend: {japan.inflationTrend}</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 text-xs text-white/70 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: 'Tokyo CPI', point: japan.tokyoCpi, badge: 'LEADING INFLATION SIGNAL' },
                    { label: 'National CPI', point: japan.nationalCpi, badge: null },
                    { label: 'Wages', point: japan.wages, badge: null },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-white/85">{item.label}</span>
                        {item.badge ? <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-cyan-200">{item.badge}</span> : null}
                      </div>
                      {item.point ? (
                        <>
                          <div className="mt-1 text-white/60">{item.point.eventName}{item.point.referencePeriod ? ` (${item.point.referencePeriod})` : ''}</div>
                          <div className="mt-1">A: {item.point.actual ?? '--'}{item.point.actual !== null ? '%' : ''} • F: {item.point.consensus ?? '--'}{item.point.consensus !== null ? '%' : ''} • P: {item.point.previous ?? '--'}{item.point.previous !== null ? '%' : ''}</div>
                          <div className={`mt-1 text-[10px] ${item.point.isReleased ? 'text-white/50' : 'text-sky-300'}`}>{item.point.isReleased ? 'Released' : 'Upcoming'} • {item.point.dataStatus}</div>
                        </>
                      ) : (
                        <div className="mt-1 text-white/45">Not in loaded window.</div>
                      )}
                    </div>
                  ))}
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <span className="font-semibold text-white/85">Next BoJ decision</span>
                    {japan.nextBojDecision ? (
                      <>
                        <div className="mt-1 text-white/60">{japan.nextBojDecision.eventName}</div>
                        <div className="mt-1">{new Date(japan.nextBojDecision.releaseTimeUtc).toLocaleString()}</div>
                        <div className={`mt-1 text-[10px] ${japan.nextBojDecision.timingConfirmed ? 'text-white/50' : 'text-sky-300'}`}>{japan.nextBojDecision.timingConfirmed ? 'Timing confirmed' : 'Timing unconfirmed'}</div>
                      </>
                    ) : (
                      <div className="mt-1 text-white/45">None in loaded window.</div>
                    )}
                  </div>
                </div>
                <ul className="mt-2 space-y-1 text-[11px] text-white/60">
                  {japan.notes.map((note) => <li key={note}>• {note}</li>)}
                </ul>
              </section>
            ) : null}

            <section className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-white/60">
                <span>US Session Timeline (ET) — all enabled markets plotted at their ET release time</span>
                <span className="text-white/40">Today (ET): {todayEvents.length} events</span>
              </div>
              <div className="relative h-10 rounded-lg border border-white/10 bg-black/20">
                <div className="absolute inset-y-0 left-0 w-[34%] border-r border-white/10" title="Pre-market" />
                <div className="absolute inset-y-0 left-[34%] w-[10%] border-r border-white/10" title="Open" />
                <div className="absolute inset-y-0 left-[44%] w-[32%] border-r border-white/10" title="Midday" />
                <div className="absolute inset-y-0 left-[76%] w-[16%] border-r border-white/10" title="Power Hour" />
                <div className="absolute inset-y-0 right-0 w-[8%]" title="Close" />
                {todayEvents.map((event) => {
                  const left = Math.min(100, Math.max(0, ((event.minuteOfDay - 240) / (1200 - 240)) * 100));
                  return (
                    <span
                      key={event.id}
                      title={`${event.countryCode} ${event.eventName} • ${formatEt(event.time)} • ${event.impact.toUpperCase()}`}
                      className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full ${event.impact === 'high' ? 'bg-rose-400' : event.impact === 'medium' ? 'bg-amber-400' : 'bg-slate-400'}`}
                      style={{ left: `${left}%` }}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-white/45">
                <span>Pre-market</span><span>Open</span><span>Midday</span><span>Power hour</span><span>Close</span>
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-white/45">Country / region</div>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Country filter">
                {(['GLOBAL', ...PRIMARY_COUNTRIES] as CountryFilter[]).map((code) => (
                  <button
                    type="button"
                    key={code}
                    aria-pressed={selectedCountry === code}
                    onClick={() => setSelectedCountry(code)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${selectedCountry === code ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-white/5 text-white/70'}`}
                  >
                    {code !== 'GLOBAL' ? <span aria-hidden="true">{countryFlag(code)}</span> : null}
                    <span>{code}</span>
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-white/10" aria-hidden="true" />
                {SECONDARY_COUNTRIES.map((code) => (
                  <button
                    type="button"
                    key={code}
                    aria-pressed={selectedCountry === code}
                    onClick={() => setSelectedCountry(code)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] ${selectedCountry === code ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-white/5 text-white/55'}`}
                  >
                    <span aria-hidden="true">{countryFlag(code)}</span>
                    <span>{code}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'high', 'medium', 'low'] as const).map((impact) => (
                  <button
                    type="button"
                    key={impact}
                    onClick={() => setImpactFilter(impact)}
                    className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs ${impactFilter === impact ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-white/5 text-white/70'}`}
                  >
                    {impact === 'all' ? 'All' : impact[0].toUpperCase() + impact.slice(1)} Impact
                  </button>
                ))}
                {categoryList.map((category) => (
                  <button
                    type="button"
                    key={category}
                    onClick={() => toggleCategory(category)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs ${selectedCategories.includes(category) ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200' : 'border-white/10 bg-white/5 text-white/70'}`}
                  >
                    <span>{CATEGORY_ICONS[category]}</span>
                    <span>{category.replaceAll('_', ' ')}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1 text-xs text-white/70">
                  <input id="hide-low-impact" name="hideLowImpact" type="checkbox" checked={hideLowImpact} onChange={(event) => setHideLowImpact(event.target.checked)} /> Hide Low Impact
                </label>
                <div className="inline-flex overflow-hidden rounded-lg border border-white/10" role="group" aria-label="Time display">
                  {([['user', 'My time'], ['local', 'Release local'], ['et', 'ET']] as const).map(([mode, label]) => (
                    <button
                      type="button"
                      key={mode}
                      aria-pressed={timeMode === mode}
                      onClick={() => setTimeMode(mode)}
                      className={`px-3 py-1.5 text-xs ${timeMode === mode ? 'bg-emerald-500/15 text-emerald-200' : 'bg-white/5 text-white/70'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { title: 'Total Events', value: enrichedEvents.length },
                { title: 'High Impact', value: enrichedEvents.filter((event) => event.impact === 'high').length },
                { title: 'Central Bank', value: enrichedEvents.filter((event) => event.category === 'central_bank').length },
                {
                  title:
                    enrichedEvents.filter((event) => event.category === 'inflation').length >= enrichedEvents.filter((event) => event.category === 'employment').length
                      ? 'Inflation'
                      : 'Jobs',
                  value:
                    enrichedEvents.filter((event) => event.category === 'inflation').length >= enrichedEvents.filter((event) => event.category === 'employment').length
                      ? enrichedEvents.filter((event) => event.category === 'inflation').length
                      : enrichedEvents.filter((event) => event.category === 'employment').length,
                },
              ].map((item) => (
                <article key={item.title} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-2xl font-bold text-white/90">{item.value}</div>
                  <div className="text-xs text-white/60">{item.title}</div>
                  <div className={`mt-1 text-[10px] ${gate.highImpactCountNext24h > 1 ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {gate.highImpactCountNext24h > 1 ? 'Event risk elevated' : 'Risk manageable'}
                  </div>
                </article>
              ))}
            </section>

            <section className="mt-4 space-y-3">
              {Object.keys(grouped).length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-xs text-white/55">No events match the current country / impact / category filters.</div>
              ) : null}
              {Object.entries(grouped).map(([date, events]) => {
                const highImpactCount = events.filter((event) => event.impact === 'high').length;
                const density = events.length >= 5 || highImpactCount >= 2 ? 'High' : events.length >= 3 ? 'Medium' : 'Low';
                return (
                  <article key={date} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-white/90">{formatDate(date)}</h3>
                        <p className="text-xs text-white/55">{highImpactCount} high impact / {events.length} total</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs ${density === 'High' ? 'bg-rose-500/20 text-rose-300' : density === 'Medium' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        Density: {density}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {events.map((event) => (
                        <div key={event.id} className="grid grid-cols-12 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 hover:bg-white/[0.07]">
                          <div className="col-span-12 sm:col-span-2 text-xs text-white/70">
                            <div className="flex items-center gap-1.5">
                              <span aria-hidden="true" className="text-base leading-none">{countryFlag(event.countryCode)}</span>
                              <span className="text-[10px] font-bold tracking-wide text-white/60">{event.countryCode}</span>
                            </div>
                            <div className="mt-0.5 font-medium text-white/85" title={`UTC ${event.releaseTimeUtc}`}>{displayTime(event, timeMode)}</div>
                            {timeMode !== 'local' ? <div className="text-[10px] text-white/45">{event.releaseTimeLocal} local</div> : null}
                            <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] text-white/60">{event.session}</span>
                          </div>
                          <div className="col-span-12 sm:col-span-4">
                            <p className="text-sm font-medium text-white/90">
                              {CATEGORY_ICONS[event.category] ?? 'MAC'} {event.eventName}
                              {event.referencePeriod ? <span className="text-white/50"> ({event.referencePeriod})</span> : null}
                            </p>
                            <p className="text-xs text-white/55">{event.country} • {event.category.replaceAll('_', ' ')} • {event.currency}</p>
                            {event.tags.length ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {event.tags.map((tag) => <span key={tag} className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-cyan-200">{tag}</span>)}
                              </div>
                            ) : null}
                          </div>
                          <div className="col-span-6 sm:col-span-2 text-xs text-white/65">
                            <div>F: {event.display.consensus}</div>
                            <div>P: {event.display.previous}{event.revisedPrevious !== null ? <span className="text-white/40"> (rev)</span> : null}</div>
                            <div className={event.isReleased && event.actual !== null ? 'font-semibold text-white/90' : ''}>
                              A: {event.display.actual}
                              {event.releaseStatus === 'REVISED' && event.revisedActual !== null ? <span className="text-orange-300"> → {event.revisedActual}{event.unit === '%' ? '%' : ''}</span> : null}
                            </div>
                          </div>
                          <div className="col-span-6 sm:col-span-2 text-xs">
                            {event.surprise ? (
                              <>
                                <div className={`font-semibold ${leanTone(event.surprise.lean)}`}>Δ: {event.surprise.label}</div>
                                <div className={`text-[10px] ${leanTone(event.surprise.lean)}`}>{event.surprise.lean === 'NEUTRAL' ? 'In line' : `${event.surprise.lean} read`}{event.surprise.normalized !== null ? ` • ${event.surprise.normalized}σ-eq` : ''}</div>
                              </>
                            ) : (
                              <>
                                <div className="text-white/45">Δ: --</div>
                                <div className="text-[10px] text-white/40">Above F → {event.assetImpact.ifAbove} • Below F → {event.assetImpact.ifBelow}</div>
                              </>
                            )}
                          </div>
                          <div className="col-span-6 sm:col-span-1 flex flex-col items-start gap-1">
                            <span className={`rounded-full px-2 py-0.5 text-xs ${event.impact === 'high' ? 'bg-rose-500/20 text-rose-300' : event.impact === 'medium' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-500/20 text-slate-300'}`}>
                              {event.impact.toUpperCase()}
                            </span>
                            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_TONE[event.dataStatus]}`} title={event.statusDetail}>{event.dataStatus}</span>
                            <span className={`text-[9px] ${TIMING_TONE[event.timingStatus]}`} title={`Source authority: ${event.sourceAuthority} • confidence ${event.confidence}`}>{event.timingStatus} • {event.sourceAuthority}</span>
                            <span className={`text-[9px] ${RELEASE_TONE[event.releaseStatus]}`}>{event.releaseStatus}</span>
                          </div>
                          <div className="col-span-6 sm:col-span-1 flex flex-wrap justify-end gap-1">
                            {event.sourceUrl ? (
                              <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" title={event.source} className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/70">Source</a>
                            ) : null}
                            <Link href="/tools/macro" className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/70">Macro</Link>
                            {showAdminTools ? <button type="button" onClick={() => { /* Future: post event to Discord */ }} className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">Post</button> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </section>

            <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <article className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-white/90">If High Impact Today</h3>
                <ul className="space-y-1 text-xs text-white/65">
                  <li>• Expect volatility expansion and opening whipsaw around print windows.</li>
                  <li>• Compare leaders with market breadth; volatility is historically elevated.</li>
                  <li>• Wait for post-window confirmation before escalating a scenario.</li>
                </ul>
              </article>
              <article className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-white/90">If Low Impact Today</h3>
                <ul className="space-y-1 text-xs text-white/65">
                  <li>• Trend-following context is generally cleaner.</li>
                  <li>• Standard risk review assumptions apply.</li>
                  <li>• Best windows are post-open trend continuation and power hour.</li>
                </ul>
              </article>
            </section>

            {showAdminTools ? (
              <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-white/85">Admin Tools</summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">Post daily macro summary to Discord</button>
                  <button type="button" className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">Schedule pre/post alerts</button>
                  <button type="button" className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300">Override review state</button>
                </div>
              </details>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
