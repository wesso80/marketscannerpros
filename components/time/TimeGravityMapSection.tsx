'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { TimeGravityMap, GravityZone } from '@/lib/time/timeGravityMap';

/**
 * TimeGravityMapSection — self-contained component that fetches from
 * /api/time-gravity-map and renders inline. Designed to embed into
 * the TimeScannerPage or any Markets tab.
 */

interface TimeGravityMapSectionProps {
  symbol: string;
  currentPrice: number;
  className?: string;
}

export default function TimeGravityMapSection({
  symbol,
  currentPrice,
  className = '',
}: TimeGravityMapSectionProps) {
  const [tgm, setTgm] = useState<TimeGravityMap | null>(null);
  const [dataSource, setDataSource] = useState('');
  const [midpointCount, setMidpointCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    if (!symbol || !currentPrice || currentPrice <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/time-gravity-map?symbol=${encodeURIComponent(symbol)}&price=${currentPrice}&maxDistance=10`
      );
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      if (json.success && json.data) {
        setTgm(json.data as TimeGravityMap);
        setDataSource(json.dataSource || 'unknown');
        setMidpointCount(json.midpointCount || 0);
      } else {
        setError(json.error || 'No data returned');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Time Gravity Map');
    } finally {
      setLoading(false);
    }
  }, [symbol, currentPrice]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── helpers ── */
  const heatBg = (g: number, max: number) => {
    const p = max > 0 ? g / max : 0;
    if (p >= 0.75) return 'bg-red-500';
    if (p >= 0.50) return 'bg-orange-500';
    if (p >= 0.25) return 'bg-yellow-500';
    if (p >= 0.10) return 'bg-emerald-500';
    return 'bg-slate-700';
  };
  const heatText = (g: number, max: number) => {
    const p = max > 0 ? g / max : 0;
    if (p >= 0.75) return 'text-red-400';
    if (p >= 0.50) return 'text-orange-400';
    if (p >= 0.25) return 'text-yellow-400';
    return 'text-slate-500';
  };

  if (!currentPrice || currentPrice <= 0) return null;

  /* loading */
  if (loading && !tgm) {
    return (
      <section className={`w-full rounded-2xl border border-slate-800 bg-slate-900/30 p-3 lg:p-5 ${className}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-100">🎯 Time Gravity Map</span>
          <span className="text-xs text-slate-500 animate-pulse">Loading…</span>
        </div>
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-slate-800/40" />
      </section>
    );
  }

  /* error */
  if (error && !tgm) {
    return (
      <section className={`w-full rounded-2xl border border-slate-800 bg-slate-900/30 p-3 lg:p-5 ${className}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-100">🎯 Time Gravity Map</span>
          <button onClick={fetchData} className="text-xs text-cyan-400 hover:text-cyan-300">↻ Retry</button>
        </div>
        <div className="mt-3 rounded-lg border border-dashed border-slate-700 bg-slate-950/25 p-4 text-center text-xs text-slate-400">
          {error}
        </div>
      </section>
    );
  }

  if (!tgm) return null;

  /* ── derived values (from actual TimeGravityMap interface fields) ── */
  const debt = tgm.debtAnalysis;
  const points = tgm.allPoints || [];
  const pullAbove = points.filter(p => p.midpoint > currentPrice).reduce((s, p) => s + p.adjustedGravity, 0);
  const pullBelow = points.filter(p => p.midpoint <= currentPrice).reduce((s, p) => s + p.adjustedGravity, 0);
  const netPull = pullAbove - pullBelow;
  const gravityBias = netPull > 2 ? 'bullish' : netPull < -2 ? 'bearish' : 'neutral';
  const totalPts = midpointCount || points.length || 0;
  const maxH = Math.max(...tgm.heatmap, 1);
  const topZone = tgm.topZone;

  const badge =
    gravityBias === 'bullish'
      ? { t: 'BULLISH', c: 'text-emerald-400 bg-emerald-900/30 border-emerald-600/30' }
      : gravityBias === 'bearish'
      ? { t: 'BEARISH', c: 'text-rose-400 bg-rose-900/30 border-rose-600/30' }
      : { t: 'NEUTRAL', c: 'text-slate-400 bg-slate-800/30 border-slate-600/30' };

  return (
    <section className={`w-full rounded-2xl border border-slate-800 bg-slate-900/30 ${className}`}>
      {/* header — always visible */}
      <button onClick={() => setExpanded(!expanded)} className="w-full cursor-pointer px-3 py-3 lg:px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-100">🎯 Time Gravity Map</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.c}`}>{badge.t}</span>
            <span className="text-xs text-slate-500">{totalPts} midpoints • {tgm.zones.length} zones</span>
            {dataSource === 'demo' && (
              <span className="text-[9px] text-amber-500/60 border border-amber-600/30 rounded px-1.5 py-0.5">DEMO</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono">
              <span className="text-amber-400">▲ {pullAbove.toFixed(1)}</span>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-400">▼ {pullBelow.toFixed(1)}</span>
            </div>
            <span className="text-xs text-slate-500">{expanded ? '▴ collapse' : '▾ expand'}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-800 px-3 py-3 lg:px-5 lg:py-4 space-y-4">

          {/* gravity pull + target */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">GRAVITY PULL</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="text-lg font-bold text-amber-400">{pullAbove.toFixed(1)}</div>
                  <div className="text-[9px] text-slate-500">ABOVE</div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-bold ${netPull > 0 ? 'text-amber-400' : netPull < 0 ? 'text-cyan-400' : 'text-slate-400'}`}>
                    {netPull > 0 ? '+' : ''}{netPull.toFixed(1)}
                  </div>
                  <div className="text-[9px] text-slate-500">NET</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-cyan-400">{pullBelow.toFixed(1)}</div>
                  <div className="text-[9px] text-slate-500">BELOW</div>
                </div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden flex">
                <div className="h-full bg-amber-500 transition-all" style={{ width: `${(pullAbove / (pullAbove + pullBelow + 0.01)) * 100}%` }} />
                <div className="h-full flex-1 bg-cyan-500" />
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">TARGET</div>
              {topZone ? (
                <div className="space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-lg font-bold text-slate-100 font-mono">${topZone.centerPrice.toFixed(2)}</span>
                    <span className={`text-xs font-bold ${tgm.confidence >= 70 ? 'text-emerald-400' : tgm.confidence >= 40 ? 'text-yellow-400' : 'text-slate-500'}`}>
                      {tgm.confidence}% alignment
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">Range: ${topZone.minPrice.toFixed(2)} – ${topZone.maxPrice.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-400">
                    {topZone.dominantTimeframes.join(', ')} • Rank #{topZone.rank} • G={topZone.totalGravity.toFixed(0)}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-600">No significant target zone</div>
              )}
            </div>
          </div>

          {/* heatmap */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">PRICE GRAVITY HEATMAP</div>
              <div className="text-[10px] text-cyan-400 font-mono">
                ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="space-y-[2px] font-mono text-[10px]">
              {tgm.heatmapPrices.map((price, i) => {
                const g = tgm.heatmap[i];
                const isCur = Math.abs(price - currentPrice) < currentPrice * 0.002;
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className={`w-16 text-right ${isCur ? 'text-cyan-400 font-bold' : 'text-slate-500'}`}>
                      {price.toFixed(price < 1 ? 4 : 2)}
                    </span>
                    <div className="flex-1 h-2.5 bg-slate-900/50 rounded-sm overflow-hidden relative">
                      <div className={`h-full rounded-sm transition-all duration-300 ${heatBg(g, maxH)}`}
                        style={{ width: `${Math.min(100, maxH > 0 ? (g / maxH) * 100 : 0)}%` }} />
                      {isCur && <div className="absolute inset-y-0 left-0 w-px bg-cyan-400" />}
                    </div>
                    <span className={`w-8 text-right ${heatText(g, maxH)}`}>{g.toFixed(0)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* zones */}
          {tgm.zones.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">GRAVITY ZONES</div>
              <div className="space-y-1">
                {tgm.zones.slice(0, 6).map((zone, i) => (
                  <ZoneRow key={i} zone={zone} currentPrice={currentPrice} />
                ))}
              </div>
            </div>
          )}

          {/* debt */}
          {debt && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">MIDPOINT DEBT</div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><div className="text-lg font-bold text-red-400">{debt.unresolvedMidpoints?.length ?? 0}</div><div className="text-[9px] text-slate-500">UNRESOLVED</div></div>
                <div><div className="text-lg font-bold text-green-400">{debt.resolvedMidpoints?.length ?? 0}</div><div className="text-[9px] text-slate-500">RESOLVED</div></div>
                <div><div className="text-lg font-bold text-slate-300">{debt.clusters?.length ?? 0}</div><div className="text-[9px] text-slate-500">CLUSTERS</div></div>
              </div>
            </div>
          )}

          {tgm.alert && (
            <div className="rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-2 text-xs text-amber-300">{tgm.alert}</div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-[10px] text-slate-500 italic max-w-[70%]">{tgm.summary}</div>
            <button onClick={fetchData} disabled={loading}
              className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-[10px] font-medium text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-50">
              {loading ? '↻ Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ZoneRow({ zone, currentPrice }: { zone: GravityZone; currentPrice: number }) {
  const dist = ((zone.centerPrice - currentPrice) / currentPrice) * 100;
  const above = zone.centerPrice > currentPrice;
  return (
    <div className="flex items-center justify-between text-xs py-1 border-b border-slate-800/40 last:border-0">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${
          zone.confidence >= 80 ? 'bg-red-400' : zone.confidence >= 60 ? 'bg-orange-400' : zone.confidence >= 40 ? 'bg-yellow-400' : 'bg-slate-500'
        }`} />
        <span className="font-mono text-slate-300 w-20">${zone.centerPrice.toFixed(2)}</span>
        <span className={`text-[10px] ${above ? 'text-amber-400' : 'text-cyan-400'}`}>
          {above ? '▲' : '▼'} {Math.abs(dist).toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-slate-500 text-[10px]">{zone.dominantTimeframes.join(', ')}</span>
        <span className={`font-mono text-[10px] ${zone.confidence >= 80 ? 'text-red-400' : zone.confidence >= 60 ? 'text-orange-400' : 'text-slate-400'}`}>
          G={zone.totalGravity.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
