'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PositionHistoryRepair from '@/components/admin/PositionHistoryRepair';
import DecisionJournal from '@/components/admin/DecisionJournal';
import DecisionRecordForm from '@/components/admin/DecisionRecordForm';
import type { DecisionAssessment, decisionAccount, DECISION_STRATEGIES } from '@/lib/admin/decisionDesk';
import type { readStoredMacroEvidence } from '@/lib/admin/macroOutlook';
import { formatHitPrice } from '@/lib/admin/hitIntegrity';

type DeskData = {
  schemaVersion: string; servedAt: string; strategies: typeof DECISION_STRATEGIES;
  account: ReturnType<typeof decisionAccount>; macro: Awaited<ReturnType<typeof readStoredMacroEvidence>>;
  counts: Record<string, number>; assessments: DecisionAssessment[]; limitations: string[]; savedScans: Record<string, { available: boolean; missingSymbols: number; message: string | null }>;
};
const desks = [
  ['Macro', '/admin/macro-pulse'], ['Research', '/admin/opportunity-board'], ['Risk', '/admin/risk'],
  ['Portfolio', '/admin/portfolio-lab/holdings'], ['Performance', '/admin/outcomes'], ['Audit', '/admin/research-scheduler'],
] as const;
const label = (value: string) => value.replaceAll('_', ' ');
export default function DecisionDeskPage() {
  const [data, setData] = useState<DeskData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [journalVersion, setJournalVersion] = useState(0);
  const [symbol, setSymbol] = useState('');
  const [status, setStatus] = useState('ALL');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    fetch('/api/admin/decision-desk', { credentials: 'include', signal: controller.signal, cache: 'no-store' })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Evidence unavailable'); return result; })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(err => { if (!controller.signal.aborted) { setData(null); setError(err instanceof Error ? err.message : 'Evidence unavailable'); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  const rows = (data?.assessments ?? []).filter(row => row.symbol.includes(symbol.trim().toUpperCase()) && (status === 'ALL' || row.status === status));
  return <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 text-white">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold">Decision Desk</h1><p className="text-sm text-slate-400">Research evidence, strategy checks and account risk. Final decisions remain yours.</p></div>
      <button className="rounded bg-emerald-700 px-4 py-2 disabled:opacity-50" disabled={loading} onClick={() => setRefresh(v => v + 1)}>{loading ? 'Reading saved evidence…' : 'Refresh saved evidence'}</button>
    </header>
    <PositionHistoryRepair onComplete={() => setRefresh(v => v + 1)} />
    <nav aria-label="Research desks" className="flex flex-wrap gap-4">{desks.map(([name, href]) => <Link key={name} href={href} className="text-emerald-300 underline">{name}</Link>)}</nav>
    <p className="text-xs text-slate-400">This page and your tools use the same <a className="text-cyan-300 underline" href="/api/admin/decision-desk">read-only JSON feed</a>. Refresh reads stored evidence; it does not run scans or AI. No automatic refresh.</p>
    {error && <p role="alert" className="rounded border border-red-400 p-3 text-red-200">{error}</p>}
    {data && <>
      <p className="text-xs text-slate-400">Response served {new Date(data.servedAt).toLocaleString()} · evidence dates are shown separately below · {data.schemaVersion}</p>
      {Object.entries(data.savedScans).map(([market, scan]) => (!scan.available || scan.missingSymbols > 0) && <p key={market} role="status" className="text-sm text-amber-200">{market}: {scan.available ? `${scan.missingSymbols} symbols have no saved packet` : 'saved scan unavailable'}. {scan.message}</p>)}
      <section aria-label="Strategy mandates" className="grid gap-3 md:grid-cols-4">{data.strategies.map(strategy => <div key={strategy.id} className="rounded border border-slate-700 p-3"><h2 className="font-semibold">{strategy.label}</h2><p className="text-sm text-slate-300">{strategy.holdingPeriod}</p><p className="text-xs text-amber-200">{label(strategy.status)}</p></div>)}</section>
      <section aria-label="Account assessment" className="rounded border border-amber-400/40 bg-amber-500/5 p-4">
        <h2 className="font-bold">Account assessment: {data.account.status}</h2>
        <p className="text-sm">{data.account.activePositions}/{data.account.maxPositions} positions · daily drawdown {data.account.dailyDrawdownPct === null ? 'unavailable' : `${data.account.dailyDrawdownPct.toFixed(2)}%`} · concentration/risk measure {data.account.concentrationRiskPct.toFixed(1)}%</p>
        <p className="text-xs text-slate-400">{data.account.source} · {data.account.asOf ? new Date(data.account.asOf).toLocaleString() : 'timestamp unavailable'}</p>
        {[...new Set([...data.account.reasons, ...data.account.notes])].map(note => <p key={note} className="mt-1 text-sm text-amber-100">{note}</p>)}
        <p className="mt-2 text-xs text-slate-300">{data.account.note}</p>
      </section>
      <details className="rounded border border-slate-700 p-4"><summary className="cursor-pointer font-semibold">Macro evidence · {data.macro.missing.length} missing or stale · independent verdict requires review</summary>
        <p className="my-2 text-sm text-slate-400">{data.macro.note}</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Series</th><th>Value</th><th>Units</th><th>Observed</th><th>Status</th></tr></thead><tbody>{data.macro.observations.map(({ key, observation: o }) => <tr key={key} className="border-t border-slate-800"><td className="py-2">{key}<span className="block text-xs text-slate-400">{o?.description}</span></td><td>{o?.latest ?? 'Unavailable'}</td><td>{o?.units ?? '—'}</td><td>{o?.latestDate ?? '—'}</td><td>{o?.status ?? 'missing'}</td></tr>)}</tbody></table></div>
      </details>
      <section aria-label="Position research decisions" className="space-y-3">
        <h2 className="text-lg font-bold">Position research · weekly structure / daily entry · 6+ weeks</h2>
        <p className="text-sm text-slate-400">One assessment per market, symbol and strategy. Position direction uses completed weekly trend with separate monthly context. Ranking remains a discovery score; neither establishes a six-week edge. REVIEW REQUIRED means further desk checks, not permission to trade.</p>
        <div className="flex flex-wrap gap-4 text-sm">{Object.entries(data.counts).map(([key, count]) => <span key={key}>{label(key)}: <strong>{count}</strong></span>)}</div>
        <div className="flex flex-wrap gap-4"><label>Symbol <input className="ml-2 rounded border border-slate-600 bg-slate-900 p-2" value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="Filter symbols" /></label><label>Status <select className="ml-2 rounded border border-slate-600 bg-slate-900 p-2" value={status} onChange={e => setStatus(e.target.value)}>{['ALL', 'REVIEW_REQUIRED', 'WATCH', 'INVALIDATED', 'DATA_UNAVAILABLE'].map(s => <option key={s} value={s}>{label(s)}</option>)}</select></label></div>
        <p className="text-xs text-slate-400">Showing {rows.length} of {data.counts.total} assessments</p>
        {rows.slice(0, 50).map(row => <Assessment key={row.key} row={row} onSaved={() => setJournalVersion(v => v + 1)} />)}
        {rows.length > 50 && <p className="text-sm text-slate-400">First 50 shown. Filter by symbol/status; the JSON feed includes all {rows.length} matching assessments.</p>}
        {!rows.length && <p>No matching saved assessments.</p>}
      </section>
      <DecisionJournal version={journalVersion} />
      <section className="rounded border border-slate-700 p-4"><h2 className="font-semibold">Implementation limits</h2>{data.limitations.map(text => <p key={text} className="mt-1 text-sm text-slate-400">{text}</p>)}</section>
    </>}
  </div>;
}
function Assessment({ row, onSaved }: { row: DecisionAssessment; onSaved: () => void }) {
  const t = row.technical;
  return <details className="rounded border border-slate-700 bg-slate-900/40 p-4">
    <summary className="cursor-pointer"><strong className="text-emerald-300">{row.symbol}</strong> · {row.market} · {row.research.bias} · <strong>{label(row.status)}</strong><span className="ml-3 text-xs text-slate-400">Discovery score {row.research.score?.toFixed(1) ?? '—'} ({row.evidence.scanTimeframe})</span></summary>
    <p className="mt-2 text-xs text-slate-400">Scan: {row.evidence.scannedAt ?? 'unavailable'} · daily bars: {row.evidence.dailyAsOf ?? 'unavailable'} · {row.evidence.dataStatus}{row.evidence.marketClosedAsOf ? ` · ${row.evidence.marketClosedAsOf}` : ''}</p>
    <p className="my-2 text-sm">Discovery ({row.evidence.scanTimeframe}, {row.research.discoveryBias}): {row.research.reason}</p>
    <p className="text-sm text-sky-200">Weekly trend: {row.trend?.bias ?? 'unavailable'} · monthly context: {row.trend?.monthlyBias ?? 'unavailable'} · {row.trend?.alignment ?? 'UNAVAILABLE'}</p>
    <p className="text-xs text-slate-400">Completed week starting {row.trend?.weeklyAsOf ?? 'unavailable'} · completed month {row.trend?.monthlyAsOf ?? 'unavailable'} · {row.trend?.version ?? 'trend evidence pending'}</p>
    {t.status === 'ok' ? <div className="text-sm"><p>Daily trigger {formatHitPrice(t.entryTrigger)} · zone {formatHitPrice(t.entryZoneLow)}–{formatHitPrice(t.entryZoneHigh)} · weekly stop {formatHitPrice(t.stop)}</p><p>TP1 {formatHitPrice(t.tp1)} · {t.tp1R?.toFixed(2) ?? '—'}R · {t.targets[0]?.source ?? 'source unavailable'}</p><p>{t.entryNote}</p></div> : <p className="text-amber-200">{t.message}</p>}
    <ul className="my-2 list-disc space-y-1 pl-5 text-sm text-amber-200">{row.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    {row.research.contradictions.length > 0 && <p className="text-sm text-amber-200">Contradictions: {row.research.contradictions.join(' · ')}</p>}
    <p className="text-xs text-slate-400">42-/84-day reviews are tied to saved research decisions below. This assessment creates no order or position.</p>
    <DecisionRecordForm row={row} onSaved={onSaved} />
    <Link href={`/admin/symbol/${encodeURIComponent(row.symbol)}`} className="mt-2 inline-block text-sm text-cyan-300 underline">Open symbol research</Link>
  </details>;
}
