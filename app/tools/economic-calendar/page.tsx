'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ToolsPageHeader from '@/components/ToolsPageHeader';
import { useUserTier } from '@/lib/useUserTier';

interface EconomicEvent {
  date: string;
  time: string;
  event: string;
  country: string;
  impact: 'high' | 'medium' | 'low';
  category: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

interface CalendarData {
  events: EconomicEvent[];
  grouped: Record<string, EconomicEvent[]>;
  count: number;
  nextMajorEvent: EconomicEvent | null;
  daysUntilMajor: number | null;
}

type SessionTag = 'PRE' | 'RTH' | 'AH';
type PermissionState = 'YES' | 'CONDITIONAL' | 'NO';

const CATEGORY_ICONS: Record<string, string> = {
  employment: '👔',
  inflation: '📈',
  central_bank: '🏛️',
  gdp: '📊',
  consumer: '🛒',
  manufacturing: '🏭',
};

const categoryList = ['employment', 'inflation', 'central_bank', 'gdp', 'consumer', 'manufacturing'];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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

function etNowParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    minutes: parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10),
  };
}

function isFedDayEvent(eventName: string) {
  const normalized = eventName.toLowerCase();
  return normalized.includes('fomc') || normalized.includes('powell') || normalized.includes('rate decision');
}

function isJobsOrCpiEvent(eventName: string) {
  const normalized = eventName.toLowerCase();
  return normalized.includes('payroll') || normalized.includes('unemployment') || normalized.includes('cpi');
}

export default function EconomicCalendarPage() {
  const { isAdmin } = useUserTier();
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [impactFilter, setImpactFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [hideLowImpact, setHideLowImpact] = useState(false);
  const [showET, setShowET] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  useEffect(() => {
    const fetchCalendar = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({ days: days.toString(), impact: 'all' });
        const res = await fetch(`/api/economic-calendar?${params}`);
        if (!res.ok) throw new Error('Failed to fetch calendar');
        const json = await res.json();
        setData(json);
        setError(null);
      } catch (err) {
        setError('Failed to load economic calendar');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchCalendar();
  }, [days]);

  const enrichedEvents = useMemo(() => {
    if (!data?.events) return [];
    return data.events
      .map((event) => {
        const minuteOfDay = toMinutes(event.time);
        return {
          ...event,
          minuteOfDay,
          session: inferSession(minuteOfDay),
        };
      })
      .filter((event) => (impactFilter === 'all' ? true : event.impact === impactFilter))
      .filter((event) => (hideLowImpact ? event.impact !== 'low' : true))
      .filter((event) => (selectedCategories.length ? selectedCategories.includes(event.category) : true));
  }, [data, impactFilter, hideLowImpact, selectedCategories]);

  const grouped = useMemo(() => {
    const map: Record<string, (EconomicEvent & { minuteOfDay: number; session: SessionTag })[]> = {};
    for (const event of enrichedEvents) {
      if (!map[event.date]) map[event.date] = [];
      map[event.date].push(event);
    }
    Object.keys(map).forEach((date) => {
      map[date].sort((a, b) => a.minuteOfDay - b.minuteOfDay);
    });
    return map;
  }, [enrichedEvents]);

  const gate = useMemo(() => {
    const nowEt = etNowParts();
    const next24 = enrichedEvents.filter((event) => {
      const eventDate = new Date(`${event.date}T00:00:00`);
      const nowDate = new Date(`${nowEt.date}T00:00:00`);
      const dayDiff = Math.round((eventDate.getTime() - nowDate.getTime()) / 86400000);
      const minutesToEvent = dayDiff * 1440 + (event.minuteOfDay - nowEt.minutes);
      return minutesToEvent >= 0 && minutesToEvent <= 1440;
    });

    const nextHigh = next24.filter((event) => event.impact === 'high');
    const closestHighMinutes = nextHigh
      .map((event) => {
        const eventDate = new Date(`${event.date}T00:00:00`);
        const nowDate = new Date(`${nowEt.date}T00:00:00`);
        const dayDiff = Math.round((eventDate.getTime() - nowDate.getTime()) / 86400000);
        return dayDiff * 1440 + (event.minuteOfDay - nowEt.minutes);
      })
      .filter((minutes) => minutes >= 0)
      .sort((a, b) => a - b)[0] ?? 9999;

    const isFedDay = next24.some((event) => isFedDayEvent(event.event));
    const isJobsOrCpi = next24.some((event) => isJobsOrCpiEvent(event.event));
    const highImpactCountNext24h = nextHigh.length;
    const highImpactWithinNext120m = nextHigh.some((event) => {
      const eventDate = new Date(`${event.date}T00:00:00`);
      const nowDate = new Date(`${nowEt.date}T00:00:00`);
      const dayDiff = Math.round((eventDate.getTime() - nowDate.getTime()) / 86400000);
      const mins = dayDiff * 1440 + (event.minuteOfDay - nowEt.minutes);
      return mins >= 0 && mins <= 120;
    });

    let permission: PermissionState = 'YES';
    if (closestHighMinutes <= 30) permission = 'NO';
    else if (highImpactCountNext24h >= 2 || isFedDay) permission = 'CONDITIONAL';

    const volRegime = closestHighMinutes <= 60 || isFedDay
      ? 'Event Shock'
      : highImpactCountNext24h >= 2
        ? 'Expansion'
        : 'Compression';

    const riskState = isFedDay || isJobsOrCpi ? 'Risk-Off' : highImpactCountNext24h ? 'Neutral' : 'Risk-On';
    const liquidity = closestHighMinutes <= 60 ? 'Spiky' : highImpactCountNext24h >= 2 ? 'Thin' : 'Stable';
    const density = highImpactCountNext24h >= 3 ? 'High' : highImpactCountNext24h >= 1 ? 'Medium' : 'Low';
    const executionMode = permission === 'NO' ? 'Sit Out' : volRegime === 'Compression' ? 'Trend' : 'Mean Revert';
    const sessionNow = inferSession(nowEt.minutes);

    const nextMajorEvent = enrichedEvents.find((event) => event.impact === 'high') || null;
    const countdown = (() => {
      if (!nextMajorEvent) return 'No major catalyst';
      const eventDate = new Date(`${nextMajorEvent.date}T00:00:00`);
      const nowDate = new Date(`${nowEt.date}T00:00:00`);
      const dayDiff = Math.round((eventDate.getTime() - nowDate.getTime()) / 86400000);
      const totalMinutes = Math.max(0, dayDiff * 1440 + (nextMajorEvent.minuteOfDay - nowEt.minutes));
      const daysOut = Math.floor(totalMinutes / 1440);
      const hoursOut = Math.floor((totalMinutes % 1440) / 60);
      return `${daysOut}d ${hoursOut}h`;
    })();

    const shockEvent = nextMajorEvent ? (isFedDayEvent(nextMajorEvent.event) || isJobsOrCpiEvent(nextMajorEvent.event)) : false;
    const dangerWindow = shockEvent ? 'T-30 → T+30' : 'T-15 → T+15';

    return {
      permission,
      riskState,
      volRegime,
      liquidity,
      density,
      executionMode,
      sessionNow,
      highImpactCountNext24h,
      highImpactWithinNext120m,
      isFedDay,
      isJobsOrCpi,
      closestHighMinutes,
      nextMajorEvent,
      countdown,
      dangerWindow,
      reason:
        permission === 'NO'
          ? 'High-impact print is inside immediate danger window; avoid new deployment.'
          : permission === 'CONDITIONAL'
            ? 'Catalyst density is elevated; deploy selectively with tighter risk.'
            : 'No immediate high-impact shock window; normal deployment permitted.',
    };
  }, [enrichedEvents]);

  const todayEvents = useMemo(() => {
    const today = etNowParts().date;
    return enrichedEvents.filter((event) => event.date === today);
  }, [enrichedEvents]);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((item) => item !== category) : [...prev, category]
    );
  };

  return (
    <div className="min-h-screen bg-[var(--msp-bg)] text-white">
      <ToolsPageHeader
        badge="MACRO CALENDAR"
        title="Economic Calendar"
        subtitle="Market-moving events fast — FOMC, jobs, inflation, rates."
        icon="📅"
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
            <button onClick={() => setDays((current) => current)} className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
              Refresh
            </button>
          </div>
        }
      />

      <main className="mx-auto max-w-none px-4 pb-16">
        {loading && <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/60">Loading macro catalyst map...</div>}
        {error && <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}

        {!loading && !error && (
          <>
            <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <article className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm lg:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white/90">Macro Permission Gate</h2>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                    gate.permission === 'YES'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : gate.permission === 'NO'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    PERMISSION: {gate.permission}
                  </span>
                </div>
                <p className="mb-3 text-sm text-white/70">{gate.reason}</p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {[
                    `Risk State: ${gate.riskState}`,
                    `Volatility Risk: ${gate.volRegime}`,
                    `Liquidity Window: ${gate.liquidity}`,
                    `Catalyst Density: ${gate.density}`,
                    `Execution Mode: ${gate.executionMode}`,
                  ].map((chip) => (
                    <span key={chip} className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/80">
                      {chip}
                    </span>
                  ))}
                </div>
                <ul className="space-y-1 text-xs text-white/70">
                  <li>• No new size 15 min pre/post high-impact prints.</li>
                  <li>• Trade leaders only and reduce leverage during expansion.</li>
                  <li>• Avoid breakout chasing when event shock risk is active.</li>
                </ul>
              </article>

              <article className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-white/90">Next Major Event Countdown</h3>
                {gate.nextMajorEvent ? (
                  <>
                    <p className="text-sm font-semibold text-white/90">{CATEGORY_ICONS[gate.nextMajorEvent.category]} {gate.nextMajorEvent.event}</p>
                    <p className="mt-1 text-xs text-white/65">{formatDate(gate.nextMajorEvent.date)} • {formatEt(gate.nextMajorEvent.time)}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300">High Impact</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">{gate.countdown}</span>
                    </div>
                    <p className="mt-2 text-xs text-amber-300">Danger window: {gate.dangerWindow}</p>
                  </>
                ) : (
                  <p className="text-xs text-white/60">No upcoming high-impact event in selected horizon.</p>
                )}
              </article>
            </section>

            <section className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-white/60">
                <span>US Session Timeline</span>
                <span>Current session: {gate.sessionNow}</span>
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
                      key={`${event.date}-${event.time}-${event.event}`}
                      title={`${event.event} • ${formatEt(event.time)} • ${event.impact.toUpperCase()}`}
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

            <section className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'high', 'medium', 'low'] as const).map((impact) => (
                  <button
                    key={impact}
                    onClick={() => setImpactFilter(impact)}
                    className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs ${impactFilter === impact ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-white/5 text-white/70'}`}
                  >
                    {impact === 'all' ? 'All' : impact[0].toUpperCase() + impact.slice(1)} Impact
                  </button>
                ))}
                {categoryList.map((category) => (
                  <button
                    key={category}
                    onClick={() => toggleCategory(category)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs ${selectedCategories.includes(category) ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200' : 'border-white/10 bg-white/5 text-white/70'}`}
                  >
                    <span>{CATEGORY_ICONS[category]}</span>
                    <span>{category.replace('_', ' ')}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1 text-xs text-white/70">
                  <input type="checkbox" checked={hideLowImpact} onChange={(event) => setHideLowImpact(event.target.checked)} /> Hide Low Impact
                </label>
                <button
                  onClick={() => setShowET((current) => !current)}
                  className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70"
                >
                  {showET ? 'Show ET' : 'Show Local'}
                </button>
              </div>
            </section>

            <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                        <div key={`${event.date}-${event.time}-${event.event}`} className="grid grid-cols-12 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 hover:bg-white/[0.07]">
                          <div className="col-span-12 sm:col-span-2 text-xs text-white/70">
                            <div>{showET ? formatEt(event.time) : new Date(`${event.date}T${event.time}:00`).toLocaleTimeString()}</div>
                            <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] text-white/60">{event.session}</span>
                          </div>
                          <div className="col-span-12 sm:col-span-5">
                            <p className="text-sm font-medium text-white/90">{CATEGORY_ICONS[event.category]} {event.event}</p>
                            <p className="text-xs text-white/55">{event.category.replace('_', ' ')} • {event.country}</p>
                          </div>
                          <div className="col-span-12 sm:col-span-2 text-xs text-white/65">
                            <div>F: {event.forecast || '--'}</div>
                            <div>P: {event.previous || '--'}</div>
                            <div>A: {event.actual || '--'}</div>
                          </div>
                          <div className="col-span-4 sm:col-span-1">
                            <span className={`rounded-full px-2 py-0.5 text-xs ${event.impact === 'high' ? 'bg-rose-500/20 text-rose-300' : event.impact === 'medium' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-500/20 text-slate-300'}`}>
                              {event.impact.toUpperCase()}
                            </span>
                          </div>
                          <div className="col-span-8 sm:col-span-2 flex flex-wrap justify-end gap-1">
                            <button className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/70">Set Alert</button>
                            <Link href="/tools/macro" className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/70">Open Macro</Link>
                            {isAdmin ? <button className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">Post</button> : null}
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
                  <li>• Expect vol expansion and opening whipsaw around print windows.</li>
                  <li>• Trade leaders only and reduce position size.</li>
                  <li>• Avoid breakout chasing until post-window confirmation.</li>
                </ul>
              </article>
              <article className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-white/90">If Low Impact Today</h3>
                <ul className="space-y-1 text-xs text-white/65">
                  <li>• Trend-following permission is generally open.</li>
                  <li>• Standard sizing is allowed with normal risk controls.</li>
                  <li>• Best windows are post-open trend continuation and power hour.</li>
                </ul>
              </article>
            </section>

            {isAdmin ? (
              <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-white/85">Admin Tools</summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">Post daily macro summary to Discord</button>
                  <button className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">Schedule pre/post alerts</button>
                  <button className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300">Override permission output</button>
                </div>
              </details>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
