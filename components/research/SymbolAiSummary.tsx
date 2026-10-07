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
    <div data-summary-block={attr} className="min-w-0">
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

  if (error) return <p role="alert" className="min-w-0 break-words text-sm text-amber-300">AI summary unavailable: {error}</p>;
  if (!data?.sections) return <p className="text-xs text-slate-500">Writing the summary from the evidence…</p>;
  const s = data.sections;
  return (
    <div data-symbol-ai-summary className="min-w-0 space-y-4 text-sm leading-6 text-slate-200">
      {s.summary.length > 0 && <p className="break-words text-sm leading-6 text-slate-100">{s.summary.join(' ')}</p>}
      {s.evidence.length > 0 && (
        <div data-summary-block="evidence" className="min-w-0">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Evidence by input</h4>
          {s.evidence.map((g) => <p key={g.input} className="mt-0.5 break-words"><span className="text-slate-400">{g.input}:</span> {g.observations.join('; ')}</p>)}
          {data.independenceNote && <p className="mt-1 text-xs text-slate-400">{data.independenceNote}</p>}
        </div>
      )}
      <List attr="events" title="News and events" items={s.events} />
      <List attr="differences" title="Where methods or dates differ" items={s.differences} />
      <List attr="missing" title="Missing or partial" items={s.missing} />
      <List attr="recheck" title="Check again when new data arrives" items={s.recheck} />
      {data.narrative ? (
        <div data-summary-narrative className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
          <div className="mb-1 text-xs text-slate-400">AI-written summary ({data.narrativeSource}); it can be wrong, so check it against the evidence above</div>
          <p className="whitespace-pre-wrap break-words leading-5">{data.narrative}</p>
        </div>
      ) : <p className="text-xs text-slate-400">AI text unavailable; the evidence above is complete without it.</p>}
      {data.removedLines ? <p className="mt-1 text-xs text-slate-400">{data.removedLines} line{data.removedLines === 1 ? '' : 's'} removed for forecasting or recommending.</p> : null}
      <p className="text-xs text-slate-400">Generated {data.generatedAt?.slice(0, 16).replace('T', ' ')} UTC. Educational research, not a recommendation.</p>
    </div>
  );
}
