'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useUserTier } from '@/lib/useUserTier';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';

/* ─── Types (mirror API response) ─── */
type AssetClass = 'crypto' | 'equity';
type ScalpTimeframe = '5min' | '15min';

interface ScalpSignalData {
  emaCross: 'bullish' | 'bearish' | 'neutral';
  emaDetail: string;
  rsi7: number | null;
  rsiSignal: string;
  vwapDev: number | null;
  vwapSignal: string;
  volSpike: boolean;
  volRatio: number;
  bbSqueeze: boolean;
  bbBreakout: 'upper' | 'lower' | null;
  bbWidth: number | null;
  macdHist: number | null;
  macdSignal: string;
  atr: number | null;
}

interface ScalpResult {
  symbol: string;
  assetClass: AssetClass;
  timeframe: ScalpTimeframe;
  price: number;
  direction: 'long' | 'short' | 'neutral';
  strength: number;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  riskReward: number;
  signals: ScalpSignalData;
  barCount: number;
  lastBar: string;
}

/* ─── Default Watchlists ─── */
const CRYPTO_DEFAULTS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'MATIC', 'DOT'];
const EQUITY_DEFAULTS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AMD', 'SPY', 'QQQ'];

/* ─── Helpers ─── */
function dirColor(d: string) {
  if (d === 'long' || d === 'bullish') return '#10B981';
  if (d === 'short' || d === 'bearish') return '#EF4444';
  return '#94A3B8';
}
function fmtP(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1) return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(4)}`;
}
function signalDot(signal: string) {
  if (signal === 'bullish' || signal === 'above' || signal === 'long') return '🟢';
  if (signal === 'bearish' || signal === 'below' || signal === 'short' || signal === 'overbought') return '🔴';
  if (signal === 'oversold') return '🟡';
  return '⚪';
}

/* ─── Component ─── */
export default function ScalperPage() {
  const { tier, isLoading: tierLoading, isLoggedIn } = useUserTier();
  const canAccess = tier === 'pro_trader';

  const [assetClass, setAssetClass] = useState<AssetClass>('crypto');
  const [timeframe, setTimeframe] = useState<ScalpTimeframe>('5min');
  const [customSymbols, setCustomSymbols] = useState('');
  const [results, setResults] = useState<ScalpResult[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── Scan ─── */
  const runScan = useCallback(async () => {
    setLoading(true);
    setErrors([]);
    try {
      const symbols = customSymbols.trim()
        ? customSymbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 10)
        : undefined;

      const res = await fetch('/api/scalper/run', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, timeframe, assetClass }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Scan failed' }));
        setErrors([err.error || 'Scan failed']);
        return;
      }

      const data = await res.json();
      setResults(data.results || []);
      if (data.errors?.length) setErrors(data.errors);
      setLastScan(new Date().toLocaleTimeString());
    } catch {
      setErrors(['Network error — please try again']);
    } finally {
      setLoading(false);
    }
  }, [customSymbols, timeframe, assetClass]);

  /* ─── Auto-refresh ─── */
  useEffect(() => {
    if (autoRefresh && canAccess) {
      intervalRef.current = setInterval(runScan, 60_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, canAccess, runScan]);

  /* ─── Tier gate ─── */
  if (tierLoading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="text-slate-400 animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6">
        <div className="text-center bg-[#1E293B] border border-slate-700/50 rounded-xl p-8 max-w-md">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="text-xl font-bold text-white mb-2">Sign In Required</h2>
          <p className="text-slate-400 text-sm mb-4">Please sign in to access the Scalping Scanner.</p>
          <a href="/auth/login" className="inline-block px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors">Sign In →</a>
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6">
        <div className="text-center bg-[#1E293B] border border-slate-700/50 rounded-xl p-8 max-w-md">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="text-xl font-bold text-white mb-2">Scalping Scanner</h2>
          <p className="text-slate-400 text-sm mb-4">This tool requires the <strong className="text-amber-400">Pro Trader</strong> plan.</p>
          <a href="/pricing" className="inline-block px-5 py-2 rounded-lg text-sm font-semibold transition-colors" style={{ backgroundColor: '#F59E0B22', color: '#F59E0B', border: '1px solid #F59E0B44' }}>Upgrade to Pro Trader →</a>
        </div>
      </div>
    );
  }

  const selected = results.find((r) => r.symbol === selectedRow);

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      {/* ─── Header ─── */}
      <div className="border-b border-slate-800 bg-[#0F172A]/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold text-emerald-400 mr-4">⚡ Scalping Scanner</h1>

          {/* Asset class toggle */}
          <div className="flex bg-[#1E293B] rounded-lg p-0.5 border border-slate-700/50">
            {(['crypto', 'equity'] as const).map((ac) => (
              <button
                key={ac}
                onClick={() => { setAssetClass(ac); setResults([]); setSelectedRow(null); }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${assetClass === ac ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {ac === 'crypto' ? '₿ Crypto' : '📈 Equities'}
              </button>
            ))}
          </div>

          {/* Timeframe toggle */}
          <div className="flex bg-[#1E293B] rounded-lg p-0.5 border border-slate-700/50">
            {(['5min', '15min'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => { setTimeframe(tf); setResults([]); setSelectedRow(null); }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${timeframe === tf ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Custom symbols */}
          <input
            type="text"
            value={customSymbols}
            onChange={(e) => setCustomSymbols(e.target.value)}
            placeholder={assetClass === 'crypto' ? 'BTC,ETH,SOL… (max 10)' : 'AAPL,NVDA,TSLA… (max 10)'}
            className="bg-[#1E293B] border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 w-52 focus:outline-none focus:border-emerald-500/50"
          />

          {/* Scan button */}
          <button
            onClick={runScan}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Scanning…' : '🔍 Scan Now'}
          </button>

          {/* Auto-refresh */}
          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-emerald-500"
            />
            Auto (60s)
          </label>

          {lastScan && (
            <span className="text-xs text-slate-500 ml-auto">Last: {lastScan}</span>
          )}
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 py-4">
        {/* ─── Errors ─── */}
        {errors.length > 0 && (
          <div className="mb-3 bg-red-900/20 border border-red-700/40 rounded-lg px-4 py-2 text-sm text-red-300">
            {errors.length === 1
              ? errors[0]
              : `Failed to fetch: ${errors.join(', ')}`}
          </div>
        )}

        {/* ─── Empty state ─── */}
        {results.length === 0 && !loading && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">⚡</div>
            <h2 className="text-xl font-bold text-white mb-2">Intraday Scalping Scanner</h2>
            <p className="text-slate-400 text-sm mb-1">Scan {assetClass === 'crypto' ? 'crypto' : 'equity'} markets on {timeframe} timeframe</p>
            <p className="text-slate-500 text-xs mb-6">
              Default watchlist: {(assetClass === 'crypto' ? CRYPTO_DEFAULTS : EQUITY_DEFAULTS).join(', ')}
            </p>
            <div className="flex flex-wrap justify-center gap-3 text-xs text-slate-500">
              <span className="bg-[#1E293B] px-3 py-1 rounded-full border border-slate-700/30">EMA 5/13/21</span>
              <span className="bg-[#1E293B] px-3 py-1 rounded-full border border-slate-700/30">RSI(7)</span>
              <span className="bg-[#1E293B] px-3 py-1 rounded-full border border-slate-700/30">VWAP</span>
              <span className="bg-[#1E293B] px-3 py-1 rounded-full border border-slate-700/30">Volume Spike</span>
              <span className="bg-[#1E293B] px-3 py-1 rounded-full border border-slate-700/30">BB Squeeze</span>
              <span className="bg-[#1E293B] px-3 py-1 rounded-full border border-slate-700/30">MACD</span>
              <span className="bg-[#1E293B] px-3 py-1 rounded-full border border-slate-700/30">ATR Levels</span>
            </div>
          </div>
        )}

        {/* ─── Results Grid ─── */}
        {results.length > 0 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
              <strong>Educational intraday simulation only.</strong> Short-timeframe observations, bias labels, and reference levels are for learning and review. They are not live trading instructions, not financial advice, and no broker execution occurs.
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {/* Left: Signal Table */}
            <div className="xl:col-span-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/50 text-slate-400">
                    <th className="text-left py-2 px-2">Symbol</th>
                    <th className="text-left py-2 px-2">Direction</th>
                    <th className="text-right py-2 px-2">Strength</th>
                    <th className="text-right py-2 px-2">Price</th>
                    <th className="text-center py-2 px-2">EMA</th>
                    <th className="text-center py-2 px-2">RSI(7)</th>
                    <th className="text-center py-2 px-2">VWAP</th>
                    <th className="text-center py-2 px-2">Vol</th>
                    <th className="text-center py-2 px-2">BB</th>
                    <th className="text-center py-2 px-2">MACD</th>
                    <th className="text-right py-2 px-2">R:R</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const isSelected = selectedRow === r.symbol;
                    return (
                      <tr
                        key={r.symbol}
                        onClick={() => setSelectedRow(isSelected ? null : r.symbol)}
                        className={`border-b border-slate-800/50 cursor-pointer transition-colors ${isSelected ? 'bg-emerald-900/20' : 'hover:bg-slate-800/40'}`}
                      >
                        <td className="py-2.5 px-2 font-bold text-white">{r.symbol}</td>
                        <td className="py-2.5 px-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: dirColor(r.direction) + '22', color: dirColor(r.direction) }}>
                            {r.direction === 'long' ? '▲' : r.direction === 'short' ? '▼' : '—'} {r.direction.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <StrengthBar value={r.strength} />
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-300">{fmtP(r.price)}</td>
                        <td className="py-2.5 px-2 text-center">{signalDot(r.signals.emaCross)}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span style={{ color: dirColor(r.signals.rsiSignal) }}>{r.signals.rsi7?.toFixed(0) ?? '—'}</span>
                        </td>
                        <td className="py-2.5 px-2 text-center">{signalDot(r.signals.vwapSignal)}</td>
                        <td className="py-2.5 px-2 text-center">
                          {r.signals.volSpike ? <span title={`${r.signals.volRatio}x avg`}>🔥</span> : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          {r.signals.bbSqueeze ? '🔶' : r.signals.bbBreakout ? (r.signals.bbBreakout === 'upper' ? '🟢' : '🔴') : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="py-2.5 px-2 text-center">{signalDot(r.signals.macdSignal)}</td>
                        <td className="py-2.5 px-2 text-right font-mono" style={{ color: r.riskReward >= 1.5 ? '#10B981' : r.riskReward >= 1 ? '#F59E0B' : '#94A3B8' }}>
                          {r.riskReward > 0 ? `${r.riskReward}:1` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Right: Detail Panel */}
            <div className="xl:col-span-1">
              {selected ? (
                <DetailPanel result={selected} />
              ) : (
                <div className="bg-[#1E293B] border border-slate-700/30 rounded-xl p-6 text-center">
                  <p className="text-slate-500 text-sm">Click a row to view observation detail</p>
                </div>
              )}
            </div>
            </div>
          </div>
        )}

        <div className="mt-8">
          <ComplianceDisclaimer />
        </div>
      </div>
    </div>
  );
}

/* ═══════════ Sub-Components ═══════════ */

function StrengthBar({ value }: { value: number }) {
  const color = value >= 60 ? '#10B981' : value >= 30 ? '#F59E0B' : '#EF4444';
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <span className="text-[10px] font-bold" style={{ color }}>{value}</span>
      <div className="w-14 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function DetailPanel({ result: r }: { result: ScalpResult }) {
  const s = r.signals;
  return (
    <div className="bg-[#1E293B] border border-slate-700/30 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/30 flex items-center justify-between">
        <div>
          <span className="font-bold text-white text-lg mr-2">{r.symbol}</span>
          <span className="text-xs text-slate-400">{r.timeframe} · {r.assetClass}</span>
        </div>
        <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: dirColor(r.direction) + '22', color: dirColor(r.direction) }}>
          {r.direction === 'long' ? '▲ LONG' : r.direction === 'short' ? '▼ SHORT' : '— NEUTRAL'}
        </span>
      </div>

      {/* Reference Levels */}
      <div className="px-4 py-3 border-b border-slate-700/30">
        <div className="text-[10px] text-slate-500 mb-2 font-semibold uppercase tracking-wider">Reference Levels (Educational)</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[#0F172A] rounded-lg px-3 py-2">
            <div className="text-slate-500 text-[10px]">Reference</div>
            <div className="text-white font-mono font-bold">{fmtP(r.entry)}</div>
          </div>
          <div className="bg-[#0F172A] rounded-lg px-3 py-2">
            <div className="text-red-400 text-[10px]">Invalidation</div>
            <div className="text-red-400 font-mono font-bold">{fmtP(r.stop)}</div>
          </div>
          <div className="bg-[#0F172A] rounded-lg px-3 py-2">
            <div className="text-emerald-400 text-[10px]">Reaction Zone 1</div>
            <div className="text-emerald-400 font-mono font-bold">{fmtP(r.target1)}</div>
          </div>
          <div className="bg-[#0F172A] rounded-lg px-3 py-2">
            <div className="text-emerald-300 text-[10px]">Reaction Zone 2</div>
            <div className="text-emerald-300 font-mono font-bold">{fmtP(r.target2)}</div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px]">
          <span className="text-slate-500">Scenario Ratio</span>
          <span className="font-bold" style={{ color: r.riskReward >= 1.5 ? '#10B981' : '#F59E0B' }}>{r.riskReward > 0 ? `${r.riskReward}:1` : '—'}</span>
        </div>
      </div>

      {/* Signal Breakdown */}
      <div className="px-4 py-3">
        <div className="text-[10px] text-slate-500 mb-2 font-semibold uppercase tracking-wider">Signal Breakdown</div>
        <div className="space-y-2 text-xs">
          <SignalRow icon={signalDot(s.emaCross)} label="EMA Crossover" value={s.emaDetail} color={dirColor(s.emaCross)} />
          <SignalRow icon={signalDot(s.rsiSignal)} label="RSI(7)" value={s.rsi7 != null ? `${s.rsi7.toFixed(1)} — ${s.rsiSignal}` : '—'} color={dirColor(s.rsiSignal)} />
          <SignalRow icon={signalDot(s.vwapSignal)} label="VWAP" value={s.vwapDev != null ? `${s.vwapDev > 0 ? '+' : ''}${s.vwapDev.toFixed(2)}% ${s.vwapSignal}` : '—'} color={dirColor(s.vwapSignal)} />
          <SignalRow icon={s.volSpike ? '🔥' : '⚪'} label="Volume" value={`${s.volRatio.toFixed(1)}x avg${s.volSpike ? ' — SPIKE' : ''}`} color={s.volSpike ? '#F59E0B' : '#94A3B8'} />
          <SignalRow icon={s.bbSqueeze ? '🔶' : s.bbBreakout ? '💥' : '⚪'} label="Bollinger" value={s.bbSqueeze ? `SQUEEZE (width: ${s.bbWidth?.toFixed(1)}%)` : s.bbBreakout ? `Breakout ${s.bbBreakout}` : s.bbWidth != null ? `Width: ${s.bbWidth.toFixed(1)}%` : '—'} color={s.bbSqueeze ? '#F59E0B' : s.bbBreakout === 'upper' ? '#10B981' : s.bbBreakout === 'lower' ? '#EF4444' : '#94A3B8'} />
          <SignalRow icon={signalDot(s.macdSignal)} label="MACD" value={s.macdHist != null ? `Hist: ${s.macdHist > 0 ? '+' : ''}${s.macdHist.toFixed(4)} — ${s.macdSignal}` : '—'} color={dirColor(s.macdSignal)} />
          <SignalRow icon="📏" label="ATR(14)" value={s.atr != null ? fmtP(s.atr) : '—'} color="#94A3B8" />
        </div>
      </div>

      {/* Meta */}
      <div className="px-4 py-2 border-t border-slate-700/30 flex items-center justify-between text-[10px] text-slate-500">
        <span>{r.barCount} bars</span>
        <span>Last: {r.lastBar}</span>
      </div>
    </div>
  );
}

function SignalRow({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">{icon}</span>
      <span className="text-slate-400 w-24 flex-shrink-0">{label}</span>
      <span className="font-mono truncate" style={{ color }}>{value}</span>
    </div>
  );
}
