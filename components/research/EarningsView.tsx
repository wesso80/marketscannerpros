'use client';

import { useState } from 'react';
import type { EarningsEntry } from '@/app/v2/_lib/api';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import { researchDate } from '@/components/terminal/researchPresentation';

type SaveState = 'adding' | 'added' | 'exists' | 'signin' | 'error';
export interface EarningsViewProps {
  thisWeek: EarningsEntry[];
  nextWeek: EarningsEntry[];
  majorEarnings: EarningsEntry[];
  loading: boolean;
  error: string | null;
  watchlistStatus: Record<string, SaveState>;
  onOpenSymbol: (symbol: string) => void;
  onAddToWatchlist: (symbol: string) => void;
}
const control = 'min-h-10 rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-60';
export function earningsEstimate(entry: EarningsEntry): string {
  if (entry.estimate == null || !Number.isFinite(entry.estimate)) return 'Not supplied';
  const amount = entry.estimate.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  return `${amount}${entry.currency ? ` ${entry.currency}` : ' · currency not supplied'}`;
}

/** Display only: API groups, their order and watchlist callbacks remain unchanged. */
export default function EarningsView(props: EarningsViewProps) {
  const [group, setGroup] = useState<'thisWeek' | 'nextWeek' | 'majorEarnings'>('thisWeek');
  const [expanded, setExpanded] = useState(false);
  const items = props[group];
  const labels = {thisWeek: 'This week', nextWeek: 'Next week', majorEarnings: 'Major earnings'};
  const visible = expanded ? items : items.slice(0, 5);
  return <section aria-label="Earnings calendar" className="min-w-0 space-y-3">
    <p data-research-verdict role="status" className="text-lg font-semibold">{props.loading ? 'Loading scheduled earnings…' : props.error ? 'Earnings could not be loaded.' : items.length ? `${items.length} scheduled reports · ${labels[group].toLowerCase()}` : `No scheduled reports collected · ${labels[group].toLowerCase()}`}</p>
    <div role="group" aria-label="Earnings lists" className="flex flex-wrap gap-2">
      {(Object.keys(labels) as Array<keyof typeof labels>).map(key => <button type="button" key={key} className={control} aria-pressed={group === key} onClick={() => {setGroup(key); setExpanded(false);}}>{labels[key]}</button>)}
    </div>
    {!props.loading && !props.error && <>
      <ul aria-label="Scheduled earnings" className="space-y-2">{visible.map((entry, index) => {
        const state = props.watchlistStatus[entry.symbol];
        const done = state === 'added' || state === 'exists';
        const label = state === 'adding' ? 'Adding…' : state === 'added' ? 'Added' : state === 'exists' ? 'On list' : state === 'signin' ? 'Sign in' : state === 'error' ? 'Retry' : '+ Watchlist';
        return <li key={`${entry.symbol}/${entry.reportDate}/${index}`} data-earnings-row className="min-w-0 rounded-lg border border-slate-700 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="min-h-10 break-all text-left text-sm font-semibold" aria-label={`Open ${entry.symbol} earnings in Symbol`} onClick={() => props.onOpenSymbol(entry.symbol)}>{entry.symbol}</button>
            <span className="text-xs text-slate-400">{entry.reportDate ? researchDate(entry.reportDate) : 'Date not supplied'}</span>
          </div>
          <CollapsibleSection title="Report details" summary="Company and estimate">
            <p className="break-words text-sm">{entry.name || 'Company not supplied'}</p>
            <p className="my-2 text-sm text-slate-400">EPS estimate: {earningsEstimate(entry)}</p>
            <button type="button" className={control} aria-label={`Add ${entry.symbol} to watchlist`} disabled={state === 'adding' || done} onClick={() => props.onAddToWatchlist(entry.symbol)}>{label}</button>
          </CollapsibleSection>
        </li>;
      })}</ul>
      {items.length > 5 && <button type="button" className={control} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show five' : `Show all ${items.length}`}</button>}
      <SourceLine source="Earnings calendar" basis="Scheduled report dates · estimates may change · provider observation time not supplied" />
    </>}
    {props.error && <p className="text-sm text-amber-200">No current schedule is shown. Reload this page to try again.</p>}
  </section>;
}
