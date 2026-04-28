'use client';

import { BACKTEST_SLIPPAGE_BPS } from '@/lib/backtest/assumptions';

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

interface KellyCriterion {
  kellyFraction: number;
  halfKelly: number;
  expectedEdge: number;
}

interface MonteCarloResult {
  simulations: number;
  seed?: number;
  medianReturn: number;
  p5Return: number;
  p25Return: number;
  p75Return: number;
  p95Return: number;
  medianMaxDrawdown: number;
  p95MaxDrawdown: number;
  ruinProbability: number;
}

interface PerformanceMetricsProps {
  totalReturn: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number | null;
  profitFactorLabel?: string;
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
  kelly?: KellyCriterion;
  monteCarlo?: MonteCarloResult;
}

function safe(v: number) {
  return Number.isFinite(v) ? v : null;
}

function scoreProfitFactor(value: number | null | undefined) {
  return value ?? 3;
}

function formatProfitFactor(value: number | null | undefined, label?: string) {
  return value == null ? label ?? 'No losses' : value.toFixed(2);
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

function AssumptionTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-950/35 p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.09em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-100">{value}</div>
      <div className="mt-1 text-[11px] leading-5 text-slate-400">{detail}</div>
    </div>
  );
}

function BacktestAssumptionsPanel({ totalTrades, monteCarlo }: { totalTrades: number; monteCarlo?: MonteCarloResult }) {
  const sampleTone = totalTrades >= 50 ? 'text-emerald-300' : totalTrades >= 20 ? 'text-amber-300' : 'text-red-300';

  return (
    <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.1em] text-amber-300">Backtest Assumptions</div>
          <div className="mt-1 text-xs leading-5 text-amber-100/80">Historical research statistics only. These fields show what the result does and does not model.</div>
        </div>
        <div className={`rounded-md border border-current/20 bg-slate-950/30 px-2 py-1 text-[11px] font-black uppercase ${sampleTone}`}>
          Sample: {totalTrades} trades
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AssumptionTile
          label="Fill Model"
          value="Historical bar simulation"
          detail="Live queue priority, latency, partial fills, taxes, borrow costs, and broker execution are not modeled."
        />
        <AssumptionTile
          label="Costs"
          value={`${BACKTEST_SLIPPAGE_BPS} bps slippage applied`}
          detail="Spread, commissions, exchange fees, borrow costs, taxes, and market impact remain unmodeled."
        />
        <AssumptionTile
          label="Liquidity"
          value="Not enforced"
          detail="Position size, borrow availability, option depth, and ability to exit in stressed markets are not guaranteed by this sample."
        />
        <AssumptionTile
          label="Bias Controls"
          value="Review required"
          detail="Survivorship bias, regime changes, overfitting, and data coverage gaps can distort historical results."
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <AssumptionTile
          label="Sample Quality"
          value={totalTrades >= 50 ? 'Broader sample' : totalTrades >= 20 ? 'Moderate sample' : 'Thin sample'}
          detail="Use larger samples before treating the statistics as stable; low trade counts can swing sharply."
        />
        <AssumptionTile
          label="Monte Carlo"
          value={monteCarlo ? `${monteCarlo.simulations} simulations` : 'Not available'}
          detail={monteCarlo?.seed != null ? `Deterministic seed ${monteCarlo.seed}; sequence risk only, not live execution risk.` : 'Monte Carlo appears after enough trades for a shuffle simulation.'}
        />
        <AssumptionTile
          label="Interpretation"
          value="Scenario evidence"
          detail="Past sample behaviour does not predict or guarantee future outcomes and is not a recommendation."
        />
      </div>
    </div>
  );
}

export default function PerformanceMetrics({ totalReturn, winRate, totalTrades, profitFactor, profitFactorLabel, sharpeRatio, maxDrawdown, avgWin, avgLoss, cagr, volatility, sortinoRatio, calmarRatio, timeInMarket, bestTrade, worstTrade, kelly, monteCarlo }: PerformanceMetricsProps) {
  const pfScore = scoreProfitFactor(profitFactor);
  const pfColor = pfScore >= 1.5 ? '#10b981' : pfScore >= 1 ? '#fbbf24' : '#ef4444';
  const pfBorder = pfScore >= 1.5 ? 'rgba(16,185,129,0.65)' : pfScore >= 1 ? 'rgba(251,191,36,0.55)' : 'rgba(239,68,68,0.65)';
  const ddColor = maxDrawdown <= 10 ? '#10b981' : maxDrawdown <= 20 ? '#fbbf24' : '#ef4444';
  const ddBorder = maxDrawdown <= 10 ? 'rgba(16,185,129,0.55)' : maxDrawdown <= 20 ? 'rgba(251,191,36,0.55)' : 'rgba(239,68,68,0.65)';

  return (
    <div className="mb-6 rounded-2xl border border-slate-700/80 bg-[var(--msp-card)] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
      <h2 className="mb-6 flex items-center gap-2.5 text-[15px] font-semibold uppercase tracking-wider text-slate-100">
        <span className="rounded-lg bg-[var(--msp-muted)] px-2 py-1.5 text-sm">📊</span>
        Performance Metrics
      </h2>

      <BacktestAssumptionsPanel totalTrades={totalTrades} monteCarlo={monteCarlo} />

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
            {formatProfitFactor(profitFactor, profitFactorLabel)}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            {profitFactor == null ? 'No losing trades in sample' : pfScore >= 1.5 ? 'Above breakeven' : pfScore >= 1 ? 'Break-even' : 'Below breakeven'}
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
            {maxDrawdown <= 10 ? 'Low drawdown' : maxDrawdown <= 20 ? 'Moderate drawdown' : 'High drawdown'}
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
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">Largest Gain</div>
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
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">Largest Loss</div>
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

      {/* Kelly Criterion & Monte Carlo */}
      {(kelly || monteCarlo) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {kelly && (
            <div className="rounded-xl border border-violet-500/30 bg-slate-800/50 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-violet-300">
                <span>🎯</span> Kelly Criterion
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[10px] text-slate-400">Full Kelly</div>
                  <div className="text-lg font-bold text-violet-300">{(kelly.kellyFraction * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Half Kelly ✓</div>
                  <div className="text-lg font-bold text-emerald-400">{(kelly.halfKelly * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Edge / Trade</div>
                  <div className={`text-lg font-bold ${kelly.expectedEdge >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    ${kelly.expectedEdge.toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-slate-500">
                                {kelly.kellyFraction > 0 ? 'Positive expectancy detected. Half-Kelly shown for reference.' : 'No positive expectancy detected in simulation.'}
              </div>
            </div>
          )}

          {monteCarlo && (
            <div className="rounded-xl border border-amber-500/30 bg-slate-800/50 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-amber-300">
                <span>🎲</span> Monte Carlo ({monteCarlo.simulations} sims)
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">5th %ile (worst)</span>
                  <span className={`font-medium ${monteCarlo.p5Return >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {monteCarlo.p5Return >= 0 ? '+' : ''}{monteCarlo.p5Return.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">25th %ile</span>
                  <span className={`font-medium ${monteCarlo.p25Return >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {monteCarlo.p25Return >= 0 ? '+' : ''}{monteCarlo.p25Return.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Median</span>
                  <span className={`font-bold ${monteCarlo.medianReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {monteCarlo.medianReturn >= 0 ? '+' : ''}{monteCarlo.medianReturn.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">75th %ile</span>
                  <span className={`font-medium ${monteCarlo.p75Return >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {monteCarlo.p75Return >= 0 ? '+' : ''}{monteCarlo.p75Return.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">95th %ile (best)</span>
                  <span className="font-medium text-emerald-400">+{monteCarlo.p95Return.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Median DD</span>
                  <span className="font-medium text-amber-400">{monteCarlo.medianMaxDrawdown.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">95th %ile DD</span>
                  <span className="font-medium text-red-400">{monteCarlo.p95MaxDrawdown.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Ruin Prob (&gt;50% DD)</span>
                  <span className={`font-bold ${monteCarlo.ruinProbability <= 5 ? 'text-emerald-400' : monteCarlo.ruinProbability <= 15 ? 'text-amber-400' : 'text-red-400'}`}>
                    {monteCarlo.ruinProbability.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
