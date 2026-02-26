'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUserTier, type UserTier } from '@/lib/useUserTier';

/* ── Types ─────────────────────────────────────────────────── */

interface CorrelationItem {
  symbol: string;
  name: string;
  coefficient: number;
  label: 'HIGH' | 'MEDIUM' | 'LOW' | 'INVERSE' | 'NONE';
  diverging: boolean;
  leadLag: string | null;
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

  const topCorrelations = data?.correlations.slice(0, maxResults) ?? [];
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
              return (
                <div
                  key={item.symbol}
                  className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
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
