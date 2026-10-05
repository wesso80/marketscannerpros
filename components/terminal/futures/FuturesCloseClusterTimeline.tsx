'use client';

import { useState } from 'react';
import type { FuturesAnchorMode, FuturesCloseCalendarResponse, FuturesCloseCalendarRow } from '@/lib/terminal/futures/futuresCloseCalendar';
import CollapsibleSection from '@/components/visual/CollapsibleSection';

type FuturesCloseClusterTimelineProps = {
  closeCalendar: FuturesCloseCalendarResponse;
};

const PREVIEW_COUNT = 5;

const ANCHOR_LABEL: Record<FuturesAnchorMode, string> = {
  globex: 'Globex',
  rth: 'Regular hours',
  cash_bridge: 'Cash bridge',
};

const CATEGORY_LABEL: Record<FuturesCloseCalendarRow['category'], string> = {
  intraday: 'Intraday',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return 'Time not supplied';
  if (minutes <= 0) return 'Now';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) {
    return [`${days}d`, hours > 0 ? `${hours}h` : '', mins > 0 ? `${mins}m` : ''].filter(Boolean).join(' ');
  }
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

function formatClose(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Time not supplied';
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  return `${formatted} ET`;
}

export default function FuturesCloseClusterTimeline({ closeCalendar }: FuturesCloseClusterTimelineProps) {
  const schedule = closeCalendar?.schedule ?? [];
  const clusters = closeCalendar?.clusters ?? [];
  const timeline = closeCalendar?.timeline ?? [];
  const warnings = closeCalendar?.warnings ?? [];
  const scheduleKey = `${closeCalendar?.symbol ?? ''}|${closeCalendar?.anchorMode ?? ''}|${closeCalendar?.horizonDays ?? ''}`;
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const showAll = expandedKey === scheduleKey;
  const visible = showAll ? schedule : schedule.slice(0, PREVIEW_COUNT);
  const anchor = closeCalendar?.anchorMode ? ANCHOR_LABEL[closeCalendar.anchorMode] : 'Schedule basis not supplied';
  const detailSummary = [
    timeline.length ? `${timeline.length} markers` : '',
    clusters.length ? `${clusters.length} groups` : '',
  ].filter(Boolean).join(' · ');

  return (
    <section className="min-w-0 rounded-lg border border-emerald-500/25 bg-slate-950/50 p-3" aria-label="Futures close calendar timeline">
      <div className="mb-2 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="rounded border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-200">Close Calendar</span>
        <span className="min-w-0 break-words text-xs text-slate-400">{anchor} · {schedule.length} upcoming</span>
      </div>

      {warnings.length > 0 && (
        <p className="mb-2 break-words text-xs leading-5 text-amber-100">{warnings.join(' ')}</p>
      )}

      {schedule.length === 0 ? (
        <p className="text-xs text-slate-500">No upcoming closes in this range.</p>
      ) : (
        <ul aria-label="Upcoming closes" className="min-w-0 space-y-1">
          {visible.map((row) => (
            <li key={row.timeframe} data-futures-close-row className="min-w-0 break-words rounded border border-white/10 bg-slate-900/40 px-2 py-1 text-xs leading-5">
              <span className="font-semibold text-emerald-200">{row.timeframe}</span>
              <span className="text-slate-300"> · {CATEGORY_LABEL[row.category]}</span>
              <span className="font-mono text-cyan-200"> · {formatMinutes(row.minutesToClose)}</span>
              <span className="text-slate-400"> · {formatClose(row.nextCloseISO)}</span>
            </li>
          ))}
        </ul>
      )}

      {schedule.length > PREVIEW_COUNT && (
        <button type="button" className="mt-2 min-h-10 max-w-full rounded-lg border border-slate-700 px-3 text-sm" onClick={() => setExpandedKey(showAll ? null : scheduleKey)}>
          {showAll ? 'Show five' : `Show all ${schedule.length}`}
        </button>
      )}

      {(timeline.length > 0 || clusters.length > 0 || schedule.length > 0) && (
        <div className="mt-2 min-w-0">
          <CollapsibleSection title="Schedule detail" summary={detailSummary || 'Markers and weights'}>
            {timeline.length > 0 && (
              <ul aria-label="Session markers" className="min-w-0 space-y-1">
                {timeline.map((line) => (
                  <li key={line} className="break-words text-xs leading-5 text-slate-300">{line}</li>
                ))}
              </ul>
            )}
            {clusters.length > 0 && (
              <ul aria-label="Close groups" className="mt-3 min-w-0 space-y-2">
                {clusters.map((cluster) => (
                  <li key={`${cluster.timeISO}-${cluster.label}`} className="min-w-0 break-words text-xs leading-5">
                    <div className="font-semibold text-emerald-200">{cluster.timeEtLabel} ET · {cluster.label}</div>
                    <p className="text-slate-300">{cluster.timeframes.join(', ')}</p>
                    <p className="text-slate-500">Weight {cluster.weight} · stack {cluster.clusterScore}</p>
                  </li>
                ))}
              </ul>
            )}
            {schedule.length > 0 && (
              <ul aria-label="Close weights" className="mt-3 min-w-0 space-y-1">
                {schedule.map((row) => (
                  <li key={`weight-${row.timeframe}`} className="break-words text-xs leading-5 text-slate-400">
                    {row.timeframe} · {CATEGORY_LABEL[row.category]} · {formatMinutes(row.minutesToClose)} · {formatClose(row.nextCloseISO)} · weight {row.weight}
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>
        </div>
      )}
    </section>
  );
}
