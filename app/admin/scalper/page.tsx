'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
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
  if (d === 'long' || d === 'bullish') return 'var(--msp-bull)';
  if (d === 'short' || d === 'bearish') return 'var(--msp-bear)';
  return 'var(--msp-flat)';
}
function fmtP(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1) return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(4)}`;
}
function signalCode(signal: string) {
  if (signal === 'bullish' || signal === 'above' || signal === 'long') return 'BULL';
  if (signal === 'bearish' || signal === 'below' || signal === 'short' || signal === 'overbought') return 'BEAR';
  if (signal === 'oversold') return 'OS';
  return 'NEUT';
}

/* ─── Component (no tier gate — admin layout handles auth) ─── */
export default function AdminScalperPage() {
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
    if (autoRefresh) {
      intervalRef.current = setInterval(runScan, 60_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, runScan]);

  const selected = results.find((r) => r.symbol === selectedRow);

  return (
    <div className="text-white">
      {/* ─── Header ─── */}
      <div className="border-b border-slate-800 bg-[#0F172A]/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold text-emerald-400 mr-4">Scalping Scanner</h1>

          {/* Asset class toggle */}
          <div className="flex bg-[#1E293B] rounded-lg p-0.5 border border-slate-700/50">
            {(['crypto', 'equity'] as const).map((ac) => (
              <button
                key={ac}
                onClick={() => { setAssetClass(ac); setResults([]); setSelectedRow(null); }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${assetClass === ac ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {ac === 'crypto' ? 'Crypto' : 'Equities'}
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
            {loading ? 'Scanning…' : 'Scan Now'}
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
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-xs font-black text-slate-400">SCLP</div>
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
                        <td className="py-2.5 px-2 text-center">{signalCode(r.signals.emaCross)}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span style={{ color: dirColor(r.signals.rsiSignal) }}>{r.signals.rsi7?.toFixed(0) ?? '—'}</span>
                        </td>
                        <td className="py-2.5 px-2 text-center">{signalCode(r.signals.vwapSignal)}</td>
                        <td className="py-2.5 px-2 text-center">
                          {r.signals.volSpike ? <span title={`${r.signals.volRatio}x avg`}>SPIKE</span> : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          {r.signals.bbSqueeze ? 'SQZ' : r.signals.bbBreakout ? (r.signals.bbBreakout === 'upper' ? 'UP' : 'DOWN') : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="py-2.5 px-2 text-center">{signalCode(r.signals.macdSignal)}</td>
                        <td className="py-2.5 px-2 text-right font-mono" style={{ color: r.riskReward >= 1.5 ? 'var(--msp-bull)' : r.riskReward >= 1 ? 'var(--msp-warn)' : 'var(--msp-flat)' }}>
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
                  <p className="text-slate-500 text-sm">Click a row to view signal detail</p>
                </div>
              )}
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
  const color = value >= 60 ? 'var(--msp-bull)' : value >= 30 ? 'var(--msp-warn)' : 'var(--msp-bear)';
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <span className="text-[10px] font-bold" style={{ color }}>{value}</span>
      <div className="w-14 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function PriceLadder({ result: r }: { result: ScalpResult }) {
  const isLong = r.direction === 'long';
  const levels = [
    { label: 'T2', price: r.target2, color: '#6EE7B7' },
    { label: 'T1', price: r.target1, color: 'var(--msp-bull)' },
    { label: 'Entry', price: r.entry, color: '#FFFFFF' },
    { label: 'Stop', price: r.stop, color: 'var(--msp-bear)' },
  ].filter((l) => l.price > 0 && Number.isFinite(l.price));

  if (levels.length < 2) return null;

  const prices = levels.map((l) => l.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;
  const pad = range * 0.18;
  const lo = minP - pad;
  const hi = maxP + pad;
  const svgH = 180;
  const svgW = 240;
  const axisX = 48;
  const labelX = axisX + 10;

  function toY(price: number) {
    return ((hi - price) / (hi - lo)) * svgH;
  }

  const pctFromEntry = (price: number) => {
    if (!r.entry || !Number.isFinite(r.entry)) return '';
    const pct = ((price - r.entry) / r.entry) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
  };

  return (
    <div style={{ padding: "0.75rem 1rem 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: "0.625rem", color: "rgba(148,163,184,0.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>
        Price Ladder {isLong ? '(Long)' : r.direction === 'short' ? '(Short)' : ''}
      </div>
      <svg width={svgW} height={svgH} style={{ overflow: "visible", display: "block", margin: "0 auto" }}>
        {/* Axis line */}
        <line x1={axisX} y1={0} x2={axisX} y2={svgH} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />

        {/* Zones: fill between entry and targets (upside), entry and stop (downside) */}
        {r.entry > 0 && r.target1 > 0 && (
          <rect
            x={axisX - 8} y={Math.min(toY(r.entry), toY(r.target2 > 0 ? r.target2 : r.target1))}
            width={16} height={Math.abs(toY(r.entry) - toY(r.target2 > 0 ? r.target2 : r.target1))}
            fill="rgba(16,185,129,0.12)" rx={2}
          />
        )}
        {r.entry > 0 && r.stop > 0 && (
          <rect
            x={axisX - 8} y={Math.min(toY(r.entry), toY(r.stop))}
            width={16} height={Math.abs(toY(r.entry) - toY(r.stop))}
            fill="rgba(239,68,68,0.10)" rx={2}
          />
        )}

        {/* Level ticks + labels */}
        {levels.map((lv) => {
          const y = toY(lv.price);
          const pct = pctFromEntry(lv.price);
          const isEntry = lv.label === 'Entry';
          return (
            <g key={lv.label}>
              {/* Dashed horizontal guide */}
              <line x1={axisX - 14} y1={y} x2={svgW - 4} y2={y}
                stroke={lv.color} strokeWidth={isEntry ? 1.5 : 1}
                strokeDasharray={isEntry ? "none" : "3 3"} opacity={isEntry ? 0.9 : 0.55} />
              {/* Dot on axis */}
              <circle cx={axisX} cy={y} r={isEntry ? 4 : 3} fill={lv.color} opacity={isEntry ? 1 : 0.85} />
              {/* Label (left of axis) */}
              <text x={axisX - 18} y={y + 4} textAnchor="end" fontSize={9} fontWeight={isEntry ? 700 : 600} fill={lv.color} opacity={0.9}>
                {lv.label}
              </text>
              {/* Price (right of axis) */}
              <text x={labelX} y={y - 5} fontSize={9} fontFamily="monospace" fill={lv.color} opacity={0.85}>
                {fmtP(lv.price)}
              </text>
              {/* % from entry */}
              {!isEntry && (
                <text x={labelX} y={y + 9} fontSize={8} fontFamily="monospace" fill={lv.color} opacity={0.55}>
                  {pct}
                </text>
              )}
            </g>
          );
        })}
      </svg>
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
          {r.direction === 'long' ? 'LONG' : r.direction === 'short' ? 'SHORT' : 'NEUTRAL'}
        </span>
      </div>

      {/* Price Ladder */}
      <PriceLadder result={r} />

      {/* Execution Levels */}
      <div className="px-4 py-3 border-b border-slate-700/30">
        <div className="text-[10px] text-slate-500 mb-2 font-semibold uppercase tracking-wider">Execution Levels</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[#0F172A] rounded-lg px-3 py-2">
            <div className="text-slate-500 text-[10px]">Entry</div>
            <div className="text-white font-mono font-bold">{fmtP(r.entry)}</div>
          </div>
          <div className="bg-[#0F172A] rounded-lg px-3 py-2">
            <div className="text-red-400 text-[10px]">Stop Loss</div>
            <div className="text-red-400 font-mono font-bold">{fmtP(r.stop)}</div>
          </div>
          <div className="bg-[#0F172A] rounded-lg px-3 py-2">
            <div className="text-emerald-400 text-[10px]">Target 1</div>
            <div className="text-emerald-400 font-mono font-bold">{fmtP(r.target1)}</div>
          </div>
          <div className="bg-[#0F172A] rounded-lg px-3 py-2">
            <div className="text-emerald-300 text-[10px]">Target 2</div>
            <div className="text-emerald-300 font-mono font-bold">{fmtP(r.target2)}</div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px]">
          <span className="text-slate-500">Risk:Reward</span>
          <span className="font-bold" style={{ color: r.riskReward >= 1.5 ? 'var(--msp-bull)' : 'var(--msp-warn)' }}>{r.riskReward > 0 ? `${r.riskReward}:1` : '—'}</span>
        </div>
      </div>

      {/* Signal Breakdown */}
      <div className="px-4 py-3">
        <div className="text-[10px] text-slate-500 mb-2 font-semibold uppercase tracking-wider">Signal Breakdown</div>
        <div className="space-y-2 text-xs">
          <SignalRow code={signalCode(s.emaCross)} label="EMA Crossover" value={s.emaDetail} color={dirColor(s.emaCross)} />
          <SignalRow code={signalCode(s.rsiSignal)} label="RSI(7)" value={s.rsi7 != null ? `${s.rsi7.toFixed(1)} — ${s.rsiSignal}` : '—'} color={dirColor(s.rsiSignal)} />
          <SignalRow code={signalCode(s.vwapSignal)} label="VWAP" value={s.vwapDev != null ? `${s.vwapDev > 0 ? '+' : ''}${s.vwapDev.toFixed(2)}% ${s.vwapSignal}` : '—'} color={dirColor(s.vwapSignal)} />
          <SignalRow code={s.volSpike ? 'VOL' : 'NEUT'} label="Volume" value={`${s.volRatio.toFixed(1)}x avg${s.volSpike ? ' — SPIKE' : ''}`} color={s.volSpike ? 'var(--msp-warn)' : 'var(--msp-flat)'} />
          <SignalRow code={s.bbSqueeze ? 'SQZ' : s.bbBreakout ? 'BRK' : 'NEUT'} label="Bollinger" value={s.bbSqueeze ? `SQUEEZE (width: ${s.bbWidth?.toFixed(1)}%)` : s.bbBreakout ? `Breakout ${s.bbBreakout}` : s.bbWidth != null ? `Width: ${s.bbWidth.toFixed(1)}%` : '—'} color={s.bbSqueeze ? 'var(--msp-warn)' : s.bbBreakout === 'upper' ? 'var(--msp-bull)' : s.bbBreakout === 'lower' ? 'var(--msp-bear)' : 'var(--msp-flat)'} />
          <SignalRow code={signalCode(s.macdSignal)} label="MACD" value={s.macdHist != null ? `Hist: ${s.macdHist > 0 ? '+' : ''}${s.macdHist.toFixed(4)} — ${s.macdSignal}` : '—'} color={dirColor(s.macdSignal)} />
          <SignalRow code="ATR" label="ATR(14)" value={s.atr != null ? fmtP(s.atr) : '—'} color="#94A3B8" />
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

function SignalRow({ code, label, value, color }: { code: string; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 text-[10px] font-black uppercase text-slate-500">{code}</span>
      <span className="text-slate-400 w-24 flex-shrink-0">{label}</span>
      <span className="font-mono truncate" style={{ color }}>{value}</span>
    </div>
  );
}
