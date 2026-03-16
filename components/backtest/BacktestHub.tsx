'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 8: BACKTEST — Strategy + Scanner Backtesting (Combined)
   Real APIs: /api/backtest, /api/backtest/brain, /api/backtest/time-scanner,
              /api/backtest/scanner, /api/backtest/symbol-range
   Pro Trader only.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useCallback } from 'react';
import { Card, SectionHeader, Badge, ScoreBar, TabBar, EmptyState } from '@/app/v2/_components/ui';
import { UpgradeGate } from '@/app/v2/_components/ui';
import { useV2 } from '@/app/v2/_lib/V2Context';
import { useUserTier } from '@/lib/useUserTier';
import {
  fetchBacktest,
  fetchScannerBacktest,
  fetchSymbolRange,
  type BacktestResult,
  type BacktestTrade,
  type EquityPoint,
  type BacktestRequest,
  type ScannerBacktestRequest,
} from '@/app/v2/_lib/api';
import {
  BACKTEST_STRATEGY_CATEGORIES,
  DEFAULT_BACKTEST_STRATEGY,
  getBacktestStrategy,
} from '@/lib/strategies/registry';
import {
  STRATEGY_EDGE_GROUPS,
  findEdgeGroupForStrategyWithPreference,
  getPreferredStrategyForEdgeGroup,
  type EdgeGroupId,
} from '@/lib/backtest/edgeGroups';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(v: number | null | undefined, fallback = 0): number {
  return v != null && Number.isFinite(v) ? v : fallback;
}

function pctColor(v: number) {
  return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';
}

function fmtPct(v: number, dec = 1) {
  return `${v >= 0 ? '+' : ''}${n(v).toFixed(dec)}%`;
}

const TIMEFRAMES = [
  { value: '5min', label: '5m' },
  { value: '15min', label: '15m' },
  { value: '30min', label: '30m' },
  { value: '60min', label: '1H' },
  { value: '4hour', label: '4H' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

// Filter out options_signal_replay (options confluence removed from v2)
const V2_STRATEGY_CATEGORIES = BACKTEST_STRATEGY_CATEGORIES.map(cat => ({
  ...cat,
  strategies: cat.strategies.filter(s => s.id !== 'options_signal_replay'),
})).filter(cat => cat.strategies.length > 0);

// Flatten for quick lookup
const ALL_STRATEGIES = V2_STRATEGY_CATEGORIES.flatMap(c => c.strategies);

// ─── Main Component ──────────────────────────────────────────────────────────

export default function BacktestPage() {
  const { tier } = useUserTier();
  const { selectedSymbol } = useV2();

  // Mode: strategy vs scanner
  const [mode, setMode] = useState<'strategy' | 'scanner'>('strategy');

  // Shared state
  const [symbol, setSymbol] = useState(selectedSymbol || 'AAPL');
  const [timeframe, setTimeframe] = useState('daily');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2025-12-31');
  const [capital, setCapital] = useState(10000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(BacktestResult & { scoreSeries?: { date: string; score: number; direction: string }[] }) | null>(null);

  // Strategy mode state
  const [edgeGroup, setEdgeGroup] = useState<EdgeGroupId>('msp_aio_systems');
  const [strategy, setStrategy] = useState(DEFAULT_BACKTEST_STRATEGY);

  // Scanner mode state
  const [minScore, setMinScore] = useState(70);
  const [stopMultiplier, setStopMultiplier] = useState(2.0);
  const [targetMultiplier, setTargetMultiplier] = useState(3.0);
  const [maxHoldBars, setMaxHoldBars] = useState(20);
  const [allowShorts, setAllowShorts] = useState(false);

  // Result view tab
  const [resultTab, setResultTab] = useState('Summary');

  // Edge group → filtered strategies
  const filteredStrategies = useMemo(() => {
    const group = STRATEGY_EDGE_GROUPS.find(g => g.id === edgeGroup);
    if (!group) return ALL_STRATEGIES;
    return V2_STRATEGY_CATEGORIES
      .filter(cat => group.categoryIds.includes(cat.id))
      .flatMap(cat => cat.strategies);
  }, [edgeGroup]);

  // When edge group changes, select the preferred strategy for it
  const handleEdgeGroupChange = useCallback((gid: EdgeGroupId) => {
    setEdgeGroup(gid);
    const strategyIds = ALL_STRATEGIES.map(s => s.id);
    const preferred = getPreferredStrategyForEdgeGroup(gid, strategyIds);
    if (preferred) setStrategy(preferred);
  }, []);

  // Auto-resolve date range on symbol change
  const resolveRange = useCallback(async (sym: string) => {
    try {
      const range = await fetchSymbolRange(sym);
      if (range?.coverage) {
        setStartDate(range.coverage.startDate.slice(0, 10));
        setEndDate(range.coverage.endDate.slice(0, 10));
      }
    } catch { /* keep defaults */ }
  }, []);

  const handleSymbolChange = useCallback((sym: string) => {
    const cleaned = sym.trim().toUpperCase();
    setSymbol(cleaned);
    if (cleaned.length >= 2) void resolveRange(cleaned);
  }, [resolveRange]);

  // ─── Run Backtest ────────────────────────────────────────────────────

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      if (mode === 'strategy') {
        const req: BacktestRequest = {
          symbol, strategy, startDate, endDate,
          initialCapital: capital, timeframe,
        };
        const res = await fetchBacktest(req);
        setResult(res);
      } else {
        const req: ScannerBacktestRequest = {
          symbol, startDate, endDate,
          initialCapital: capital, timeframe,
          minScore, stopMultiplier, targetMultiplier,
          maxHoldBars, allowShorts,
        };
        const res = await fetchScannerBacktest(req);
        setResult(res);
      }
      setResultTab('Summary');
    } catch (err: any) {
      setError(err?.message || 'Backtest failed');
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <SectionHeader title="Backtest Lab" subtitle="Strategy & scanner backtesting engine" />

      <UpgradeGate requiredTier="pro_trader" currentTier={tier} feature="Strategy Backtesting Engine">
        {/* ── Mode Toggle ──────────────────────────────────────── */}
        <div className="flex gap-1 mb-4">
          {(['strategy', 'scanner'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setResult(null); setError(null); }}
              className={`px-4 py-2 text-xs rounded-lg font-medium transition-colors ${
                mode === m
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              {m === 'strategy' ? '🧪 Strategy Backtest' : '📡 Scanner Backtest'}
            </button>
          ))}
        </div>

        {/* ── Configuration Panel ──────────────────────────────── */}
        <Card>
          <div className="space-y-4">
            {/* Top row: Symbol + Timeframe */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Symbol</label>
                <input
                  value={symbol}
                  onChange={e => handleSymbolChange(e.target.value)}
                  className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-600/40"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Timeframe</label>
                <select
                  value={timeframe}
                  onChange={e => setTimeframe(e.target.value)}
                  className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2 text-white focus:outline-none focus:border-emerald-600/40"
                >
                  {TIMEFRAMES.map(tf => <option key={tf.value} value={tf.value}>{tf.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Start</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2 text-white focus:outline-none focus:border-emerald-600/40"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">End</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2 text-white focus:outline-none focus:border-emerald-600/40"
                />
              </div>
            </div>

            {/* Strategy-specific controls */}
            {mode === 'strategy' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Edge Group</label>
                  <select
                    value={edgeGroup}
                    onChange={e => handleEdgeGroupChange(e.target.value as EdgeGroupId)}
                    className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2 text-white focus:outline-none focus:border-emerald-600/40"
                  >
                    {STRATEGY_EDGE_GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Strategy</label>
                  <select
                    value={strategy}
                    onChange={e => setStrategy(e.target.value)}
                    className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2 text-white focus:outline-none focus:border-emerald-600/40"
                  >
                    {filteredStrategies.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Scanner-specific controls */}
            {mode === 'scanner' && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Min Score</label>
                  <input
                    type="number"
                    min={50} max={95} step={5}
                    value={minScore}
                    onChange={e => setMinScore(Number(e.target.value))}
                    className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2 text-white focus:outline-none focus:border-emerald-600/40"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">ATR Stop ×</label>
                  <input
                    type="number"
                    min={0.5} max={5} step={0.5}
                    value={stopMultiplier}
                    onChange={e => setStopMultiplier(Number(e.target.value))}
                    className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2 text-white focus:outline-none focus:border-emerald-600/40"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">ATR Target ×</label>
                  <input
                    type="number"
                    min={0.5} max={10} step={0.5}
                    value={targetMultiplier}
                    onChange={e => setTargetMultiplier(Number(e.target.value))}
                    className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2 text-white focus:outline-none focus:border-emerald-600/40"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Max Bars</label>
                  <input
                    type="number"
                    min={5} max={100} step={5}
                    value={maxHoldBars}
                    onChange={e => setMaxHoldBars(Number(e.target.value))}
                    className="w-full bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2 text-white focus:outline-none focus:border-emerald-600/40"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowShorts}
                      onChange={e => setAllowShorts(e.target.checked)}
                      className="accent-emerald-400"
                    />
                    Allow Shorts
                  </label>
                </div>
              </div>
            )}

            {/* Capital + Run */}
            <div className="flex items-end gap-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Capital ($)</label>
                <input
                  type="number"
                  min={1000} step={1000}
                  value={capital}
                  onChange={e => setCapital(Number(e.target.value))}
                  className="w-32 bg-[#0A101C] border border-slate-700/40 rounded-lg text-xs px-3 py-2 text-white focus:outline-none focus:border-emerald-600/40"
                />
              </div>
              <button
                onClick={() => void runBacktest()}
                disabled={loading || !symbol}
                className="px-5 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Running…' : 'Run Backtest'}
              </button>
            </div>
          </div>
        </Card>

        {/* ── Error ────────────────────────────────────────────── */}
        {error && (
          <Card>
            <div className="text-xs text-red-400 py-4 text-center">{error}</div>
          </Card>
        )}

        {/* ── Loading ──────────────────────────────────────────── */}
        {loading && (
          <Card>
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mb-3" />
              <div className="text-xs text-slate-500">Running {mode} backtest on {symbol}…</div>
            </div>
          </Card>
        )}

        {/* ── Results ──────────────────────────────────────────── */}
        {result && !loading && (
          <div className="space-y-4">
            {/* Result header */}
            <Card>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-white">{symbol}</span>
                  <Badge
                    label={mode === 'strategy' ? (getBacktestStrategy(strategy)?.label || strategy) : `Scanner ≥${minScore}`}
                    color="#6366F1"
                    small
                  />
                  <Badge label={TIMEFRAMES.find(t => t.value === timeframe)?.label || timeframe} color="#64748B" small />
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold ${pctColor(n(result.totalReturn))}`}>
                    {fmtPct(n(result.totalReturn))}
                  </span>
                  <span className="text-xs text-slate-500">{n(result.totalTrades)} trades</span>
                </div>
              </div>
            </Card>

            {/* Result tabs */}
            <TabBar
              tabs={['Summary', 'Equity Curve', 'Trades', ...(result.diagnostics ? ['Diagnostics'] : [])]}
              active={resultTab}
              onChange={setResultTab}
            />

            {/* ─── SUMMARY ──────────────────────────────────── */}
            {resultTab === 'Summary' && (
              <div className="space-y-4">
                {/* Key metrics grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <MetricCard label="Total Return" value={fmtPct(n(result.totalReturn))} color={pctColor(n(result.totalReturn))} />
                  <MetricCard label="Win Rate" value={`${n(result.winRate).toFixed(1)}%`} color={n(result.winRate) >= 50 ? 'text-emerald-400' : 'text-red-400'} />
                  <MetricCard label="Profit Factor" value={n(result.profitFactor).toFixed(2)} color={n(result.profitFactor) >= 1 ? 'text-emerald-400' : 'text-red-400'} />
                  <MetricCard label="Max Drawdown" value={fmtPct(n(result.maxDrawdown))} color="text-red-400" />
                  <MetricCard label="Sharpe" value={n(result.sharpeRatio).toFixed(2)} />
                  <MetricCard label="CAGR" value={fmtPct(n(result.cagr))} color={pctColor(n(result.cagr))} />
                </div>

                {/* Extended metrics */}
                <Card>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Performance Detail</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-y-3 gap-x-4 text-xs">
                    <MetricRow label="Total Trades" value={n(result.totalTrades).toString()} />
                    <MetricRow label="Winners" value={n(result.winningTrades).toString()} color="text-emerald-400" />
                    <MetricRow label="Losers" value={n(result.losingTrades).toString()} color="text-red-400" />
                    <MetricRow label="Avg Win" value={fmtPct(n(result.avgWin))} color="text-emerald-400" />
                    <MetricRow label="Avg Loss" value={fmtPct(n(result.avgLoss))} color="text-red-400" />
                    <MetricRow label="Sortino" value={n(result.sortinoRatio).toFixed(2)} />
                    <MetricRow label="Calmar" value={n(result.calmarRatio).toFixed(2)} />
                    <MetricRow label="Volatility" value={fmtPct(n(result.volatility))} />
                    <MetricRow label="Time in Market" value={`${n(result.timeInMarket).toFixed(1)}%`} />
                    {result.bestTrade && <MetricRow label="Best Trade" value={fmtPct(n(result.bestTrade.returnPercent))} color="text-emerald-400" />}
                    {result.worstTrade && <MetricRow label="Worst Trade" value={fmtPct(n(result.worstTrade.returnPercent))} color="text-red-400" />}
                  </div>
                </Card>

                {/* Validation */}
                {result.validation && (
                  <Card>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge
                        label={result.validation.status}
                        color={result.validation.status === 'validated' ? '#10B981' : result.validation.status === 'invalidated' ? '#EF4444' : '#F59E0B'}
                        small
                      />
                      <span className="text-xs text-slate-400">{result.validation.reason}</span>
                    </div>
                  </Card>
                )}

                {/* Data coverage */}
                {result.dataCoverage && (
                  <Card>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Data Coverage</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs text-slate-400">
                      <div>Applied: <span className="text-white">{result.dataCoverage.applied.startDate} → {result.dataCoverage.applied.endDate}</span></div>
                      <div>Bars: <span className="text-white">{result.dataCoverage.bars}</span></div>
                      {result.dataCoverage.provider && <div>Provider: <span className="text-white">{result.dataCoverage.provider}</span></div>}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* ─── EQUITY CURVE ─────────────────────────────── */}
            {resultTab === 'Equity Curve' && (
              <Card>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Equity Curve</h3>
                {result.equityCurve && result.equityCurve.length > 1 ? (
                  <EquityCurveChart data={result.equityCurve} />
                ) : (
                  <EmptyState message="Not enough data to display" icon="📉" />
                )}
              </Card>
            )}

            {/* ─── TRADES ───────────────────────────────────── */}
            {resultTab === 'Trades' && (
              <Card>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Trade History ({result.trades?.length || 0} trades)
                </h3>
                {result.trades && result.trades.length > 0 ? (
                  <TradeTable trades={result.trades} />
                ) : (
                  <EmptyState message="No trades generated" icon="📊" />
                )}
              </Card>
            )}

            {/* ─── DIAGNOSTICS ──────────────────────────────── */}
            {resultTab === 'Diagnostics' && result.diagnostics && (
              <Card>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Strategy Diagnostics</h3>
                  <Badge
                    label={`${result.diagnostics.score}/100`}
                    color={result.diagnostics.score >= 70 ? '#10B981' : result.diagnostics.score >= 40 ? '#F59E0B' : '#EF4444'}
                    small
                  />
                  <Badge
                    label={result.diagnostics.verdict}
                    color={result.diagnostics.verdict === 'healthy' ? '#10B981' : result.diagnostics.verdict === 'watch' ? '#F59E0B' : '#EF4444'}
                    small
                  />
                </div>
                <p className="text-xs text-slate-400 mb-3">{result.diagnostics.summary}</p>
                {result.diagnostics.failureTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {result.diagnostics.failureTags.map(tag => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">{tag}</span>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <EmptyState
            message={`Configure your ${mode === 'strategy' ? 'strategy' : 'scanner'} parameters above and click Run Backtest`}
            icon="🧪"
          />
        )}
      </UpgradeGate>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card>
      <div className="text-center">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
        <div className={`text-lg font-bold ${color || 'text-white'}`}>{value}</div>
      </div>
    </Card>
  );
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-semibold ${color || 'text-white'}`}>{value}</span>
    </div>
  );
}

function EquityCurveChart({ data }: { data: EquityPoint[] }) {
  const values = data.map(d => d.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const w = 800;
  const h = 200;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d.equity - min) / range) * (h - 20) - 10;
    return `${x},${y}`;
  });
  const linePoints = pts.join(' ');
  const areaPoints = `0,${h} ${linePoints} ${w},${h}`;

  const startVal = values[0] ?? 0;
  const endVal = values[values.length - 1] ?? 0;
  const lineColor = endVal >= startVal ? '#10B981' : '#EF4444';

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48" preserveAspectRatio="none">
        <defs>
          <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#eqFill)" />
        <polyline points={linePoints} fill="none" stroke={lineColor} strokeWidth="2" />
      </svg>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-1">
        <span>{data[0]?.date}</span>
        <span>${endVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function TradeTable({ trades }: { trades: BacktestTrade[] }) {
  const [page, setPage] = useState(0);
  const perPage = 15;
  const totalPages = Math.ceil(trades.length / perPage);
  const slice = trades.slice(page * perPage, (page + 1) * perPage);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700/50 text-[10px] uppercase text-slate-500 tracking-wider">
              <th className="py-2 px-2 text-left">Side</th>
              <th className="py-2 px-2 text-left">Entry</th>
              <th className="py-2 px-2 text-left">Exit</th>
              <th className="py-2 px-2 text-right">Entry $</th>
              <th className="py-2 px-2 text-right">Exit $</th>
              <th className="py-2 px-2 text-right">Return %</th>
              <th className="py-2 px-2 text-right">Return $</th>
              <th className="py-2 px-2 text-left">Reason</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((t, i) => (
              <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                <td className="py-2 px-2">
                  <Badge label={t.side} color={t.side === 'LONG' ? '#10B981' : '#EF4444'} small />
                </td>
                <td className="py-2 px-2 text-slate-400 font-mono">{t.entryDate?.slice(0, 10)}</td>
                <td className="py-2 px-2 text-slate-400 font-mono">{t.exitDate?.slice(0, 10)}</td>
                <td className="py-2 px-2 text-right font-mono text-white">${t.entry?.toFixed(2)}</td>
                <td className="py-2 px-2 text-right font-mono text-white">${t.exit?.toFixed(2)}</td>
                <td className={`py-2 px-2 text-right font-mono font-semibold ${pctColor(t.returnPercent ?? 0)}`}>
                  {fmtPct(t.returnPercent ?? 0)}
                </td>
                <td className={`py-2 px-2 text-right font-mono ${pctColor(t.return ?? 0)}`}>
                  ${(t.return ?? 0).toFixed(2)}
                </td>
                <td className="py-2 px-2 text-slate-500">{t.exitReason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-2 py-1 text-[10px] rounded border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-30">
            ← Prev
          </button>
          <span className="text-[10px] text-slate-500">{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-2 py-1 text-[10px] rounded border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-30">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
