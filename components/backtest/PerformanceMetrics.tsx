'use client';

interface Trade {
  entryDate: string;
  exitDate: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  return: number;
  returnPercent: number;
  holdingPeriodDays: number;
}

interface PerformanceMetricsProps {
  totalReturn: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgWin: number;
  avgLoss: number;
  cagr: number;
  volatility: number;
  sortinoRatio: number;
  calmarRatio: number;
  timeInMarket: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
}

function safe(v: number) {
  return Number.isFinite(v) ? v : null;
}

function MetricCard({ label, children, emphasized, borderColor }: {
  label: string;
  children: React.ReactNode;
  emphasized?: boolean;
  borderColor?: string;
}) {
  return (
    <div className={`rounded-xl p-4 ${emphasized
      ? 'border border-[var(--msp-border-strong)]'
      : 'border border-slate-700/40 bg-slate-800/50'}`}
      style={emphasized ? {
        borderLeftWidth: '3px',
        borderLeftColor: borderColor,
        background: borderColor?.includes('129') ? 'rgba(16,185,129,0.15)'
          : borderColor?.includes('191') ? 'rgba(251,191,36,0.1)'
          : 'rgba(239,68,68,0.15)',
      } : undefined}
    >
      <div className={`mb-1.5 text-[11px] font-${emphasized ? 'semibold' : 'medium'} uppercase tracking-wider ${emphasized ? 'text-slate-200' : 'text-slate-400'}`}>
        {label}
      </div>
      {children}
    </div>
  );
}

export default function PerformanceMetrics({ totalReturn, winRate, totalTrades, profitFactor, sharpeRatio, maxDrawdown, avgWin, avgLoss, cagr, volatility, sortinoRatio, calmarRatio, timeInMarket, bestTrade, worstTrade }: PerformanceMetricsProps) {
  const pfColor = profitFactor >= 1.5 ? '#10b981' : profitFactor >= 1 ? '#fbbf24' : '#ef4444';
  const pfBorder = profitFactor >= 1.5 ? 'rgba(16,185,129,0.65)' : profitFactor >= 1 ? 'rgba(251,191,36,0.55)' : 'rgba(239,68,68,0.65)';
  const ddColor = maxDrawdown <= 10 ? '#10b981' : maxDrawdown <= 20 ? '#fbbf24' : '#ef4444';
  const ddBorder = maxDrawdown <= 10 ? 'rgba(16,185,129,0.55)' : maxDrawdown <= 20 ? 'rgba(251,191,36,0.55)' : 'rgba(239,68,68,0.65)';

  return (
    <div className="mb-6 rounded-2xl border border-slate-700/80 bg-[var(--msp-card)] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
      <h2 className="mb-6 flex items-center gap-2.5 text-[15px] font-semibold uppercase tracking-wider text-slate-100">
        <span className="rounded-lg bg-[var(--msp-muted)] px-2 py-1.5 text-sm">📊</span>
        Performance Metrics
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <MetricCard label="Total Return">
          <div className={`text-xl font-bold sm:text-[22px] ${totalReturn >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {totalReturn >= 0 ? '+' : ''}{safe(totalReturn)?.toFixed(2) ?? '—'}%
          </div>
        </MetricCard>

        <MetricCard label="Win Rate">
          <div className="text-xl font-semibold text-slate-400 sm:text-[20px]">
            {safe(winRate)?.toFixed(1) ?? '—'}%
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">(context matters more than %)</div>
        </MetricCard>

        <MetricCard label="Total Trades">
          <div className="text-xl font-bold text-slate-100 sm:text-[22px]">{totalTrades}</div>
        </MetricCard>

        <MetricCard label="⚡ Profit Factor" emphasized borderColor={pfBorder}>
          <div className="text-2xl font-extrabold" style={{ color: pfColor }}>
            {safe(profitFactor)?.toFixed(2) ?? '—'}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            {profitFactor >= 1.5 ? 'Strong edge' : profitFactor >= 1 ? 'Break-even' : 'Losing money'}
          </div>
        </MetricCard>

        <MetricCard label="Sharpe Ratio">
          <div className="text-xl font-bold text-slate-100 sm:text-[22px]">
            {safe(sharpeRatio)?.toFixed(2) ?? '—'}
          </div>
        </MetricCard>

        <MetricCard label="📉 Max Drawdown" emphasized borderColor={ddBorder}>
          <div className="text-2xl font-extrabold" style={{ color: ddColor }}>
            {safe(maxDrawdown)?.toFixed(2) ?? '—'}%
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            {maxDrawdown <= 10 ? 'Controlled risk' : maxDrawdown <= 20 ? 'Moderate risk' : 'High risk'}
          </div>
        </MetricCard>

        <MetricCard label="Avg Win">
          <div className="text-xl font-bold text-emerald-500 sm:text-[22px]">
            ${safe(avgWin)?.toFixed(2) ?? '—'}
          </div>
        </MetricCard>

        <MetricCard label="Avg Loss">
          <div className="text-xl font-bold text-red-500 sm:text-[22px]">
            ${safe(avgLoss)?.toFixed(2) ?? '—'}
          </div>
        </MetricCard>

        <MetricCard label="CAGR">
          <div className="text-xl font-bold text-slate-100 sm:text-[22px]">
            {cagr >= 0 ? '+' : ''}{safe(cagr)?.toFixed(2) ?? '—'}%
          </div>
        </MetricCard>

        <MetricCard label="Volatility (Ann.)">
          <div className="text-xl font-bold text-slate-100 sm:text-[22px]">
            {safe(volatility)?.toFixed(2) ?? '—'}%
          </div>
        </MetricCard>

        <MetricCard label="Sortino Ratio">
          <div className="text-xl font-bold text-slate-100 sm:text-[22px]">
            {safe(sortinoRatio)?.toFixed(2) ?? '—'}
          </div>
        </MetricCard>

        <MetricCard label="Calmar Ratio">
          <div className="text-xl font-bold text-slate-100 sm:text-[22px]">
            {safe(calmarRatio)?.toFixed(2) ?? '—'}
          </div>
        </MetricCard>

        <MetricCard label="Time in Market">
          <div className="text-xl font-bold text-slate-100 sm:text-[22px]">
            {safe(timeInMarket)?.toFixed(1) ?? '—'}%
          </div>
        </MetricCard>

        {bestTrade && (
          <div className="rounded-xl border border-emerald-500/30 bg-slate-800/50 p-4">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">Best Trade</div>
            <div className="text-lg font-bold text-emerald-500">
              +{bestTrade.returnPercent.toFixed(2)}% ({bestTrade.symbol})
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {new Date(bestTrade.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {` x${bestTrade.holdingPeriodDays}d`}
            </div>
          </div>
        )}

        {worstTrade && (
          <div className="rounded-xl border border-red-500/30 bg-slate-800/50 p-4">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">Worst Trade</div>
            <div className="text-lg font-bold text-red-500">
              {worstTrade.returnPercent.toFixed(2)}% ({worstTrade.symbol})
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {new Date(worstTrade.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {` x${worstTrade.holdingPeriodDays}d`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
