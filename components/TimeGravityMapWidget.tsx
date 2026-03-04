'use client';

import React, { useState, useEffect } from 'react';
import { computeTimeGravityMap, type TimeGravityMap, type GravityZone, type GravityPoint } from '@/lib/time/timeGravityMap';
import type { MidpointRecord } from '@/lib/time/midpointDebt';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface TimeGravityMapWidgetProps {
  symbol: string;
  currentPrice?: number;
  midpoints?: MidpointRecord[];
  assetType?: 'crypto' | 'stock' | 'forex';
  autoRefresh?: boolean;
  refreshInterval?: number;
  variant?: 'full' | 'compact';
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Price Gravity Heatmap
 */
function PriceGravityHeatmap({ tgm }: { tgm: TimeGravityMap }) {
  const maxGravity = Math.max(...tgm.heatmap);
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>PRICE GRAVITY MAP</span>
        <span className="text-cyan-400">Current: {tgm.currentPrice.toFixed(2)}</span>
      </div>
      
      <div className="bg-black/40 border border-gray-800 rounded p-2 font-mono text-xs">
        {tgm.heatmapPrices.map((price, i) => {
          const gravity = tgm.heatmap[i];
          const intensity = maxGravity > 0 ? (gravity / maxGravity) * 100 : 0;
          const barWidth = Math.min(100, intensity);
          
          // Color based on intensity
          let barColor = 'bg-gray-700';
          if (intensity > 75) barColor = 'bg-red-500';
          else if (intensity > 50) barColor = 'bg-orange-500';
          else if (intensity > 25) barColor = 'bg-yellow-500';
          else if (intensity > 10) barColor = 'bg-green-500';
          
          const isCurrent = Math.abs(price - tgm.currentPrice) < (tgm.currentPrice * 0.001);
          
          return (
            <div key={i} className="flex items-center gap-2 py-0.5">
              <span className={`w-16 text-right ${isCurrent ? 'text-cyan-400 font-bold' : 'text-gray-400'}`}>
                {price.toFixed(2)}
              </span>
              <div className="flex-1 bg-gray-900/50 h-3 relative">
                <div
                  className={`h-full ${barColor} transition-all duration-300`}
                  style={{ width: `${barWidth}%` }}
                />
                {isCurrent && (
                  <div className="absolute inset-0 border-2 border-cyan-400 animate-pulse" />
                )}
              </div>
              <span className="w-12 text-gray-500 text-[10px]">
                {intensity.toFixed(0)}%
              </span>
            </div>
          );
        }).reverse()}
      </div>
    </div>
  );
}

/**
 * AOI Target Box
 */
function AOITargetBox({ zones }: { zones: GravityZone[] }) {
  const topZones = zones.slice(0, 3);
  
  if (topZones.length === 0) {
    return (
      <div className="space-y-1">
        <div className="text-xs text-gray-400">AOI TARGET ZONES</div>
        <div className="bg-black/40 border border-gray-800 rounded p-3 text-center text-gray-500 text-xs">
          No target zones detected
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-400">AOI TARGET ZONES</div>
      
      <div className="space-y-2">
        {topZones.map((zone, index) => {
          const isTop = index === 0;
          const borderColor = isTop ? 'border-green-500' : 'border-gray-700';
          const bgColor = isTop ? 'bg-green-950/20' : 'bg-black/40';
          
          return (
            <div key={index} className={`${bgColor} border ${borderColor} rounded p-2`}>
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${isTop ? 'text-green-400' : 'text-gray-400'}`}>
                    #{zone.rank}
                  </span>
                  <span className="text-sm font-mono text-white">
                    {zone.minPrice.toFixed(2)}–{zone.maxPrice.toFixed(2)}
                  </span>
                </div>
                <span className={`text-xs ${zone.confidence >= 80 ? 'text-green-400' : zone.confidence >= 60 ? 'text-yellow-400' : 'text-gray-400'}`}>
                  {zone.confidence}%
                </span>
              </div>
              
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{zone.dominantTimeframes.slice(0, 3).join(' • ')}</span>
                {zone.activeDecompressionCount > 0 && (
                  <span className="text-orange-400">
                    🔥 {zone.activeDecompressionCount} active
                  </span>
                )}
                {zone.debtCount > 0 && (
                  <span className="text-red-400">
                    ⚠️ {zone.debtCount} debt
                  </span>
                )}
              </div>
              
              <div className="mt-1 bg-gray-900/50 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full ${isTop ? 'bg-green-500' : 'bg-gray-600'}`}
                  style={{ width: `${zone.visualIntensity}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Midpoint Ladder
 */
function MidpointLadder({ points }: { points: GravityPoint[] }) {
  // Group by timeframe
  const byTF = points.reduce((acc, point) => {
    if (!acc[point.timeframe]) acc[point.timeframe] = [];
    acc[point.timeframe].push(point);
    return acc;
  }, {} as Record<string, GravityPoint[]>);
  
  const timeframes = ['5Y', '1Y', '3M', '1M', '1W', '1D', '4H', '1H'];
  
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-400">MIDPOINT LADDER</div>
      
      <div className="bg-black/40 border border-gray-800 rounded p-2 font-mono text-xs space-y-1">
        {timeframes.map(tf => {
          const tfPoints = byTF[tf] || [];
          if (tfPoints.length === 0) {
            return (
              <div key={tf} className="flex items-center gap-2 text-gray-600">
                <span className="w-8">{tf}</span>
                <span>—</span>
              </div>
            );
          }
          
          return tfPoints.map((point, i) => {
            let icon = '⚪'; // Default
            let iconColor = 'text-gray-400';
            
            if (point.decompressionState.status === 'ACTIVE') {
              icon = '🔵';
              iconColor = 'text-blue-400';
            } else if (point.decompressionState.status === 'PRE_WINDOW') {
              icon = '🟡';
              iconColor = 'text-yellow-400';
            } else if (point.decompressionState.status === 'TAGGED') {
              icon = '🟢';
              iconColor = 'text-green-400';
            }
            
            if (point.isDebt) {
              icon = '🔴';
              iconColor = 'text-red-400';
            }
            
            const strength = Math.round(point.visualStrength);
            
            return (
              <div key={`${tf}-${i}`} className="flex items-center gap-2">
                <span className="w-8 text-gray-300">{tf}</span>
                <span className={iconColor}>{icon}</span>
                <span className="text-white">{point.midpoint.toFixed(2)}</span>
                <span className="text-gray-500">
                  {point.distance > 0 ? '+' : ''}{point.distance.toFixed(2)}%
                </span>
                <div className="flex-1 bg-gray-900/50 h-1 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500"
                    style={{ width: `${strength}%` }}
                  />
                </div>
              </div>
            );
          });
        })}
      </div>
      
      <div className="text-[10px] text-gray-600 mt-1">
        🔴 Debt | 🔵 Active | 🟡 Pre-Window | 🟢 Tagged | ⚪ Compression
      </div>
    </div>
  );
}

/**
 * Decompression Timers
 */
function DecompressionTimers({ points }: { points: GravityPoint[] }) {
  // Get unique timeframes
  const byTF = points.reduce((acc, point) => {
    if (!acc[point.timeframe]) {
      acc[point.timeframe] = point;
    }
    return acc;
  }, {} as Record<string, GravityPoint>);
  
  const timeframes = ['1H', '4H', '1D', '1W', '1M'];
  
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-400">DECOMPRESSION WINDOWS</div>
      
      <div className="bg-black/40 border border-gray-800 rounded p-2 space-y-2">
        {timeframes.map(tf => {
          const point = byTF[tf];
          if (!point) {
            return (
              <div key={tf} className="flex items-center gap-2 text-xs text-gray-600">
                <span className="w-8">{tf}</span>
                <span>—</span>
              </div>
            );
          }
          
          const state = point.decompressionState;
          const progress = state.windowProgress;
          
          let statusColor = 'text-gray-400';
          let barColor = 'bg-gray-600';
          
          if (state.status === 'ACTIVE') {
            statusColor = 'text-blue-400';
            barColor = 'bg-blue-500';
          } else if (state.status === 'PRE_WINDOW') {
            statusColor = 'text-yellow-400';
            barColor = 'bg-yellow-500';
          } else if (state.status === 'TAGGED') {
            statusColor = 'text-green-400';
            barColor = 'bg-green-500';
          }
          
          return (
            <div key={tf}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-300">{tf}</span>
                <span className={statusColor}>{state.status}</span>
              </div>
              <div className="bg-gray-900/50 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all duration-300`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                <span>
                  {state.isInWindow 
                    ? `In window` 
                    : state.minutesUntilWindowStart !== null && state.minutesUntilWindowStart > 0
                    ? `${Math.floor(state.minutesUntilWindowStart / 60)}h ${Math.floor(state.minutesUntilWindowStart % 60)}m`
                    : 'N/A'}
                </span>
                <span>{progress.toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Midpoint Debt Tracker
 */
function MidpointDebtTracker({ tgm }: { tgm: TimeGravityMap }) {
  const debt = tgm.debtAnalysis;
  
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-400">MIDPOINT DEBT</div>
      
      <div className="bg-black/40 border border-gray-800 rounded p-3">
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div>
            <div className="text-2xl font-bold text-red-400">{debt.unresolvedMidpoints.length}</div>
            <div className="text-xs text-gray-500">Unresolved</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-400">{debt.resolvedMidpoints.length}</div>
            <div className="text-xs text-gray-500">Tagged</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-400">{debt.clusters.length}</div>
            <div className="text-xs text-gray-500">Clusters</div>
          </div>
        </div>
        
        {debt.topCluster && (
          <div className="border-t border-gray-700 pt-2">
            <div className="text-xs text-gray-400 mb-1">Top Cluster</div>
            <div className="text-sm font-mono text-white">
              {debt.topCluster.centerPrice.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500">
              {debt.topCluster.midpoints.length} midpoints • Gravity: {debt.topCluster.gravityStrength.toFixed(0)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * AI Analyst Commentary
 */
function AIAnalystCommentary({ tgm }: { tgm: TimeGravityMap }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-400">AI ANALYST</div>
      
      <div className="bg-gradient-to-r from-purple-950/40 to-blue-950/40 border border-purple-500/30 rounded p-3">
        {tgm.alert && (
          <div className="text-xs font-mono text-white mb-2 bg-black/40 p-2 rounded">
            {tgm.alert}
          </div>
        )}
        
        <div className="text-xs text-gray-300">
          {tgm.summary}
        </div>
        
        {tgm.topZone && tgm.topZone.confidence >= 60 && (
          <div className="mt-2 text-xs text-purple-300">
            💡 {tgm.topZone.activeDecompressionCount > 0
              ? `${tgm.topZone.activeDecompressionCount} decompression window${tgm.topZone.activeDecompressionCount > 1 ? 's' : ''} active - high probability move incoming`
              : 'Monitor for decompression window activation'}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN WIDGET
// ═══════════════════════════════════════════════════════════════════════════

export default function TimeGravityMapWidget({
  symbol,
  currentPrice,
  midpoints: externalMidpoints,
  assetType = 'crypto',
  autoRefresh = true,
  refreshInterval = 30000,
  variant = 'full',
  className = '',
}: TimeGravityMapWidgetProps) {
  const [tgm, setTGM] = useState<TimeGravityMap | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedPrice, setResolvedPrice] = useState<number>(currentPrice || 0);
  
  // Fetch TGM data from API
  const fetchTGM = async () => {
    if (!symbol) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({ symbol });
      if (currentPrice) params.set('price', String(currentPrice));
      if (assetType) params.set('assetType', assetType);
      
      const res = await fetch(`/api/time-gravity-map?${params}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.data) {
        setTGM(data.data);
        setResolvedPrice(currentPrice || 0);
        setLastUpdate(new Date());
      } else if (data.midpoints && data.midpoints.length > 0) {
        // Fallback: compute client-side from midpoints
        const price = data.currentPrice || currentPrice || 0;
        if (price > 0) {
          const result = computeTimeGravityMap(data.midpoints, price);
          setTGM(result);
          setResolvedPrice(price);
          setLastUpdate(new Date());
        }
      } else {
        setError('No midpoint data available. Run backfill first.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Time Gravity Map');
      
      // Fallback to external midpoints if provided
      if (externalMidpoints && externalMidpoints.length > 0 && (currentPrice || 0) > 0) {
        const result = computeTimeGravityMap(externalMidpoints, currentPrice!);
        setTGM(result);
        setResolvedPrice(currentPrice!);
        setLastUpdate(new Date());
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Initial fetch
  useEffect(() => {
    fetchTGM();
  }, [symbol, currentPrice]);
  
  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetchTGM();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, symbol, currentPrice]);
  
  if (loading && !tgm) {
    return (
      <div className={`bg-slate-900/60 border border-slate-800 rounded-lg p-6 ${className}`}>
        <div className="text-center text-slate-500">
          <div className="animate-pulse">Loading Time Gravity Map...</div>
        </div>
      </div>
    );
  }
  
  if (error && !tgm) {
    return (
      <div className={`bg-slate-900/60 border border-slate-800 rounded-lg p-6 ${className}`}>
        <div className="text-center">
          <div className="text-slate-400 text-sm mb-2">🧲 Time Gravity Map</div>
          <div className="text-amber-400/80 text-xs">{error}</div>
          <button 
            onClick={fetchTGM}
            className="mt-3 px-3 py-1.5 text-xs border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  
  if (!tgm) {
    return (
      <div className={`bg-gray-900 border border-gray-800 rounded-lg p-6 ${className}`}>
        <div className="text-center text-gray-500">
          Loading Time Gravity Map...
        </div>
      </div>
    );
  }
  
  if (variant === 'compact') {
    return (
      <div className={`bg-gray-900 border border-gray-800 rounded-lg p-4 ${className}`}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-white">Time Gravity Map</h3>
            <p className="text-xs text-gray-400">{symbol}</p>
          </div>
          <div className="text-right">
            <div className="text-lg font-mono text-white">
              {tgm.targetPrice?.toFixed(2) || '—'}
            </div>
            <div className="text-xs text-gray-400">Target</div>
          </div>
        </div>
        
        {tgm.alert && (
          <div className="bg-purple-950/40 border border-purple-500/30 rounded p-2 text-xs text-white mb-3">
            {tgm.alert}
          </div>
        )}
        
        <AOITargetBox zones={tgm.zones} />
      </div>
    );
  }
  
  // Full variant - complete dashboard
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-lg p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">⏰ Time Gravity Map</h2>
          <p className="text-sm text-gray-400">{symbol} • {resolvedPrice > 0 ? resolvedPrice.toFixed(2) : '—'}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-mono font-bold text-cyan-400">
            {tgm.confidence}%
          </div>
          <div className="text-xs text-gray-400">Confidence</div>
        </div>
      </div>
      
      {/* Alert Banner */}
      {tgm.alert && (
        <div className="bg-gradient-to-r from-purple-950/60 to-blue-950/60 border border-purple-500 rounded-lg p-3 mb-4">
          <div className="text-sm font-mono text-white">{tgm.alert}</div>
        </div>
      )}
      
      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column */}
        <div className="space-y-4">
          <PriceGravityHeatmap tgm={tgm} />
          <AOITargetBox zones={tgm.zones} />
          <AIAnalystCommentary tgm={tgm} />
        </div>
        
        {/* Right Column */}
        <div className="space-y-4">
          <MidpointLadder points={tgm.allPoints} />
          <DecompressionTimers points={tgm.allPoints} />
          <MidpointDebtTracker tgm={tgm} />
        </div>
      </div>
      
      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-500">
        <span>Last update: {lastUpdate.toLocaleTimeString()}</span>
        <span>{tgm.allPoints.length} midpoints tracked</span>
      </div>
    </div>
  );
}
