'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUserTier, type UserTier } from '@/lib/useUserTier';

/* ── Types ─────────────────────────────────────────────────── */

interface ChartPoint { date: string; target: number; compare: number }

interface CorrelationItem {
  symbol: string;
  name: string;
  coefficient: number;
  label: 'HIGH' | 'MEDIUM' | 'LOW' | 'INVERSE' | 'NONE';
  diverging: boolean;
  leadLag: string | null;
  chart: ChartPoint[];
}

interface CorrelationData {
  success: boolean;
  symbol: string;
  window: number;
  type: string;
  correlations: CorrelationItem[];
  divergenceBadge: boolean;
  regime: 'stable' | 'breaking' | 'inverting';
  cachedAt: number;
  error?: string;
}

interface Props {
  symbol: string;
  type?: 'crypto' | 'equity' | 'forex';
  className?: string;
  maxResults?: number;
}

/* ── Badge colors ─────────────────────────────────────────── */

const LABEL_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  HIGH:    { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-400/30' },
  MEDIUM:  { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-400/30' },
  LOW:     { bg: 'bg-zinc-500/15',    text: 'text-zinc-400',    border: 'border-zinc-400/30' },
  INVERSE: { bg: 'bg-rose-500/15',    text: 'text-rose-400',    border: 'border-rose-400/30' },
  NONE:    { bg: 'bg-zinc-800/40',    text: 'text-zinc-500',    border: 'border-zinc-600/30' },
};

const REGIME_BADGE: Record<string, { label: string; color: string }> = {
  stable:    { label: 'Correlation Stable',    color: 'text-emerald-400' },
  breaking:  { label: 'Divergence Detected',   color: 'text-amber-400' },
  inverting: { label: 'Correlation Inverting',  color: 'text-rose-400' },
};

const WINDOW_OPTIONS = [7, 30, 90] as const;

/* ── SVG Chart helper ────────────────────────────────────── */

function CorrelationChart({ chart, targetSymbol, compareSymbol }: {
  chart: ChartPoint[];
  targetSymbol: string;
  compareSymbol: string;
}) {
  if (!chart.length) {
    return <div className="py-3 text-center text-[10px] text-zinc-600">No chart data available</div>;
  }

  const W = 440;
  const H = 140;
  const PAD = { top: 16, right: 12, bottom: 28, left: 42 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const allVals = chart.flatMap(p => [p.target, p.compare]);
  const minY = Math.min(...allVals);
  const maxY = Math.max(...allVals);
  const rangeY = maxY - minY || 1;

  const xScale = (i: number) => PAD.left + (i / (chart.length - 1)) * plotW;
  const yScale = (v: number) => PAD.top + plotH - ((v - minY) / rangeY) * plotH;

  const buildPath = (accessor: (p: ChartPoint) => number) =>
    chart
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(accessor(p)).toFixed(1)}`)
      .join(' ');

  const targetPath = buildPath(p => p.target);
  const comparePath = buildPath(p => p.compare);

  // Y-axis ticks (5 ticks)
  const yTicks: number[] = [];
  for (let i = 0; i <= 4; i++) yTicks.push(minY + (rangeY * i) / 4);

  // X-axis date labels (show first, middle, last)
  const dateLabels = [
    { i: 0, label: chart[0].date.slice(5) },
    { i: Math.floor(chart.length / 2), label: chart[Math.floor(chart.length / 2)].date.slice(5) },
    { i: chart.length - 1, label: chart[chart.length - 1].date.slice(5) },
  ];

  // Zero line
  const zeroY = yScale(0);
  const showZero = minY < 0 && maxY > 0;

  return (
    <div className="mt-2 mb-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 160 }}>
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <line
            key={i}
            x1={PAD.left} y1={yScale(t)} x2={W - PAD.right} y2={yScale(t)}
            stroke="rgba(255,255,255,0.04)" strokeWidth={1}
          />
        ))}

        {/* Zero line */}
        {showZero && (
          <line
            x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY}
            stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="3,3"
          />
        )}

        {/* Target line (emerald) */}
        <path d={targetPath} fill="none" stroke="#34d399" strokeWidth={1.8} strokeLinejoin="round" />

        {/* Compare line (amber) */}
        <path d={comparePath} fill="none" stroke="#fbbf24" strokeWidth={1.8} strokeLinejoin="round" />

        {/* Y-axis labels */}
        {yTicks.map((t, i) => (
          <text
            key={i}
            x={PAD.left - 4}
            y={yScale(t) + 3}
            textAnchor="end"
            fill="rgba(255,255,255,0.3)"
            fontSize={9}
            fontFamily="monospace"
          >
            {t >= 0 ? '+' : ''}{t.toFixed(1)}%
          </text>
        ))}

        {/* X-axis date labels */}
        {dateLabels.map(({ i, label }) => (
          <text
            key={i}
            x={xScale(i)}
            y={H - 4}
            textAnchor="middle"
            fill="rgba(255,255,255,0.25)"
            fontSize={9}
            fontFamily="monospace"
          >
            {label}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-1">
        <div className="flex items-center gap-1">
          <div className="h-[2px] w-3 rounded bg-emerald-400" />
          <span className="text-[9px] text-emerald-400/70">{targetSymbol}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-[2px] w-3 rounded bg-amber-400" />
          <span className="text-[9px] text-amber-400/70">{compareSymbol}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Component ────────────────────────────────────────────── */

export default function CorrelationConfluenceCard({ symbol, type, className = '', maxResults = 5 }: Props) {
  const { tier } = useUserTier();
  const isInstitutional = tier === 'pro_trader';

  const [window, setWindow] = useState<number>(30);
  const [data, setData] = useState<CorrelationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [customSymbols, setCustomSymbols] = useState<string[]>([]);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchCorrelation = useCallback(async () => {
    if (!symbol) return;

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        symbol,
        window: String(window),
      });
      if (type) params.set('type', type);
      if (customSymbols.length) params.set('compare', customSymbols.join(','));

      const res = await fetch(`/api/correlation?${params}`, {
        signal: controller.signal,
      });
      const json: CorrelationData = await res.json();

      if (!controller.signal.aborted) {
        if (json.success) {
          setData(json);
          setError(null);
        } else {
          setError(json.error || 'Failed to load correlations');
          setData(null);
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError('Failed to fetch correlation data');
        setData(null);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [symbol, window, type, customSymbols]);

  // Fetch on symbol / window / customSymbols change
  useEffect(() => {
    fetchCorrelation();
    return () => abortRef.current?.abort();
  }, [fetchCorrelation]);

  // Add custom symbol
  const addCustomSymbol = () => {
    const sym = customInput.toUpperCase().trim();
    if (!sym || customSymbols.includes(sym) || sym === symbol.toUpperCase()) return;
    setCustomSymbols(prev => [...prev, sym]);
    setCustomInput('');
  };

  const removeCustomSymbol = (sym: string) => {
    setCustomSymbols(prev => prev.filter(s => s !== sym));
  };

  // Always show custom symbols in results, even if they're not in the top N
  const topCorrelations = (() => {
    if (!data?.correlations.length) return [];
    const customUpper = new Set(customSymbols.map(s => s.toUpperCase()));
    const autoResults = data.correlations.filter(c => !customUpper.has(c.symbol.toUpperCase()));
    const customResults = data.correlations.filter(c => customUpper.has(c.symbol.toUpperCase()));
    // Top N from auto-universe + ALL custom symbols (always visible)
    return [...autoResults.slice(0, maxResults), ...customResults];
  })();
  const regime = data ? REGIME_BADGE[data.regime] : null;

  return (
    <div className={`rounded-lg border border-white/10 bg-[#0c1425] ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <h3 className="text-sm font-semibold text-white">Correlation Confluence</h3>
          <span className="text-[10px] text-zinc-500">({window}D)</span>
        </div>

        {/* Window toggle */}
        <div className="flex gap-1">
          {WINDOW_OPTIONS.map(w => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                window === w
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/30'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
              }`}
            >
              {w}D
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {/* Regime badge */}
        {regime && data && !loading && (
          <div className="mb-3 flex items-center gap-2">
            <span className={`text-[11px] font-medium ${regime.color}`}>{regime.label}</span>
            {data.divergenceBadge && (
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                ⚡ Divergence
              </span>
            )}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center gap-2 py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
            <span className="text-xs text-zinc-500">Computing correlations…</span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="py-3 text-center text-xs text-rose-400">{error}</div>
        )}

        {/* Results */}
        {!loading && !error && topCorrelations.length > 0 && (
          <div className="space-y-1.5">
            {topCorrelations.map((item) => {
              const style = LABEL_STYLES[item.label] || LABEL_STYLES.NONE;
              const isExpanded = expandedSymbol === item.symbol;
              const hasChart = item.chart && item.chart.length > 1;
              return (
                <div key={item.symbol}>
                  <div
                    onClick={() => hasChart && setExpandedSymbol(isExpanded ? null : item.symbol)}
                    className={`flex items-center justify-between rounded border px-3 py-2 transition-colors ${
                      isExpanded
                        ? 'border-emerald-400/20 bg-emerald-500/[0.04]'
                        : 'border-white/5 bg-white/[0.02]'
                    } ${hasChart ? 'cursor-pointer hover:border-white/10' : ''}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {hasChart && (
                        <span className={`text-[10px] text-zinc-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                      )}
                      <span className="text-xs font-medium text-white truncate">{item.name}</span>
                      <span className="text-[10px] text-zinc-500">{item.symbol}</span>
                      {item.diverging && (
                        <span className="flex-shrink-0 rounded bg-amber-500/10 px-1 py-0.5 text-[9px] text-amber-400">
                          diverging
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Institutional: show numeric coefficient */}
                      {isInstitutional && (
                        <span className="text-[11px] font-mono text-zinc-400">
                          {item.coefficient.toFixed(2)}
                        </span>
                      )}

                      {/* Label badge */}
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${style.bg} ${style.text} ${style.border}`}
                      >
                        {item.label === 'HIGH' && 'Moves Together'}
                        {item.label === 'MEDIUM' && 'Moderate'}
                        {item.label === 'LOW' && 'Weak'}
                        {item.label === 'INVERSE' && 'Moves Opposite'}
                        {item.label === 'NONE' && 'No Data'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded chart */}
                  {isExpanded && hasChart && (
                    <div className="rounded-b border border-t-0 border-white/5 bg-[#0a1020] px-3 py-2">
                      <CorrelationChart
                        chart={item.chart}
                        targetSymbol={symbol.toUpperCase()}
                        compareSymbol={item.symbol}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Lead/lag hints (Pro Trader only) */}
            {isInstitutional && topCorrelations.some(c => c.leadLag) && (
              <div className="mt-2 space-y-1 border-t border-white/5 pt-2">
                {topCorrelations
                  .filter(c => c.leadLag)
                  .map(c => (
                    <div key={`lag-${c.symbol}`} className="text-[10px] text-zinc-500">
                      ↳ {c.leadLag} (±1 bar)
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && topCorrelations.length === 0 && data && (
          <div className="py-4 text-center text-xs text-zinc-500">
            No correlation data available
          </div>
        )}

        {/* Custom compare input */}
        <div className="mt-3 border-t border-white/5 pt-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addCustomSymbol(); }
              }}
              placeholder="Compare with…"
              className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder-zinc-500 outline-none focus:border-emerald-400/40"
            />
            <button
              onClick={addCustomSymbol}
              disabled={!customInput.trim()}
              className="rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
          </div>

          {/* Custom symbol chips */}
          {customSymbols.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {customSymbols.map(sym => (
                <span
                  key={sym}
                  className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-300"
                >
                  {sym}
                  <button
                    onClick={() => removeCustomSymbol(sym)}
                    className="text-zinc-500 hover:text-rose-400 ml-0.5"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Operator summary line */}
        {data && !loading && (
          <div className="mt-2 text-[10px] text-zinc-500">
            {data.type === 'crypto' ? '🔗 Crypto majors' : data.type === 'forex' ? '💱 Forex pairs' : '📊 Equity peers'}
            {customSymbols.length > 0 ? ` + ${customSymbols.length} custom` : ''}
            {' • '}
            Refreshed {new Date(data.cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}
