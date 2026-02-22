'use client';

import dynamic from 'next/dynamic';
import type { TickerContext } from '../types';
import { SentimentBadge } from '@/components/NewsSentiment';

const TradingViewChart = dynamic(
  () => import('@/components/scanner/TradingViewChart').then(m => ({ default: m.TradingViewChart })),
  { ssr: false, loading: () => <div className="h-[300px] animate-pulse rounded-md bg-[var(--msp-panel-2)]" /> }
);

/**
 * Overview Tab — Chart + quote card + key levels + quick sentiment.
 * Absorbs the top half of what was the Equity/Crypto Explorer.
 */
export default function OverviewTab({ ctx }: { ctx: TickerContext }) {
  const { symbol, quote, scanner, loading } = ctx;

  if (loading) {
    return <div className="h-[400px] animate-pulse rounded-md bg-[var(--msp-panel-2)]" />;
  }

  const chgColor = (quote?.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400';
  const chgSign = (quote?.changePercent ?? 0) >= 0 ? '+' : '';

  return (
    <div className="grid gap-3">
      {/* Quote header */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-[var(--msp-text)]">{symbol}</h2>
          {quote ? (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-[var(--msp-text)]">${quote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className={`text-sm font-bold ${chgColor}`}>
                {chgSign}{(quote.changePercent ?? 0).toFixed(2)}%
              </span>
              <span className={`text-xs ${chgColor}`}>
                ({chgSign}${(quote.change ?? 0).toFixed(2)})
              </span>
            </div>
          ) : (
            <span className="text-sm text-[var(--msp-text-faint)]">No quote data</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SentimentBadge ticker={symbol} />
          {quote?.source && (
            <span className="text-[10px] text-[var(--msp-text-faint)]">via {quote.source}</span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
        <TradingViewChart
          symbol={symbol}
          interval="daily"
          price={quote?.price}
          chartData={scanner?.indicators?.chartData}
        />
      </div>

      {/* Key stats row */}
      {quote && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <StatCard label="Open" value={`$${quote.open?.toFixed(2) ?? '—'}`} />
          <StatCard label="High" value={`$${quote.high?.toFixed(2) ?? '—'}`} />
          <StatCard label="Low" value={`$${quote.low?.toFixed(2) ?? '—'}`} />
          <StatCard label="Prev Close" value={`$${quote.previousClose?.toFixed(2) ?? '—'}`} />
        </div>
      )}

      {/* Scanner setup summary */}
      {scanner && (
        <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--msp-text-faint)]">Scan Result</p>
          <div className="grid grid-cols-2 gap-2 text-[11px] md:grid-cols-5">
            <div><span className="text-[var(--msp-text-faint)]">Setup:</span> <span className="text-[var(--msp-text)] font-medium">{scanner.setup}</span></div>
            <div><span className="text-[var(--msp-text-faint)]">Direction:</span> <span className={scanner.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}>{scanner.direction}</span></div>
            <div><span className="text-[var(--msp-text-faint)]">Score:</span> <span className="text-[var(--msp-text)]">{scanner.score}/100</span></div>
            <div><span className="text-[var(--msp-text-faint)]">Entry:</span> <span className="text-[var(--msp-text)]">${(scanner.entry ?? 0).toFixed(2)}</span></div>
            <div><span className="text-[var(--msp-text-faint)]">R-Multiple:</span> <span className={(scanner.rMultiple ?? 0) >= 2 ? 'text-emerald-400' : 'text-amber-400'}>{(scanner.rMultiple ?? 0).toFixed(1)}R</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel)] p-2 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">{label}</p>
      <p className="text-xs font-bold text-[var(--msp-text)]">{value}</p>
    </div>
  );
}
