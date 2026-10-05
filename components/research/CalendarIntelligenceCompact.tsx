'use client';

import { useEffect, useState } from 'react';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import { countryFlag, PRIMARY_COUNTRIES, SECONDARY_COUNTRIES } from '@/lib/macro/calendar/countries';
import { ALL_FOCUS_ASSETS } from '@/lib/macro/calendar/relevance';
import type { AssetTag, CountryCode, CountryFilter, DataStatus, EventCategory } from '@/lib/macro/calendar/types';
import { marketText } from '@/lib/marketsPresentation';

export type CalendarIntelEvent = {
  id: string;
  name: string;
  country: string;
  countryCode: CountryCode;
  impact: string;
  releaseMs: number;
  when: string;
  actual: string;
  forecast: string;
  previous: string;
  status: string;
  timing: string;
  sourceUrl: string | null;
};

export type CalendarIntelligenceCompactProps = {
  loading: boolean;
  error: string | null;
  events: CalendarIntelEvent[];
  nowMs: number;
  countdown: string;
  nextEventName: string | null;
  reviewState: string;
  reason: string;
  riskState: string;
  volRegime: string;
  liquidity: string;
  density: string;
  researchMode: string;
  dangerWindow: string;
  warnings: string[];
  days: number;
  onDays: (days: number) => void;
  onRefresh: () => void;
  impact: 'all' | 'high' | 'medium' | 'low';
  onImpact: (impact: 'all' | 'high' | 'medium' | 'low') => void;
  hideLowImpact: boolean;
  onHideLowImpact: (value: boolean) => void;
  timeMode: 'user' | 'local' | 'et';
  onTimeMode: (mode: 'user' | 'local' | 'et') => void;
  userTz: string;
  country: CountryFilter;
  onCountry: (country: CountryFilter) => void;
  categories: string[];
  onToggleCategory: (category: string) => void;
  focusAssets: AssetTag[];
  onToggleFocus: (asset: AssetTag) => void;
  japan: { dataStatus: string; lean: string; inflationTrend: string; nextDecision: string | null; notes: string[] } | null;
  sourceLabel: string;
  sourceAsOf?: string | null;
  sourceBasis: string;
  statusCounts: Record<DataStatus, number>;
};

const CATEGORIES: EventCategory[] = ['employment', 'inflation', 'central_bank', 'gdp', 'pmi', 'consumer', 'manufacturing', 'wages'];
const control = 'min-h-10 max-w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80';

function clean(value: unknown): string {
  const text = marketText(value);
  return text === '--' || text === '—' ? 'Not collected' : text;
}

function reviewWord(state: string): string {
  if (state === 'CLEAR') return 'Clear';
  if (state === 'BLOCKED') return 'Shock window';
  if (state === 'CAUTION') return 'Caution';
  return clean(state);
}

function statusWord(status: string): string {
  if (status === 'MISSING') return 'Not collected';
  if (status === 'LIVE') return 'Live';
  if (status === 'DELAYED') return 'Delayed';
  if (status === 'STALE') return 'Older';
  if (status === 'UNCONFIRMED') return 'Unconfirmed';
  return clean(status);
}

/** Presentation only. Calendar selection, countdowns and provider fetches stay in the page. */
export default function CalendarIntelligenceCompact(props: CalendarIntelligenceCompactProps) {
  const [showAll, setShowAll] = useState(false);
  const filterKey = `${props.days}|${props.impact}|${props.hideLowImpact}|${props.country}|${props.categories.join(',')}|${props.timeMode}|${props.focusAssets.join(',')}`;
  useEffect(() => { setShowAll(false); }, [filterKey]);
  const upcoming = props.events.filter((event) => event.releaseMs >= props.nowMs);
  const preview = upcoming.slice(0, 5);
  const visible = showAll ? props.events : preview;
  const verdict = props.loading
    ? 'Loading calendar intelligence…'
    : props.error
      ? 'Calendar intelligence could not be loaded'
      : props.nextEventName
        ? `${props.countdown} · ${clean(props.nextEventName)}`
        : upcoming.length
          ? `${upcoming.length} upcoming events in this filter`
          : props.events.length
            ? 'No upcoming events in this filter'
            : 'No events match this filter';

  return (
    <section aria-label="Calendar intelligence" className="min-w-0 max-w-full space-y-3">
      <p data-research-verdict role="status" className="break-words text-lg font-semibold">{verdict}</p>
      {props.error ? <p className="text-sm text-amber-200">No current calendar is shown. Use Refresh to try again.</p> : null}
      {props.warnings[0] ? <p className="break-words text-xs text-amber-200">{clean(props.warnings[0])}</p> : null}

      {!props.loading && !props.error && visible.length === 0 ? (
        <p className="text-sm text-slate-400">{props.events.length ? 'No upcoming events in this filter. Show all to inspect earlier entries.' : 'No events match the current country, impact, or category filters.'}</p>
      ) : null}

      {!props.loading && !props.error && visible.length > 0 ? (
        <ul aria-label="Calendar events" className="min-w-0 divide-y divide-white/10">
          {visible.map((event) => (
            <li key={event.id} data-calendar-intel-event className="min-w-0 py-3">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-semibold">
                  <span aria-hidden="true">{countryFlag(event.countryCode)} </span>
                  {clean(event.name)}
                </p>
                <span className="text-xs text-amber-200">{clean(event.impact)} impact</span>
              </div>
              <p className="break-words text-xs text-slate-400">{clean(event.country)} · {event.when}</p>
              <CollapsibleSection title="Release values" summary={clean(event.actual)}>
                <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                  {[['Forecast', event.forecast], ['Previous', event.previous], ['Actual', event.actual]].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="break-words">{clean(value)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 break-words text-xs text-slate-400">{statusWord(event.status)} · timing {clean(event.timing)}</p>
                {event.sourceUrl ? <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-emerald-300">Source</a> : null}
              </CollapsibleSection>
            </li>
          ))}
        </ul>
      ) : null}

      {!props.loading && !props.error && props.events.length > preview.length ? (
        <button type="button" className={control} onClick={() => setShowAll((open) => !open)}>
          {showAll ? 'Next five' : `Show all ${props.events.length}`}
        </button>
      ) : null}

      <CollapsibleSection title="Filters" summary={`${props.days} day window · ${clean(props.country)}`}>
        <div className="flex min-w-0 flex-wrap gap-2">
          <label className="text-xs text-slate-400">
            Horizon
            <select aria-label="Calendar horizon" value={props.days} onChange={(event) => props.onDays(Number(event.target.value))} className={`${control} ml-2`}>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </label>
          <button type="button" className={control} onClick={props.onRefresh}>Refresh</button>
          <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Impact filter">
            {(['all', 'high', 'medium', 'low'] as const).map((impact) => (
              <button type="button" key={impact} aria-pressed={props.impact === impact} className={control} onClick={() => props.onImpact(impact)}>
                {impact === 'all' ? 'All impact' : `${impact[0].toUpperCase()}${impact.slice(1)} impact`}
              </button>
            ))}
          </div>
          <label className="inline-flex min-h-10 items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={props.hideLowImpact} onChange={(event) => props.onHideLowImpact(event.target.checked)} />
            Hide low impact
          </label>
          <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Time display">
            {([['user', 'My time'], ['local', 'Release local'], ['et', 'New York']] as const).map(([mode, label]) => (
              <button type="button" key={mode} aria-pressed={props.timeMode === mode} className={control} onClick={() => props.onTimeMode(mode)}>{label}</button>
            ))}
          </div>
          <p className="w-full break-words text-[11px] text-slate-500">Times follow {props.timeMode === 'user' ? props.userTz : props.timeMode === 'local' ? 'the release country' : 'New York'}.</p>
          <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Country filter">
            {(['GLOBAL', ...PRIMARY_COUNTRIES, ...SECONDARY_COUNTRIES] as CountryFilter[]).map((code) => (
              <button type="button" key={code} aria-pressed={props.country === code} className={control} onClick={() => props.onCountry(code)}>
                {code === 'GLOBAL' ? 'Global' : code}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Category filter">
            {CATEGORIES.map((category) => (
              <button type="button" key={category} aria-pressed={props.categories.includes(category)} className={control} onClick={() => props.onToggleCategory(category)}>
                {category.replaceAll('_', ' ')}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Focus assets">
            {ALL_FOCUS_ASSETS.map((asset) => (
              <button type="button" key={asset} aria-pressed={props.focusAssets.includes(asset)} className={control} onClick={() => props.onToggleFocus(asset)}>{asset}</button>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Review context" summary={reviewWord(props.reviewState)}>
        <p className="break-words text-sm text-slate-300">{clean(props.reason)}</p>
        <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          {[
            ['Risk state', props.riskState],
            ['Volatility', props.volRegime],
            ['Liquidity', props.liquidity],
            ['Catalyst density', props.density],
            ['Research mode', props.researchMode],
            ['Shock window', props.dangerWindow],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-slate-500">{label}</dt>
              <dd className="break-words">{clean(value)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 break-words text-xs text-slate-400">
          {(['LIVE', 'DELAYED', 'STALE', 'MISSING', 'UNCONFIRMED'] as DataStatus[]).map((status) => `${statusWord(status)} ${props.statusCounts[status]}`).join(' · ')}
        </p>
        {props.japan ? (
          <div className="mt-3 min-w-0">
            <p className="text-sm font-semibold">Japan policy context</p>
            <p className="mt-1 break-words text-xs text-slate-300">{statusWord(props.japan.dataStatus)} · lean {clean(props.japan.lean)} · inflation {clean(props.japan.inflationTrend)}</p>
            <p className="break-words text-xs text-slate-400">{props.japan.nextDecision ? `Next decision: ${clean(props.japan.nextDecision)}` : 'No decision in the loaded window.'}</p>
            {props.japan.notes.slice(0, 5).map((note, index) => <p key={`${index}-${note}`} className="break-words text-xs text-slate-500">{clean(note)}</p>)}
          </div>
        ) : null}
      </CollapsibleSection>

      {!props.loading && !props.error ? (
        <SourceLine source={props.sourceLabel} asOf={props.sourceAsOf} basis={props.sourceBasis} />
      ) : null}
    </section>
  );
}
