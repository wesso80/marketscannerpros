'use client';
import { useEffect, useState } from 'react';
import type { SymbolNews } from '@/lib/research/newsEvidence';

const CATALYST: Record<string, { label: string; cls: string }> = {
  POSITIVE: { label: 'Positive', cls: 'border-emerald-400/40 text-emerald-300' },
  NEGATIVE: { label: 'Negative', cls: 'border-red-400/40 text-red-300' },
  MIXED: { label: 'Mixed', cls: 'border-amber-400/40 text-amber-300' },
  EVENT_RISK: { label: 'Event risk', cls: 'border-amber-400/40 text-amber-300' },
  NEUTRAL: { label: 'Neutral', cls: 'border-slate-500/40 text-slate-400' },
};
const when = (v: string | null) => (v ? `${v.slice(0, 10)} ${v.slice(11, 16)} UTC` : 'time not recorded');

/** Symbol news grouped by event (one row per event, however many articles report it). Fetches when mounted. */
export default function SymbolNewsPanel({ symbol, type }: { symbol: string; type: 'equity' | 'crypto' }) {
  const [news, setNews] = useState<SymbolNews | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    setNews(null); setError(null);
    fetch(`/api/research/news?symbol=${encodeURIComponent(symbol)}&type=${type}`, { signal: abort.signal })
      .then(async (r) => { const j = await r.json().catch(() => null); if (!r.ok || !j?.success) throw Error(j?.error || 'News request failed'); if (!abort.signal.aborted) setNews(j.news); })
      .catch((e) => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'News request failed'); });
    return () => abort.abort();
  }, [symbol, type]);

  if (error) return <p role="alert" className="text-xs text-amber-300">News unavailable: {error}. No news is shown rather than a guess.</p>;
  if (!news) return <p className="text-xs text-slate-500">Loading symbol news…</p>;
  return (
    <div data-symbol-news className="min-w-0 space-y-2 text-xs">
      <p className={news.status === 'available' ? 'text-slate-200' : 'text-amber-300'}>{news.headline}</p>
      {news.events.length > 0 && (
        <ul className="space-y-1.5">
          {news.events.map((e) => {
            const lead = news.articles.find((a) => a.eventId === e.id && a.title === e.headline) ?? news.articles.find((a) => a.eventId === e.id);
            const c = CATALYST[e.catalyst] ?? CATALYST.NEUTRAL;
            return (
              <li key={e.id} data-news-event={e.id} className="min-w-0 rounded-md bg-[var(--msp-panel-2)] px-2 py-1.5">
                <div className="flex min-w-0 flex-wrap items-start gap-1.5">
                  <span className={`shrink-0 rounded border px-1.5 text-[10px] ${c.cls}`}>{c.label}</span>
                  {lead?.url ? <a href={lead.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words text-slate-100 hover:underline">{e.headline}</a> : <span className="min-w-0 break-words text-slate-100">{e.headline}</span>}
                </div>
                <div className="mt-0.5 break-words text-[10px] text-slate-500">
                  {e.articles} article{e.articles === 1 ? '' : 's'} on this event ({e.sources.join(', ') || 'source not recorded'}) · first {when(e.firstPublishedAt)}{e.lastPublishedAt && e.lastPublishedAt !== e.firstPublishedAt ? ` · latest ${when(e.lastPublishedAt)}` : ''} · {e.catalystReason}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="break-words text-[10px] text-slate-500">Source: {news.provider}, fetched {when(news.fetchedAt)}; {news.considered} articles considered. {news.rule} Catalyst labels describe the article, not a forecast.</p>
    </div>
  );
}
