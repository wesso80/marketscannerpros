'use client';
import { useEffect, useState } from 'react';
import type { SymbolSummarySections } from '@/lib/research/symbolSummary';

type SummaryResponse = {
  success: boolean; error?: string; contract?: string; generatedAt?: string;
  dates?: Array<{ id: string; label: string; value: string | null; basis: string }>;
  sections?: SymbolSummarySections; independenceNote?: string;
  news?: { status: string; headline: string; provider: string; fetchedAt: string };
  narrative?: string | null; narrativeSource?: string; removedLines?: number;
};

function List({ title, items, attr }: { title: string; items: string[]; attr: string }) {
  if (!items.length) return null;
  return (
    <div data-summary-block={attr} className="min-w-0 rounded-xl border border-white/10 bg-slate-900/40 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{title}</h4>
      <ul className="mt-1 space-y-0.5">{items.map((i) => <li key={i} className="break-words">• {i}</li>)}</ul>
    </div>
  );
}

/**
 * The Symbol AI summary (W3 Option 2, replaces the embedded Deep Analysis page). Shows the evidence sections the
 * summary was written from, then the model's text, labelled as such. Fetches when mounted (inside a closed tab).
 */
export default function SymbolAiSummary({ symbol, type, timeframe, expiry }: { symbol: string; type: 'equity' | 'crypto'; timeframe: string; expiry?: string | null }) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    setData(null); setError(null);
    const qs = new URLSearchParams({ symbol, type, timeframe });
    if (expiry) qs.set('expiry', expiry);
    fetch(`/api/deep-analysis?${qs}`, { signal: abort.signal })
      .then(async (r) => { const j = (await r.json().catch(() => null)) as SummaryResponse | null; if (!r.ok || !j?.success) throw Error(j?.error || 'Summary request failed'); if (!abort.signal.aborted) setData(j); })
      .catch((e) => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Summary request failed'); });
    return () => abort.abort();
  }, [symbol, type, timeframe, expiry]);

  if (error) return <div className="space-y-5"><p role="alert" className="min-w-0 break-words rounded-xl border border-amber-300/20 bg-amber-300/5 p-5 text-sm text-amber-200">AI summary unavailable: {error}</p></div>;
  if (!data?.sections) return <div className="space-y-5"><p className="p-5 text-sm text-slate-400">Reading the evidence…</p></div>;
  const s = data.sections;
  return (
    <div data-symbol-ai-summary className="min-w-0 space-y-5 text-sm leading-6 text-slate-200">

      {s.summary.length > 0 && <div className="rounded-xl border-l-2 border-teal-300 bg-teal-300/5 px-5 py-4"><p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-teal-200">The evidence at a glance</p><p className="break-words text-base leading-7 text-slate-100">{s.summary.join(' ')}</p></div>}
      {s.evidence.length > 0 && (
        <div data-summary-block="evidence" className="min-w-0 rounded-2xl border border-white/10 bg-[var(--msp-panel)] p-5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Evidence by input</h4>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">{s.evidence.map((g, i) => <div key={g.input} className="min-w-0 rounded-xl bg-white/[0.03] p-4"><p className="mb-2 text-xs font-semibold text-teal-200"><span className="mr-2 text-slate-500">{String(i + 1).padStart(2, '0')}</span>{g.input}</p><ul className="space-y-2">{g.observations.map(o => <li key={o} className="break-words text-sm leading-6 text-slate-200">{o}</li>)}</ul></div>)}</div>
          {data.independenceNote && <p className="mt-1 text-xs text-slate-400">{data.independenceNote}</p>}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
      <List attr="events" title="News and events" items={s.events} />
      <List attr="differences" title="Where methods or dates differ" items={s.differences} />
      <List attr="missing" title="Missing or partial" items={s.missing} />
      <List attr="recheck" title="Check again when new data arrives" items={s.recheck} />
      </div>
      {data.narrative ? (
        <div data-summary-narrative className="rounded-2xl border border-indigo-300/20 bg-[linear-gradient(135deg,rgba(99,102,241,0.12),rgba(17,23,38,1))] p-5">
          <div className="mb-1 text-xs text-slate-400">AI summary. It can be wrong, so check it against the evidence above.</div>
          <p className="whitespace-pre-wrap break-words leading-5">{data.narrative}</p>
        </div>
      ) : <p className="text-xs text-slate-400">AI text unavailable; the evidence above is complete without it.</p>}
      {data.removedLines ? <p className="mt-1 text-xs text-slate-400">{data.removedLines} line{data.removedLines === 1 ? '' : 's'} removed for forecasting or recommending.</p> : null}
      <p className="text-xs text-slate-400">Generated {data.generatedAt?.slice(0, 16).replace('T', ' ')} UTC. Educational research, not a recommendation.</p>
    </div>
  );
}
