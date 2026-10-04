import { friendlyStatus } from '@/lib/free/friendlyStatus';
import { FREE_COPY } from '@/components/free/copy';
import type { MarketDataProviderStatus } from '@/lib/scanner/providerStatus';
import DataFreshnessBadge, { providerStatusColor } from './DataFreshnessBadge';

export type MarketStatusItem = {
  label: string;
  statusLabel?: string;
  status?: MarketDataProviderStatus | null;
  source?: string | null;
  coverageScore?: number | null;
  computedAt?: string | Date | null;
  warnings?: string[];
  /** Disclosures (sample size, last bar) shown in neutral text; never a reason for DEGRADED. */
  notes?: string[];
};

function formatTime(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type MarketStatusStripProps = {
  items: MarketStatusItem[];
  friendly?: boolean;
  className?: string;
};

export default function MarketStatusStrip({ items, className = '', friendly = false }: MarketStatusStripProps) {
  if (friendly) return <div className={className}>{items.map(item => <details key={item.label} className="rounded-xl border border-white/10 p-3">
    <summary>{item.label} · {friendlyStatus(item.statusLabel || (item.status?.stale || item.status?.degraded ? 'stale' : item.computedAt ? 'Available' : null))}</summary>
    <p>{FREE_COPY.details}: {item.source || item.status?.provider || FREE_COPY.unavailable}</p>
    {(item.warnings ?? []).map((warning, index) => <p key={index}>{friendlyStatus(warning)}</p>)}
  </details>)}</div>;
  return (
    <div className={`grid gap-2 md:grid-cols-2 ${className}`}>
      {items.map((item) => {
        const color = providerStatusColor(item.status);
        const flagged = Boolean(item.status && (item.status.degraded || item.status.stale || item.status.simulated));
        // When the badge is DEGRADED/STALE its reason (the status warnings) comes first, and there is always one.
        const warnings = [...new Set([...(flagged ? item.status?.warnings ?? [] : []), ...(item.warnings ?? []), ...(flagged ? [] : item.status?.warnings ?? [])].filter(Boolean))];
        if (flagged && warnings.length === 0) warnings.push('Reason not reported by the data feed');
        const notes = [...new Set([...(item.notes ?? []), ...(item.status?.notes ?? [])].filter(Boolean))].filter((n) => !warnings.includes(n));
        const updatedAt = formatTime(item.computedAt);

        return (
          <div key={item.label} className="rounded-lg border bg-[var(--msp-panel-2)] px-3 py-2" style={{ borderColor: `${color}55` }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500">{item.label} Data Truth</div>
              <DataFreshnessBadge status={item.status} label={item.statusLabel} />
            </div>
            <div className="mt-1 text-[0.72rem] text-slate-400">
              Source: <span className="font-bold text-slate-200">{item.status?.provider ?? item.source ?? 'unknown'}</span>
              {item.coverageScore != null && <span> · Coverage: <span className="font-bold text-slate-200">{item.coverageScore}%</span></span>}
              {updatedAt && <span> · Updated: <span className="font-bold text-slate-200">{updatedAt}</span></span>}
            </div>
            {warnings.length > 0 && (
              <div className="mt-1 truncate text-[0.68rem] text-amber-200" title={warnings.join(' | ')}>
                {flagged ? 'Why: ' : ''}{warnings[0]}{warnings.length > 1 ? ` (+${warnings.length - 1} more)` : ''}
              </div>
            )}
            {notes.length > 0 && (
              <div className="mt-0.5 truncate text-[0.68rem] text-slate-500" title={notes.join(' | ')}>{notes.join(' · ')}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
