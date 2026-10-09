import type { ReactNode } from 'react';
import type { CommandItem } from './CommandStrip';
import StatCard from '@/components/visual/StatCard';

/** Display labels only. Never feed these strings back into calculation or eligibility. */
export function evidenceLabel(value: string | number | null | undefined): string {
  if (value == null || value === '') return 'Not collected';
  if (typeof value === 'number') return Number.isFinite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value) : 'Not collected';
  const contexts: Record<string, string> = {
    'FAVOR LEADERS': 'Leadership strength', 'FAVOR PULLBACKS': 'Pullback conditions',
    'TIGHTEN RISK': 'Elevated risk', 'WAIT FOR CONFIRMATION': 'Confirmation incomplete',
    'REDUCE BETA': 'Defensive conditions', 'CAPITAL PRESERVATION': 'Capital stress conditions',
  };
  if (contexts[value]) return contexts[value];
  return value.replace(/DATA_PARITY_PENDING|DATA PARITY PENDING/gi, 'source checks not finished')
    .replace(/FULL_PARITY|FULL PARITY/gi, 'source checks complete')
    .replace(/FORMULA_VALIDATED/gi, 'calculation checks complete')
    .replace(/DATA_UNAVAILABLE|\b(?:unavailable|unknown|undefined|NaN|N\/A)\b|^—$/gi, 'Not collected')
    .replace(/\bPARITY\b/gi, 'Source checks')
    .replace(/\balpha[_-]vantage\b/gi, 'Alpha Vantage')
    .replace(/\bdegraded\b/gi, 'limited data')
    .replace(/\bmissing\b/gi, 'not collected')
    .replace(/\bplaybook\b/gi, 'research context')
    .replace(/\bbullish\b/gi, 'positive').replace(/\bbearish\b/gi, 'negative')
    .replace(/\bLONG\b/g, 'upside').replace(/\bSHORT\b/g, 'downside')
    .replace(/[A-Z]+_[A-Z_]+/g, code => code.toLowerCase().replaceAll('_', ' '))
    .replace(/\bNOT ALIGNED\b/gi, 'Inputs differ')
    .replace(/\bALIGNED\b/gi, 'Inputs agree')
    .replace(/\bUNFAVORABLE\b/gi, 'Caution')
    .replace(/\bFAVORABLE\b/gi, 'Same direction')
    .replace(/\b(?:MIXED|RESTRICTIVE|COMPRESSION|PARTIAL|LIVE|STALE|ACTIVE|INACTIVE|PASS|FAIL|WATCH|CLEAR|HIGH|MODERATE|LOW|EXACT|PROXY|ALTERNATIVE|DERIVED|OK|HEALTHY|RISK|ON|OFF|STABLE|ROTATION|NEUTRAL|TRANSITION|DEFENSIVE|STRONG|CAUTIOUS|WARNING|CONFIRMED|CONFIRM|OPPOSING|SUPPORTIVE|DECELERATION|ACCELERATION|EXPANSION|CONTRACTION|LATE|CYCLE|DIVERGENCE|CONTANGO|TAILWIND|LEADING|BUILDING|WEAK|UPSTREAM|BULL|BEAR)\b/g, word => word.toLowerCase());
}

export function EvidenceMetrics({ items }: { items: CommandItem[] }) {
  return <div className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-4 my-3">{items.map(item =>
    <StatCard key={item.label} label={evidenceLabel(item.label)} value={typeof item.value === 'string' || typeof item.value === 'number' ? evidenceLabel(item.value) : 'Not collected'} />
  )}</div>;
}

export function EvidenceVerdict({ children }: { children: ReactNode }) {
  return <p data-layout-verdict className="my-3 text-base font-semibold break-words">{children}</p>;
}
export function EvidenceWarning({ children }: { children: ReactNode }) {
  return <p className="my-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-2 text-xs text-amber-300 break-words">{children}</p>;
}

/** Bar lengths encode only the supplied values; every formatted value stays visible. */
export function EvidenceBars({ title, rows, maximum, money = false }: {
  title: string; rows: { label: string; value: number }[]; maximum?: number; money?: boolean;
}) {
  const valid = rows.filter(row => Number.isFinite(row.value));
  const max = maximum ?? Math.max(1, ...valid.map(row => Math.abs(row.value)));
  return <figure data-evidence-chart className="my-3 min-w-0 rounded-lg border border-[var(--msp-border)] p-3">
    <figcaption className="mb-2 text-sm font-semibold">{title}</figcaption>
    {valid.length ? <div className="space-y-1.5">{valid.map((row, i) => <div key={`${row.label}-${i}`} className="grid grid-cols-[minmax(0,1fr)_minmax(40px,1fr)_auto] items-center gap-2 text-xs">
      <span className="break-words">{evidenceLabel(row.label)}</span>
      <span className="h-2 rounded bg-white/5" aria-hidden="true"><span className="block h-2 rounded bg-[var(--msp-text-muted)]" style={{ width: `${Math.min(100, Math.abs(row.value) / max * 100)}%` }} /></span>
      <span className="tabular-nums">{money ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(row.value) : evidenceLabel(row.value)}</span>
    </div>)}</div> : <p className="text-sm text-amber-300">No observations collected for this chart.</p>}
  </figure>;
}
