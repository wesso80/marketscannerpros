'use client';

import type { TickerSentimentSummary as TickerSentimentSummaryItem } from '@/lib/equityNewsRelevance';

function tone(label: string): string {
  if (/bullish/i.test(label)) return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200';
  if (/bearish/i.test(label)) return 'border-rose-400/40 bg-rose-500/10 text-rose-200';
  return 'border-slate-600 bg-slate-800/60 text-slate-200';
}

/**
 * Per-ticker news sentiment (MV-2): Alpha Vantage's per-ticker score averaged over the ticker-relevant articles only
 * (shared rule in lib/equityNewsRelevance.ts). A ticker with no relevant articles or a failed feed reads
 * "Unavailable (reason)" instead of a neutral default.
 */
export default function TickerSentimentSummary({ items, className = '' }: { items: TickerSentimentSummaryItem[] | null | undefined; className?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-[11px] ${className}`} aria-label="Per-ticker news sentiment">
      <span className="text-slate-500" title="Alpha Vantage per-ticker sentiment, averaged over ticker-relevant articles only">News sentiment (relevant articles):</span>
      {items.map((item) => item.status === 'ok' ? (
        <span key={item.ticker} className={`rounded border px-2 py-0.5 font-semibold ${tone(item.label)}`}>
          {item.ticker} · {item.label} ({item.avgScore >= 0 ? '+' : ''}{item.avgScore.toFixed(2)}, {item.articles} article{item.articles === 1 ? '' : 's'})
        </span>
      ) : (
        <span key={item.ticker} className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-amber-200">
          {item.ticker} · Unavailable ({item.reason})
        </span>
      ))}
    </div>
  );
}
