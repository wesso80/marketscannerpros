'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { computeTimeGravityMap, type TimeGravityMap, type GravityZone } from '@/lib/time/timeGravityMap';

/**
 * TimeGravityMapSection
 * 
 * Self-contained component that fetches midpoints from /api/midpoints
 * and renders the Time Gravity Map inline — designed to embed directly
 * into the Time Scanner page or any Markets tab.
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchAndCompute = useCallback(async () => {
    if (!symbol || !currentPrice || currentPrice <= 0) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/time-gravity-map?symbol=${encodeURIComponent(symbol)}&currentPrice=${currentPrice}`
      );

      if (!res.ok) throw new Error(`API ${res.status}`);

      const json = await res.json();

      if (json.tgm) {
        setTgm(json.tgm as TimeGravityMap);
      } else if (json.midpoints && json.midpoints.length > 0) {
        const result = computeTimeGravityMap(json.midpoints, currentPrice);
        setTgm(result);
      } else {
        setError('No midpoint data available. Run backfill first.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Time Gravity Map');
    } finally {
      setLoading(false);
    }
  }, [symbol, currentPrice]);

  useEffect(() => {
    fetchAndCompute();
  }, [fetchAndCompute]);

  // ── Helper: gravity intensity color ──
  const getGravityColor = (intensity: number) => {
    if (intensity >= 0.8) return 'text-red-400';
    if (intensity >= 0.6) return 'text-orange-400';
    if (intensity >= 0.4) return 'text-yellow-400';
    if (intensity >= 0.2) return 'text-emerald-400';
    return 'text-slate-500';
  };

  const getGravityBg = (intensity: number) => {
    if (intensity >= 0.8) return 'bg-red-500';
    if (intensity >= 0.6) return 'bg-orange-500';
    if (intensity >= 0.4) return 'bg-yellow-500';
    if (intensity >= 0.2) return 'bg-emerald-500';
    return 'bg-slate-700';
  };

  const getBiasBadge = (bias: string) => {
    if (bias === 'bullish') return { text: 'BULLISH', cls: 'text-emerald-400 bg-emerald-900/30 border-emerald-600/30' };
    if (bias === 'bearish') return { text: 'BEARISH', cls: 'text-rose-400 bg-rose-900/30 border-rose-600/30' };
    return { text: 'NEUTRAL', cls: 'text-slate-400 bg-slate-800/30 border-slate-600/30' };
  };

  // ── No data state ──
  if (!currentPrice || currentPrice <= 0) {
    return null; // Don't render until we have a price
  }

  // ── Loading state ──
  if (loading && !tgm) {
    return (
      <section className={`w-full rounded-2xl border border-slate-800 bg-slate-900/30 p-3 lg:p-5 ${className}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-100">🎯 Time Gravity Map</span>
          <span className="text-xs text-slate-500">Loading...</span>
        </div>
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-slate-800/40" />
      </section>
    );
  }

  // ── Error state ──
  if (error && !tgm) {
    return (
      <section className={`w-full rounded-2xl border border-slate-800 bg-slate-900/30 p-3 lg:p-5 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">🎯 Time Gravity Map</span>
            <span className="text-xs text-slate-500">Midpoint Debt Tracker</span>
          </div>
          <button
            onClick={fetchAndCompute}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            ↻ Retry
          </button>
        </div>
        <div className="mt-3 rounded-lg border border-dashed border-slate-700 bg-slate-950/25 p-4 text-center">
          <p className="text-xs text-slate-400">{error}</p>
          <p className="mt-1 text-[10px] text-slate-600">
            Run <code className="font-mono text-cyan-500/70">npm run migrate:midpoints</code> then{' '}
            <code className="font-mono text-cyan-500/70">npm run backfill:midpoints</code>
          </p>
        </div>
      </section>
    );
  }

  if (!tgm) return null;

  const bias = getBiasBadge(tgm.gravityBias);
  const maxHeatmap = Math.max(...tgm.heatmap, 1);

  return (
    <section className={`w-full rounded-2xl border border-slate-800 bg-slate-900/30 ${className}`}>
      {/* ── Header (always visible) ── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full cursor-pointer list-none px-3 py-3 lg:px-5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-100">🎯 Time Gravity Map</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${bias.cls}`}>
              {bias.text}
            </span>
            <span className="text-xs text-slate-500">
              {tgm.totalMidpoints} midpoints • {tgm.zones.length} zones
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Quick stats */}
            <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono">
              <span className="text-amber-400">▲ {tgm.pullAbove.toFixed(1)}</span>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-400">▼ {tgm.pullBelow.toFixed(1)}</span>
            </div>
            <span className="text-xs text-slate-500">{expanded ? '▴ collapse' : '▾ expand'}</span>
          </div>
        </div>
      </button>

      {/* ── Expanded content ── */}
      {expanded && (
        <div className="border-t border-slate-800 px-3 py-3 lg:px-5 lg:py-4 space-y-4">
          {/* ROW 1: Gravity Summary + Decompression Windows */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Gravity Pull Summary */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">GRAVITY PULL</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="text-lg font-bold text-amber-400">{tgm.pullAbove.toFixed(1)}</div>
                  <div className="text-[9px] text-slate-500">ABOVE</div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-bold ${tgm.netPull > 0 ? 'text-amber-400' : tgm.netPull < 0 ? 'text-cyan-400' : 'text-slate-400'}`}>
                    {tgm.netPull > 0 ? '+' : ''}{tgm.netPull.toFixed(1)}
                  </div>
                  <div className="text-[9px] text-slate-500">NET</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-cyan-400">{tgm.pullBelow.toFixed(1)}</div>
                  <div className="text-[9px] text-slate-500">BELOW</div>
                </div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden flex">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${(tgm.pullAbove / (tgm.pullAbove + tgm.pullBelow + 0.01)) * 100}%` }}
                />
                <div className="h-full flex-1 bg-cyan-500" />
              </div>
            </div>

            {/* Decompression Timing */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">DECOMPRESSION TIMING</div>
              {tgm.decompressionWindows && tgm.decompressionWindows.length > 0 ? (
                <div className="space-y-1.5">
                  {tgm.decompressionWindows.slice(0, 4).map((w, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-slate-300">{w.timeframe}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] ${w.isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {w.isActive ? '● ACTIVE' : `in ${w.minutesUntil}m`}
                        </span>
                        <span className="font-mono text-slate-400 text-[10px]">
                          W={w.weight.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-600">No active windows</div>
              )}
            </div>
          </div>

          {/* ROW 2: Price Heatmap */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">PRICE GRAVITY HEATMAP</div>
              <div className="text-[10px] text-cyan-400 font-mono">
                ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="space-y-[2px] font-mono text-[10px]">
              {tgm.heatmapPrices.map((price, i) => {
                const gravity = tgm.heatmap[i];
                const intensity = maxHeatmap > 0 ? gravity / maxHeatmap : 0;
                const isCurrent = Math.abs(price - currentPrice) < (currentPrice * 0.002);

                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className={`w-16 text-right ${isCurrent ? 'text-cyan-400 font-bold' : 'text-slate-500'}`}>
                      {price.toFixed(price < 1 ? 4 : 2)}
                    </span>
                    <div className="flex-1 h-2.5 bg-slate-900/50 rounded-sm overflow-hidden relative">
                      <div
                        className={`h-full rounded-sm transition-all duration-300 ${getGravityBg(intensity)}`}
                        style={{ width: `${Math.min(100, intensity * 100)}%` }}
                      />
                      {isCurrent && (
                        <div className="absolute inset-y-0 left-0 w-px bg-cyan-400" />
                      )}
                    </div>
                    <span className={`w-8 text-right ${getGravityColor(intensity)}`}>
                      {gravity.toFixed(0)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ROW 3: Gravity Zones */}
          {tgm.zones.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">GRAVITY ZONES</div>
              <div className="space-y-1">
                {tgm.zones.slice(0, 6).map((zone, i) => (
                  <GravityZoneRow key={i} zone={zone} currentPrice={currentPrice} />
                ))}
              </div>
            </div>
          )}

          {/* Refresh button */}
          <div className="flex justify-end">
            <button
              onClick={fetchAndCompute}
              disabled={loading}
              className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-[10px] font-medium text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-50"
            >
              {loading ? '↻ Refreshing...' : '↻ Refresh'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Gravity Zone Row ──
function GravityZoneRow({ zone, currentPrice }: { zone: GravityZone; currentPrice: number }) {
  const distance = ((zone.centerPrice - currentPrice) / currentPrice * 100);
  const isAbove = zone.centerPrice > currentPrice;

  return (
    <div className="flex items-center justify-between text-xs py-1 border-b border-slate-800/40 last:border-0">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${
          zone.strength === 'extreme' ? 'bg-red-400' :
          zone.strength === 'strong' ? 'bg-orange-400' :
          zone.strength === 'moderate' ? 'bg-yellow-400' :
          'bg-slate-500'
        }`} />
        <span className="font-mono text-slate-300 w-20">${zone.centerPrice.toFixed(2)}</span>
        <span className={`text-[10px] ${isAbove ? 'text-amber-400' : 'text-cyan-400'}`}>
          {isAbove ? '▲' : '▼'} {Math.abs(distance).toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-slate-500 text-[10px]">
          {zone.timeframes.join(', ')}
        </span>
        <span className={`font-mono text-[10px] ${
          zone.strength === 'extreme' ? 'text-red-400' :
          zone.strength === 'strong' ? 'text-orange-400' :
          'text-slate-400'
        }`}>
          G={zone.gravity.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
