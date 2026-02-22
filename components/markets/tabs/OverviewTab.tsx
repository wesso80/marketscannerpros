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
  const { symbol, assetClass, quote, scanner, loading } = ctx;
  const isCrypto = assetClass === 'crypto';

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
          <StatCard label={isCrypto ? '24h High' : 'Open'} value={isCrypto ? fmtPrice(quote.high) : fmtPrice(quote.open)} />
          <StatCard label={isCrypto ? '24h Low' : 'High'} value={isCrypto ? fmtPrice(quote.low) : fmtPrice(quote.high)} />
          <StatCard label={isCrypto ? '24h Volume' : 'Low'} value={isCrypto ? fmtLarge(quote.volume) : fmtPrice(quote.low)} />
          <StatCard label={isCrypto ? 'Market Cap' : 'Prev Close'} value={isCrypto ? fmtLarge(quote.marketCap) : fmtPrice(quote.previousClose)} />
        </div>
      )}

      {/* Crypto extra stats row */}
      {isCrypto && quote && (quote.marketCapRank || quote.circulatingSupply) && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {quote.marketCapRank && <StatCard label="MCap Rank" value={`#${quote.marketCapRank}`} />}
          {quote.circulatingSupply && <StatCard label="Circ. Supply" value={fmtSupply(quote.circulatingSupply)} />}
          {quote.totalSupply && <StatCard label="Total Supply" value={fmtSupply(quote.totalSupply)} />}
          {quote.open != null && <StatCard label="Open (est.)" value={fmtPrice(quote.open)} />}
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

/** Format a price value with appropriate decimal places */
function fmtPrice(v: number | undefined | null): string {
  if (v == null || !Number.isFinite(v)) return '$—';
  if (v >= 1000) return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(6)}`;
}

/** Format large numbers (volume, market cap) */
function fmtLarge(v: number | undefined | null): string {
  if (v == null || !Number.isFinite(v)) return '$—';
  if (v >= 1_000_000_000_000) return `$${(v / 1_000_000_000_000).toFixed(2)}T`;
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

/** Format supply numbers (no $ sign) */
function fmtSupply(v: number | undefined | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}
