import type { ReactNode } from 'react';

export function researchNumber(value: unknown, digits = 0): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : 'Not measured';
}
export function researchPrice(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `$${value.toLocaleString('en-US', Math.abs(value) > 0 && Math.abs(value) < 1 ? { maximumSignificantDigits: 4 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Not measured';
}
export function researchLabel(value: unknown): string {
  if (typeof value !== 'string' || !value || /^(unknown|unavailable|n\/a|none)$/i.test(value)) return 'Not measured';
  const labels: Record<string,string> = { ATM: 'At the money', ITM: 'In the money', OTM: 'Out of the money', EOD: 'End of day', NO_SETUP: 'No pattern found', NO_TREND: 'No clear trend', FULL_OFFENSE: 'Higher risk tolerance', LOCKDOWN: 'Risk limit reached', DEFENSIVE: 'Reduced risk tolerance', PDL: 'Prior day low', PDH: 'Prior day high', EQL: 'Equal lows', EQH: 'Equal highs', ONH: 'Overnight high', ONL: 'Overnight low', REALTIME: 'Provider current', DELAYED: 'Delayed', STALE: 'Older observation', DEGRADED: 'Limited data', LONG_GAMMA: 'Positive gamma', SHORT_GAMMA: 'Negative gamma' };
  return labels[value.toUpperCase()] || value.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
}
export function researchTime(value: unknown): string {
  if (typeof value !== 'string' && !(value instanceof Date)) return 'Observation time not supplied';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Observation time not supplied' : `${d.toLocaleString('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} UTC`;
}
export function ResearchFold({ title, children }: {title:string; children:ReactNode}) {
  return <details className="rounded-lg border border-slate-700 bg-slate-950/30 p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-200">{title}</summary><div className="mt-3 space-y-3 text-sm text-slate-300">{children}</div></details>;
}
export function ResearchMetric({ label, value }: {label:string;value:ReactNode}) {
  return <div className="min-w-0 rounded-md bg-slate-950/40 p-3"><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 break-words text-base font-semibold text-slate-100">{value}</dd></div>;
}

export function researchReason(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Required evidence is incomplete.';
  return value.replace(/^\s*(BLOCKED:|NO-TRADE MODE:|Unavailable:)\s*/i, '')
    .replace(/Trade Permission Score/gi, 'Alignment score').replace(/Trade Permission/gi, 'Analysis status').replace(/playbooks?/gi, 'scenario').replace(/\bTPS\b/g, 'Alignment score')
    .replace(/\b[A-Z]+(?:_[A-Z]+)+\b/g, code => researchLabel(code))
    .replace(/\bUNKNOWN\b/g, 'not measured');
}
