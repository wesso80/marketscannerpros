'use client';

import { useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ToolPageLayout from '@/components/tools/ToolPageLayout';
import ToolIdentityHeader from '@/components/tools/ToolIdentityHeader';
import UpgradeGate from '@/components/UpgradeGate';
import { useUserTier, canAccessBacktest } from '@/lib/useUserTier';
import { formatPrice } from '@/lib/formatPrice';

// NaN/null safety – JSON serialises NaN as null
function n(v: number | null | undefined, fallback = 0): number {
  return v != null && Number.isFinite(v) ? v : fallback;
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface Trade {
  entryDate: string;
  exitDate: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  return: number;
  returnPercent: number;
  mfe?: number;
  mae?: number;
  exitReason?: string;
  holdingPeriodDays: number;
}

interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

interface ScorePoint {
  date: string;
  score: number;
  direction: string;
}

interface BacktestResult {
  success: boolean;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades?: number;
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number | null;
  profitFactorLabel?: string;
  avgWin: number;
  avgLoss: number;
  cagr: number;
  volatility: number;
  sortinoRatio: number;
  calmarRatio: number;
  timeInMarket: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  equityCurve: EquityPoint[];
  trades: Trade[];
  scoreSeries: ScorePoint[];
  params: {
    symbol: string;
    minScore: number;
    stopMultiplier: number;
    targetMultiplier: number;
    maxHoldBars: number;
    allowShorts: boolean;
    bars: number;
  };
  dataCoverage?: {
    requested: { startDate: string; endDate: string };
    applied: { startDate: string; endDate: string };
    bars: number;
    provider: string;
  };
  error?: string;
}

// ─── Stat Helpers ──────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-sm font-bold ${color || 'text-slate-100'}`}>{value}</div>
    </div>
  );
}

function pctColor(val: number) {
  if (val > 0) return 'text-emerald-400';
  if (val < 0) return 'text-rose-400';
  return 'text-slate-400';
}

// ─── Equity Curve (pure CSS) ───────────────────────────────────────────────

function EquityCurveChart({ data }: { data: EquityPoint[] }) {
  if (!data || data.length < 2) return null;
  const values = data.map(d => n(d.equity));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // SVG sparkline
  const w = 800;
  const h = 200;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d.equity - min) / range) * (h - 20) - 10;
    return `${x},${y}`;
  }).join(' ');

  const finalEquity = values[values.length - 1];
  const startEquity = values[0];
  const isProfit = finalEquity >= startEquity;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Equity Curve</div>
        <div className="text-xs text-slate-400">
          <span className="text-slate-500">${startEquity.toLocaleString()}</span>
          <span className="mx-1.5">→</span>
          <span className={isProfit ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
            ${finalEquity.toLocaleString()}
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(pct => (
          <line key={pct} x1={0} y1={h - pct * (h - 20) - 10} x2={w} y2={h - pct * (h - 20) - 10}
            stroke="rgba(148,163,184,0.08)" strokeWidth={1} />
        ))}
        {/* Starting capital line */}
        <line x1={0} y1={h - ((startEquity - min) / range) * (h - 20) - 10}
          x2={w} y2={h - ((startEquity - min) / range) * (h - 20) - 10}
          stroke="rgba(148,163,184,0.2)" strokeDasharray="6 4" strokeWidth={1} />
        {/* Equity line */}
        <polyline fill="none" stroke={isProfit ? '#10B981' : '#EF4444'} strokeWidth={2} points={points} />
        {/* Fill */}
        <polygon
          fill={isProfit ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)'}
          points={`0,${h} ${points} ${w},${h}`}
        />
      </svg>
    </div>
  );
}

// ─── Score Chart ───────────────────────────────────────────────────────────

function ScoreChart({ data, minScore }: { data: ScorePoint[]; minScore: number }) {
  if (data.length < 2) return null;
  // Downsample for rendering performance
  const step = Math.max(1, Math.floor(data.length / 300));
  const sampled = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  const w = 800;
  const h = 120;
  const points = sampled.map((d, i) => {
    const x = (i / (sampled.length - 1)) * w;
    const y = h - (d.score / 100) * (h - 10) - 5;
    return `${x},${y}`;
  }).join(' ');

  // Threshold line
  const threshY = h - (minScore / 100) * (h - 10) - 5;
  const bearThresh = 100 - minScore;
  const bearY = h - (bearThresh / 100) * (h - 10) - 5;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Scanner Score Over Time</div>
        <div className="flex gap-3 text-[10px] text-slate-500">
          <span>🟢 Long ≥ {minScore}</span>
          <span>🔴 Short ≤ {bearThresh}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        {/* 50 line */}
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="rgba(148,163,184,0.1)" strokeWidth={1} />
        {/* Long threshold */}
        <line x1={0} y1={threshY} x2={w} y2={threshY} stroke="rgba(16,185,129,0.3)" strokeDasharray="4 3" strokeWidth={1} />
        {/* Short threshold */}
        <line x1={0} y1={bearY} x2={w} y2={bearY} stroke="rgba(239,68,68,0.3)" strokeDasharray="4 3" strokeWidth={1} />
        {/* Score line */}
        <polyline fill="none" stroke="#94A3B8" strokeWidth={1.5} points={points} />
      </svg>
    </div>
  );
}

// ─── Trade List ────────────────────────────────────────────────────────────

function TradeTable({ trades }: { trades: Trade[] }) {
  const [page, setPage] = useState(0);
  const perPage = 15;
  const totalPages = Math.ceil(trades.length / perPage);
  const paginated = trades.slice(page * perPage, (page + 1) * perPage);

  if (trades.length === 0) {
    return <div className="py-6 text-center text-xs text-slate-500">No trades generated.</div>;
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/25">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Trade Log ({trades.length})
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="rounded px-1.5 py-0.5 hover:bg-slate-800 disabled:opacity-30">‹ Prev</button>
            <span>{page + 1}/{totalPages}</span>
            <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              className="rounded px-1.5 py-0.5 hover:bg-slate-800 disabled:opacity-30">Next ›</button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto -mx-3">
        <table className="w-full text-left text-[11px]" style={{ minWidth: '700px' }}>
          <thead>
            <tr className="border-t border-slate-800 text-[9px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-1.5 font-medium">#</th>
              <th className="px-3 py-1.5 font-medium">Side</th>
              <th className="px-3 py-1.5 font-medium">Entry</th>
              <th className="px-3 py-1.5 font-medium">Exit</th>
              <th className="px-3 py-1.5 font-medium">Entry $</th>
              <th className="px-3 py-1.5 font-medium">Exit $</th>
              <th className="px-3 py-1.5 font-medium">P&L %</th>
              <th className="px-3 py-1.5 font-medium">P&L $</th>
              <th className="px-3 py-1.5 font-medium">Bars</th>
              <th className="px-3 py-1.5 font-medium">Exit Reason</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((t, i) => (
              <tr key={i} className="border-t border-slate-800/40 hover:bg-slate-800/20">
                <td className="px-3 py-1.5 text-slate-500">{page * perPage + i + 1}</td>
                <td className="px-3 py-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                    t.side === 'LONG' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                  }`}>{t.side}</span>
                </td>
                <td className="px-3 py-1.5 font-mono text-slate-400">{t.entryDate?.slice(0, 10)}</td>
                <td className="px-3 py-1.5 font-mono text-slate-400">{t.exitDate?.slice(0, 10)}</td>
                <td className="px-3 py-1.5 font-mono text-slate-300">{formatPrice(n(t.entry))}</td>
                <td className="px-3 py-1.5 font-mono text-slate-300">{formatPrice(n(t.exit))}</td>
                <td className={`px-3 py-1.5 font-mono font-semibold ${pctColor(n(t.returnPercent))}`}>
                  {n(t.returnPercent) > 0 ? '+' : ''}{n(t.returnPercent).toFixed(2)}%
                </td>
                <td className={`px-3 py-1.5 font-mono ${pctColor(n(t.return))}`}>
                  {n(t.return) > 0 ? '+' : ''}${n(t.return).toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-slate-500">{t.holdingPeriodDays}</td>
                <td className="px-3 py-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                    t.exitReason === 'target' ? 'bg-emerald-500/10 text-emerald-400'
                    : t.exitReason === 'stop' ? 'bg-rose-500/10 text-rose-400'
                    : t.exitReason === 'signal_flip' ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-slate-800 text-slate-400'
                  }`}>{t.exitReason || 'unknown'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page Content ─────────────────────────────────────────────────────

function ScannerBacktestContent() {
  const searchParams = useSearchParams();
  const { tier, isLoading: tierLoading } = useUserTier();

  // Form state
  const [symbol, setSymbol] = useState(searchParams.get('symbol')?.toUpperCase() || 'AAPL');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2025-12-31');
  const [initialCapital, setInitialCapital] = useState(10_000);
  const [minScore, setMinScore] = useState(55);
  const [stopMultiplier, setStopMultiplier] = useState(1.5);
  const [targetMultiplier, setTargetMultiplier] = useState(3.0);
  const [maxHoldBars, setMaxHoldBars] = useState(20);
  const [allowShorts, setAllowShorts] = useState(true);
  const [timeframe, setTimeframe] = useState<string>('daily');

  // Result state
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Alert creation state
  const [alertStatus, setAlertStatus] = useState<'idle' | 'creating' | 'created' | 'error'>('idle');
  const [alertError, setAlertError] = useState<string | null>(null);

  const createTradeAlerts = async () => {
    if (!symbol.trim()) return;
    setAlertStatus('creating');
    setAlertError(null);
    try {
      const isCrypto = ['BTC','ETH','SOL','XRP','DOGE','ADA','AVAX','MATIC','LINK','DOT','BNB','LTC'].includes(symbol.trim().toUpperCase());
      const context = {
        strategy: 'scanner_backtest',
        timeframe,
        minScore,
        stopMultiplier,
        targetMultiplier,
        maxHoldBars,
        allowShorts,
      };
      // Create scenario-open alert
      const entryRes = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          assetType: isCrypto ? 'crypto' : 'equity',
          conditionType: 'strategy_entry',
          conditionValue: 0,
          name: `${symbol} Scanner Scenario Open Alert`,
          isRecurring: true,
          notifyEmail: true,
          notifyPush: true,
          isSmartAlert: true,
          cooldownMinutes: 60,
          smartAlertContext: context,
        }),
      });
      if (!entryRes.ok) {
        const data = await entryRes.json();
        throw new Error(data.error || data.message || 'Failed to create scenario-open alert');
      }
      // Create scenario-close alert
      const exitRes = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          assetType: isCrypto ? 'crypto' : 'equity',
          conditionType: 'strategy_exit',
          conditionValue: 0,
          name: `${symbol} Scanner Scenario Close Alert`,
          isRecurring: true,
          notifyEmail: true,
          notifyPush: true,
          isSmartAlert: true,
          cooldownMinutes: 60,
          smartAlertContext: context,
        }),
      });
      if (!exitRes.ok) {
        const data = await exitRes.json();
        throw new Error(data.error || data.message || 'Failed to create scenario-close alert');
      }
      setAlertStatus('created');
    } catch (err) {
      setAlertError(err instanceof Error ? err.message : 'Failed to create alerts');
      setAlertStatus('error');
    }
  };

  const runBacktest = async () => {
    if (!symbol.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAlertStatus('idle');
    setAlertError(null);
    try {
      const res = await fetch('/api/backtest/scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.trim(),
          startDate,
          endDate,
          initialCapital,
          minScore,
          stopMultiplier,
          targetMultiplier,
          maxHoldBars,
          allowShorts,
          timeframe,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || `Server returned ${res.status}`);
        return;
      }
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  // Summary counts
  const exitBreakdown = useMemo(() => {
    if (!result) return null;
    const counts: Record<string, number> = {};
    for (const t of result.trades) {
      const r = t.exitReason || 'unknown';
      counts[r] = (counts[r] || 0) + 1;
    }
    return counts;
  }, [result]);

  if (tierLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-slate-500">Loading…</div>;
  }
  if (!canAccessBacktest(tier)) {
    return <UpgradeGate requiredTier="pro_trader" feature="Scanner Backtest" />;
  }

  return (
    <ToolPageLayout
      identity={
        <ToolIdentityHeader
          toolName="Scanner Backtest"
          description="Test the Market Scanner's signal logic against historical data"
          modeLabel="Backtest"
          confidenceLabel="Historical"
          lastUpdatedLabel="—"
        />
      }
      primary={
        <div className="space-y-5">
          {/* ─── Input Form ─── */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 lg:p-5">
            <div className="mb-3 text-sm font-semibold text-slate-100">Configuration</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {/* Symbol */}
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Symbol</label>
                <input
                  value={symbol}
                  onChange={e => setSymbol(e.target.value.toUpperCase())}
                  placeholder="AAPL"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-sm font-semibold text-slate-100"
                />
              </div>
              {/* Timeframe */}
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Timeframe</label>
                <select value={timeframe} onChange={e => setTimeframe(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-sm text-slate-200">
                  <option value="daily">Daily</option>
                  <option value="60min">1H</option>
                  <option value="30min">30m</option>
                </select>
              </div>
              {/* Start */}
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-sm text-slate-200" />
              </div>
              {/* End */}
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">End Date</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-sm text-slate-200" />
              </div>
              {/* Capital */}
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Capital ($)</label>
                <input type="number" value={initialCapital} onChange={e => setInitialCapital(Number(e.target.value))}
                  min={100} step={1000}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-sm text-slate-200" />
              </div>
            </div>

            {/* Advanced params */}
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] font-medium text-slate-400 hover:text-slate-200">
                ▸ Advanced Parameters
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Min Score (50-95)</label>
                  <input type="number" value={minScore} onChange={e => setMinScore(Number(e.target.value))}
                    min={50} max={95} step={5}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Stop (ATR ×)</label>
                  <input type="number" value={stopMultiplier} onChange={e => setStopMultiplier(Number(e.target.value))}
                    min={0.5} max={5} step={0.25}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Target (ATR ×)</label>
                  <input type="number" value={targetMultiplier} onChange={e => setTargetMultiplier(Number(e.target.value))}
                    min={1} max={10} step={0.5}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Max Hold (Bars)</label>
                  <input type="number" value={maxHoldBars} onChange={e => setMaxHoldBars(Number(e.target.value))}
                    min={3} max={100} step={1}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-sm text-slate-200" />
                </div>
                <div className="flex items-end pb-0.5">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={allowShorts} onChange={e => setAllowShorts(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900" />
                    Allow Shorts
                  </label>
                </div>
              </div>
            </details>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={runBacktest}
                disabled={loading}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                {loading ? 'Running Backtest…' : 'Run Scanner Backtest'}
              </button>
              <Link href="/tools/scanner" className="text-xs text-slate-500 hover:text-slate-300">
                ← Back to Scanner
              </Link>
              {loading && (
                <span className="text-xs text-slate-500">Fetching data & computing signals…</span>
              )}
            </div>
          </section>

          {error && (
            <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
              {error}
            </div>
          )}

          {/* ─── Results ─── */}
          {result && (
            <>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
                <strong>Historical paper simulation only.</strong> Scanner backtests use historical data for educational scenario review. Results are not real performance, do not model every live-market cost or liquidity constraint, and do not predict or guarantee future outcomes.
              </div>

              {/* Key stats */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm font-semibold text-slate-100">Results — {result.params.symbol}</div>
                  <div className="flex items-center gap-3">
                    <div className="text-[10px] text-slate-500">
                      {result.dataCoverage?.applied.startDate} → {result.dataCoverage?.applied.endDate} ·
                      {' '}{result.params.bars} bars · {result.dataCoverage?.provider}
                    </div>
                    <button
                      onClick={createTradeAlerts}
                      disabled={alertStatus === 'creating' || alertStatus === 'created'}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        alertStatus === 'created'
                          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                          : alertStatus === 'creating'
                          ? 'bg-slate-700 text-slate-400 opacity-60'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                      }`}
                      title="Create alerts that notify you when this strategy scenario opens or closes historically similar conditions"
                    >
                      {alertStatus === 'created' ? '✓ Alerts Created' : alertStatus === 'creating' ? 'Creating…' : '🔔 Alert Me on Scenario Conditions'}
                    </button>
                  </div>
                </div>
                {alertStatus === 'created' && (
                  <div className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
                    ✓ Scenario open/close alerts created for <strong>{symbol}</strong> using this strategy config. You&apos;ll get email + push notifications every 15 min when matching conditions appear or fade.
                  </div>
                )}
                {alertStatus === 'error' && alertError && (
                  <div className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
                    {alertError}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                  <StatCard label="Total Trades" value={String(n(result.totalTrades))} />
                  <StatCard label="Win Rate" value={`${n(result.winRate).toFixed(1)}%`}
                    color={n(result.winRate) >= 50 ? 'text-emerald-400' : 'text-rose-400'} />
                  <StatCard label="Total Return" value={`${n(result.totalReturn) > 0 ? '+' : ''}${n(result.totalReturn).toFixed(2)}%`}
                    color={pctColor(n(result.totalReturn))} />
                  <StatCard label="Max Drawdown" value={`-${n(result.maxDrawdown).toFixed(2)}%`} color="text-rose-400" />
                  <StatCard label="Sharpe" value={n(result.sharpeRatio).toFixed(2)}
                    color={n(result.sharpeRatio) >= 1 ? 'text-emerald-400' : n(result.sharpeRatio) >= 0 ? 'text-amber-400' : 'text-rose-400'} />
                  <StatCard label="Profit Factor" value={n(result.profitFactor).toFixed(2)}
                    color={n(result.profitFactor) >= 1.5 ? 'text-emerald-400' : n(result.profitFactor) >= 1 ? 'text-amber-400' : 'text-rose-400'} />
                  <StatCard label="CAGR" value={`${n(result.cagr).toFixed(2)}%`}
                    color={pctColor(n(result.cagr))} />
                </div>

                {/* Secondary stats */}
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                  <StatCard label="Avg Win" value={`+$${n(result.avgWin).toFixed(2)}`} color="text-emerald-400" />
                  <StatCard label="Avg Loss" value={`$${n(result.avgLoss).toFixed(2)}`} color="text-rose-400" />
                  <StatCard label="Sortino" value={n(result.sortinoRatio).toFixed(2)} />
                  <StatCard label="Calmar" value={n(result.calmarRatio).toFixed(2)} />
                  <StatCard label="Volatility" value={`${n(result.volatility).toFixed(2)}%`} />
                  <StatCard label="Time In Market" value={`${n(result.timeInMarket).toFixed(1)}%`} />
                  <StatCard label="W/L" value={`${result.winningTrades}/${result.losingTrades}`} />
                </div>

                {/* Exit breakdown */}
                {exitBreakdown && Object.keys(exitBreakdown).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">Exits:</span>
                    {Object.entries(exitBreakdown).map(([reason, count]) => (
                      <span key={reason} className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                        reason === 'target' ? 'bg-emerald-500/10 text-emerald-400'
                        : reason === 'stop' ? 'bg-rose-500/10 text-rose-400'
                        : reason === 'signal_flip' ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-slate-800 text-slate-400'
                      }`}>{reason}: {count}</span>
                    ))}
                  </div>
                )}

                {/* Largest Gain / Loss */}
                {(result.bestTrade || result.worstTrade) && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {result.bestTrade && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
                        <div className="text-[10px] uppercase text-emerald-500">Largest Gain</div>
                        <div className="text-xs text-slate-300">
                          {result.bestTrade.side} {result.bestTrade.symbol} · {result.bestTrade.entryDate?.slice(0, 10)} →
                          {' '}{result.bestTrade.exitDate?.slice(0, 10)} ·
                          {' '}<span className="font-semibold text-emerald-400">+{n(result.bestTrade.returnPercent).toFixed(2)}%</span>
                        </div>
                      </div>
                    )}
                    {result.worstTrade && (
                      <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2">
                        <div className="text-[10px] uppercase text-rose-500">Largest Loss</div>
                        <div className="text-xs text-slate-300">
                          {result.worstTrade.side} {result.worstTrade.symbol} · {result.worstTrade.entryDate?.slice(0, 10)} →
                          {' '}{result.worstTrade.exitDate?.slice(0, 10)} ·
                          {' '}<span className="font-semibold text-rose-400">{n(result.worstTrade.returnPercent).toFixed(2)}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Equity curve */}
              <EquityCurveChart data={result.equityCurve} />

              {/* Score chart */}
              <ScoreChart data={result.scoreSeries} minScore={result.params.minScore} />

              {/* Trade table */}
              <TradeTable trades={result.trades} />
            </>
          )}

          {/* Explanation */}
          {!result && !loading && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/25 p-4">
              <div className="text-sm font-semibold text-slate-100">How It Works</div>
              <div className="mt-2 space-y-2 text-xs leading-relaxed text-slate-400">
                <p>
                  This backtester replays the <strong className="text-slate-200">exact same scoring logic</strong> used by
                  the live Market Scanner — RSI, MACD, EMA200, ADX, Stochastic, CCI, Aroon, OBV — and walks bar-by-bar
                  through historical OHLCV data.
                </p>
                <p>
                  <strong className="text-slate-200">Trigger:</strong> When scanner score ≥ threshold (bullish) or
                  ≤ (100 − threshold) (bearish). <br />
                  <strong className="text-slate-200">Invalidation:</strong> ATR × stop multiplier from reference. <br />
                  <strong className="text-slate-200">Key Level:</strong> ATR × target multiplier from reference. <br />
                  <strong className="text-slate-200">Exit:</strong> Hit invalidation, hit key level, signal flips to opposite direction,
                  or max holding period expires.
                </p>
                <p>
                  Data: <strong className="text-slate-200">Alpha Vantage</strong> for equities/forex,
                  {' '}<strong className="text-slate-200">CoinGecko</strong> for crypto.
                  The first 200 bars are used as indicator warmup (EMA200).
                </p>
              </div>
            </section>
          )}
        </div>
      }
    />
  );
}

// ─── Page Export ────────────────────────────────────────────────────────────

export default function ScannerBacktestPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center text-slate-500">Loading…</div>}>
      <ScannerBacktestContent />
    </Suspense>
  );
}
