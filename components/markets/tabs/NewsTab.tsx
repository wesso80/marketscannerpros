'use client';

import type { TickerContext } from '../types';

/**
 * News & Events Tab — News headlines with sentiment, earnings calendar, economic calendar.
 * Absorbs: News page, Economic Calendar page, Earnings Calendar page.
 */
export default function NewsTab({ ctx }: { ctx: TickerContext }) {
  const { symbol, news, earnings, economic, loading } = ctx;

  if (loading) {
    return <div className="h-[300px] animate-pulse rounded-md bg-[var(--msp-panel-2)]" />;
  }

  return (
    <div className="grid gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">News & Events</p>
        <h3 className="text-xs font-bold text-[var(--msp-text)]">{symbol} — Headlines, Earnings & Economic Events</h3>
      </div>

      {/* News headlines */}
      <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">
          Recent Headlines ({news.length})
        </p>
        {news.length > 0 ? (
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {news.map((item, i) => {
              const sentColor = item.sentiment.score > 0.1
                ? 'text-emerald-400 bg-emerald-500/10'
                : item.sentiment.score < -0.1
                  ? 'text-rose-400 bg-rose-500/10'
                  : 'text-slate-400 bg-slate-500/10';
              return (
                <a
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel)] p-1.5 transition-colors hover:border-[var(--msp-border-strong)]"
                >
                  <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${sentColor}`}>
                    {item.sentiment.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-[var(--msp-text)] truncate">{item.title}</p>
                    <p className="text-[10px] text-[var(--msp-text-faint)]">
                      {item.source} · {item.publishedAt && !isNaN(new Date(item.publishedAt).getTime()) ? new Date(item.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                    </p>
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-[var(--msp-text-faint)] text-center py-4">No recent headlines for {symbol}</p>
        )}
      </div>

      {/* Earnings calendar */}
      <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">Earnings Events</p>
        {earnings.length > 0 ? (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[10px] uppercase text-[var(--msp-text-faint)]">
                <th className="pb-1 pr-2">Symbol</th>
                <th className="pb-1 pr-2">Date</th>
                <th className="pb-1 pr-2">Est.</th>
                <th className="pb-1 pr-2">Actual</th>
                <th className="pb-1">Surprise</th>
              </tr>
            </thead>
            <tbody>
              {earnings.slice(0, 10).map((e, i) => (
                <tr key={i} className="border-t border-[var(--msp-divider)]">
                  <td className="py-1 pr-2 font-semibold text-[var(--msp-text)]">{e.symbol}</td>
                  <td className="py-1 pr-2 text-[var(--msp-text-muted)]">{new Date(e.reportDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  <td className="py-1 pr-2 text-[var(--msp-text-muted)]">{e.estimate !== undefined ? `$${e.estimate.toFixed(2)}` : '—'}</td>
                  <td className="py-1 pr-2 text-[var(--msp-text)]">{e.actual !== undefined ? `$${e.actual.toFixed(2)}` : '—'}</td>
                  <td className={`py-1 font-semibold ${(e.surprise ?? 0) > 0 ? 'text-emerald-400' : (e.surprise ?? 0) < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                    {e.surprise !== undefined ? `${e.surprise > 0 ? '+' : ''}${e.surprise.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[11px] text-[var(--msp-text-faint)] text-center py-3">No upcoming earnings</p>
        )}
      </div>

      {/* Economic calendar */}
      <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">Upcoming High-Impact Economic Events</p>
        {economic.length > 0 ? (
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {economic.map((ev, i) => {
              const impactColor = ev.impact === 'high' ? 'text-red-400 bg-red-500/10' : ev.impact === 'medium' ? 'text-amber-400 bg-amber-500/10' : 'text-slate-400 bg-slate-500/10';
              return (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${impactColor}`}>
                    {(ev.impact ?? 'low').toUpperCase()}
                  </span>
                  <span className="text-[var(--msp-text-muted)]">
                    {new Date(ev.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="flex-1 text-[var(--msp-text)]">{ev.event}</span>
                  {ev.forecast && <span className="text-[10px] text-[var(--msp-text-faint)]">F: {ev.forecast}</span>}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-[var(--msp-text-faint)] text-center py-3">No high-impact events in next 14 days</p>
        )}
      </div>
    </div>
  );
}
