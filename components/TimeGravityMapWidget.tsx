'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { computeTimeGravityMap, type TimeGravityMap, type GravityZone, type GravityPoint, type TargetStatus, type CloseConfluence, type CoverageDiagnostics } from '@/lib/time/timeGravityMap';
import type { MidpointRecord } from '@/lib/time/midpointDebt';
import type { MomentumOverrideState, ExpansionTarget } from '@/lib/time/momentumOverride';
import type { ForwardCloseCalendar, ForwardCloseScheduleRow, ForwardCloseCluster } from '@/lib/confluence-learning-agent';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface TimeGravityMapWidgetProps {
  symbol: string;
  currentPrice?: number;
  midpoints?: MidpointRecord[];
  assetType?: 'crypto' | 'stock' | 'forex';
  autoRefresh?: boolean;
  /** Refresh interval in ms (default: 120000 = 2 minutes) */
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
 * Target Status Banner — shows real-time target lifecycle
 */
function TargetStatusBanner({ tgm }: { tgm: TimeGravityMap }) {
  const status = tgm.targetStatus;
  const stats = tgm.taggingStats;

  const statusConfig: Record<TargetStatus, { bg: string; border: string; icon: string; text: string; textColor: string }> = {
    ACTIVE: {
      bg: 'bg-green-950/30',
      border: 'border-green-500/50',
      icon: '🎯',
      text: `TARGET ACTIVE: ${tgm.targetPrice?.toFixed(2) || '—'}`,
      textColor: 'text-green-400',
    },
    TARGET_HIT: {
      bg: 'bg-emerald-950/40',
      border: 'border-emerald-400',
      icon: '✅',
      text: 'TARGET HIT — All midpoints tagged',
      textColor: 'text-emerald-400',
    },
    OVERSHOT: {
      bg: 'bg-amber-950/40',
      border: 'border-amber-400',
      icon: '🚀',
      text: `TARGET OVERSHOT — Price blew past ${stats.overshotTagged} midpoint(s)`,
      textColor: 'text-amber-400',
    },
    EXPANSION: {
      bg: 'bg-purple-950/40',
      border: 'border-purple-400',
      icon: '⚡',
      text: 'MOMENTUM OVERRIDE — Expansion targets active',
      textColor: 'text-purple-400',
    },
    RECOMPUTING: {
      bg: 'bg-blue-950/30',
      border: 'border-blue-500/50',
      icon: '🔄',
      text: 'RECOMPUTING — Finding next target...',
      textColor: 'text-blue-400',
    },
    NO_TARGET: {
      bg: 'bg-gray-900/40',
      border: 'border-gray-700',
      icon: '⏳',
      text: 'No active gravity targets',
      textColor: 'text-gray-400',
    },
  };

  const cfg = statusConfig[status];

  return (
    <div className={`${cfg.bg} border ${cfg.border} rounded-lg p-3 mb-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{cfg.icon}</span>
          <span className={`text-sm font-bold ${cfg.textColor}`}>{cfg.text}</span>
        </div>
        {tgm.targetPrice && status === 'ACTIVE' && (
          <span className="text-xs text-gray-400">
            Alignment: {tgm.confidence}%
          </span>
        )}
      </div>

      {/* Tagging stats row */}
      {(stats.taggedThisCycle > 0 || stats.remainingUntagged > 0) && (
        <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-500">
          {stats.taggedThisCycle > 0 && (
            <span className="text-green-500">
              ✓ {stats.taggedThisCycle} tagged this cycle
            </span>
          )}
          {stats.overshotTagged > 0 && (
            <span className="text-amber-500">
              🚀 {stats.overshotTagged} overshot
            </span>
          )}
          <span>
            {stats.remainingUntagged} active target{stats.remainingUntagged !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Next target preview when recomputing */}
      {status === 'RECOMPUTING' && tgm.topZone && (
        <div className="mt-2 text-xs text-blue-300">
          → Next target: {tgm.topZone.centerPrice.toFixed(2)} ({tgm.topZone.dominantTimeframes.join(' • ')})
        </div>
      )}

      {/* Expansion targets */}
      {status === 'EXPANSION' && tgm.expansionTargets.length > 0 && (
        <div className="mt-2 space-y-1">
          {tgm.expansionTargets.slice(0, 3).map((target, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-purple-400">{target.label}</span>
              <span className="text-white font-mono">{target.price.toFixed(2)}</span>
              <span className="text-gray-600 text-[10px]">{target.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Momentum Override Banner
 */
function MomentumOverrideBanner({ override }: { override: MomentumOverrideState }) {
  if (!override.isOverride) return null;

  return (
    <div className="bg-gradient-to-r from-purple-950/60 to-red-950/40 border border-purple-500 rounded-lg p-3 mb-3 animate-pulse">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <span className="text-sm font-bold text-purple-300">MOMENTUM OVERRIDE: ON</span>
        </div>
        <span className="text-xs text-purple-400 font-mono">
          Mode: {override.mode}
        </span>
      </div>

      <div className="text-xs text-gray-300 mb-2">
        Reason: {override.reasons.join(' + ')}
      </div>

      {/* Severity bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500">Severity</span>
        <div className="flex-1 bg-gray-900/50 h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-yellow-500 to-red-500"
            style={{ width: `${override.severity01 * 100}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-400">
          {(override.severity01 * 100).toFixed(0)}%
        </span>
      </div>

      <div className="mt-2 text-[10px] text-gray-500">
        Gravity dampened to {Math.round(override.gravityMultiplier * 100)}% — midpoints are LOW PRIORITY
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
  
  const timeframes = ['5Y', '1Y', '3M', '1M', '1W', '1D', '8H', '6H', '4H', '2H', '1H', '30m', '15m'];
  
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
                <span className="text-gray-600 text-[10px]">
                  ({point.zoneLow.toFixed(0)}–{point.zoneHigh.toFixed(0)})
                </span>
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
  
  const timeframes = ['15m', '30m', '1H', '2H', '4H', '6H', '8H', '1D', '1W', '1M'];
  
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
              ? `${tgm.topZone.activeDecompressionCount} decompression window${tgm.topZone.activeDecompressionCount > 1 ? 's' : ''} active — multiple timeframes aligned`
              : 'Monitor for decompression window activation'}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TRUTH DIAGNOSTICS COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Coverage Bar — shows which TFs have data vs expected
 */
function CoverageBar({ coverage }: { coverage: CoverageDiagnostics }) {
  const pct = coverage.percent;
  const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  const textColor = pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">DATA COVERAGE</span>
        <span className={`font-mono ${textColor}`}>{pct}%</span>
      </div>
      <div className="bg-gray-900/50 h-2 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        {coverage.expected.map(tf => {
          const has = coverage.available.includes(tf);
          return (
            <span
              key={tf}
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                has ? 'bg-green-950/40 text-green-400 border border-green-800' : 'bg-red-950/40 text-red-400 border border-red-800'
              }`}
            >
              {tf}
            </span>
          );
        })}
      </div>
      {coverage.missing.length > 0 && (
        <div className="text-[10px] text-amber-500 mt-0.5">
          ⚠️ Missing: {coverage.missing.join(', ')}
        </div>
      )}
    </div>
  );
}

/**
 * Close Confluence Panel — shows temporal stacking of TF closes
 */
function CloseConfluencePanel({ confluence }: { confluence: CloseConfluence }) {
  if (confluence.stacks.length === 0 && confluence.todayCloses.length === 0) {
    return (
      <div className="space-y-1">
        <div className="text-xs text-gray-400">CLOSE CONFLUENCE</div>
        <div className="bg-black/40 border border-gray-800 rounded p-2 text-[10px] text-gray-600">
          No close stacks detected
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-400">CLOSE CONFLUENCE</div>
      <div className="bg-black/40 border border-gray-800 rounded p-2 space-y-2">
        {/* Today closes summary */}
        {confluence.todayCloses.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-cyan-400">📅</span>
            <span className="text-gray-300">
              {confluence.todayCloses.length} TF{confluence.todayCloses.length > 1 ? 's' : ''} close today
            </span>
            {confluence.highestOrderClose && (
              <span className="text-cyan-400 font-mono text-[10px]">
                (highest: {confluence.highestOrderClose})
              </span>
            )}
          </div>
        )}

        {/* Active stacks */}
        {confluence.stacks.map((stack, i) => (
          <div key={i} className="border-t border-gray-800 pt-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-orange-400">⚡</span>
                <span className="text-gray-300 font-mono">
                  {stack.entries.map(e => e.timeframe).join(' + ')}
                </span>
              </div>
              <span className={`font-mono text-[10px] ${stack.factor >= 1.5 ? 'text-orange-400' : 'text-gray-400'}`}>
                {stack.factor.toFixed(2)}x
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
              <span>Window: {stack.windowMinutes.toFixed(0)}m</span>
              <span>Quality: {(stack.quality * 100).toFixed(0)}%</span>
              <span>Σw: {stack.totalWeight.toFixed(1)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FORWARD CLOSE SCHEDULE PANEL
// ═══════════════════════════════════════════════════════════════════════════

function fmtMinsShort(mins: number | null): string {
  if (mins === null) return '—';
  if (mins <= 0) return 'NOW';
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 1440) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(mins / 1440);
  const h = Math.round((mins % 1440) / 60);
  if (d >= 30) return `${Math.round(d / 30)}mo`;
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

function fmtCloseTime(iso: string | null, assetClass: 'crypto' | 'equity'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const tz = assetClass === 'crypto' ? 'UTC' : 'America/New_York';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const v = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const suffix = assetClass === 'crypto' ? 'UTC' : 'ET';
  return `${v('weekday')} ${v('month')} ${v('day')} ${v('hour')}:${v('minute')} ${suffix}`;
}

function catColor(cat: string): string {
  switch (cat) {
    case 'intraday': return 'text-slate-400';
    case 'daily': return 'text-cyan-400';
    case 'weekly': return 'text-emerald-400';
    case 'monthly': return 'text-amber-400';
    case 'yearly': return 'text-rose-400';
    default: return 'text-gray-400';
  }
}

function catBg(cat: string): string {
  switch (cat) {
    case 'intraday': return 'bg-slate-900/40 border-slate-700';
    case 'daily': return 'bg-cyan-950/30 border-cyan-800';
    case 'weekly': return 'bg-emerald-950/30 border-emerald-800';
    case 'monthly': return 'bg-amber-950/30 border-amber-800';
    case 'yearly': return 'bg-rose-950/30 border-rose-800';
    default: return 'bg-gray-900/40 border-gray-700';
  }
}

function urgencyBg(mins: number | null): string {
  if (mins === null) return '';
  if (mins <= 10) return 'bg-red-500/20';
  if (mins <= 30) return 'bg-orange-500/15';
  if (mins <= 60) return 'bg-yellow-500/10';
  return '';
}

function ForwardSchedulePanel({
  calendar,
  loading,
}: {
  calendar: ForwardCloseCalendar | null;
  loading: boolean;
}) {
  const [showFull, setShowFull] = useState(false);
  const [catFilter, setCatFilter] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-1">
        <div className="text-xs text-gray-400">CLOSE CALENDAR — FORWARD SCHEDULE</div>
        <div className="bg-black/40 border border-gray-800 rounded p-3 text-center text-gray-500 text-xs animate-pulse">
          Loading close schedule...
        </div>
      </div>
    );
  }

  if (!calendar) return null;

  const { schedule, forwardClusters, closesOnAnchorDay, assetClass } = calendar;
  const anchorDayRows = closesOnAnchorDay;
  const displayRows = showFull ? schedule : anchorDayRows;
  const filteredRows = catFilter
    ? displayRows.filter(r => r.category === catFilter)
    : displayRows;

  // Group by category
  const categories = ['intraday', 'daily', 'weekly', 'monthly', 'yearly'];
  const catCounts = categories.reduce((acc, cat) => {
    acc[cat] = displayRows.filter(r => r.category === cat).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">
          ⏰ CLOSE CALENDAR — {showFull ? 'FULL SCHEDULE' : 'CLOSES TODAY'}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">
            {anchorDayRows.length} today • {schedule.length} total
          </span>
          <button
            onClick={() => setShowFull(!showFull)}
            className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            {showFull ? 'Today Only' : 'Full Schedule'}
          </button>
        </div>
      </div>

      {/* Cluster Cards (top 5) */}
      {forwardClusters.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {forwardClusters.slice(0, 5).map((cluster, i) => (
            <div
              key={i}
              className="flex-shrink-0 bg-orange-950/30 border border-orange-700/50 rounded px-2 py-1 min-w-[100px]"
            >
              <div className="text-[10px] text-orange-300 font-mono whitespace-nowrap">
                {cluster.label}
              </div>
              <div className="flex flex-wrap gap-0.5 mt-0.5">
                {cluster.tfs.slice(0, 6).map(tf => (
                  <span key={tf} className="text-[9px] bg-orange-900/40 text-orange-200 px-1 rounded">
                    {tf}
                  </span>
                ))}
                {cluster.tfs.length > 6 && (
                  <span className="text-[9px] text-orange-400">+{cluster.tfs.length - 6}</span>
                )}
              </div>
              <div className="text-[9px] text-gray-500 mt-0.5">
                Score: {cluster.clusterScore} • Wt: {cluster.weight.toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category filter pills */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => setCatFilter(null)}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
            !catFilter ? 'bg-gray-700 border-gray-500 text-white' : 'bg-black/30 border-gray-700 text-gray-500 hover:text-gray-300'
          }`}
        >
          All ({displayRows.length})
        </button>
        {categories.map(cat => catCounts[cat] > 0 && (
          <button
            key={cat}
            onClick={() => setCatFilter(catFilter === cat ? null : cat)}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors capitalize ${
              catFilter === cat
                ? `${catBg(cat)} ${catColor(cat)}`
                : 'bg-black/30 border-gray-700 text-gray-500 hover:text-gray-300'
            }`}
          >
            {cat} ({catCounts[cat]})
          </button>
        ))}
      </div>

      {/* Schedule table */}
      <div className="bg-black/40 border border-gray-800 rounded overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[60px_1fr_70px_50px] gap-1 px-2 py-1.5 bg-gray-900/60 text-[10px] text-gray-500 font-semibold uppercase">
          <span>TF</span>
          <span>Close Time</span>
          <span className="text-right">In</span>
          <span className="text-right">Wt</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-800/50 max-h-[400px] overflow-y-auto">
          {filteredRows.length === 0 ? (
            <div className="px-2 py-3 text-center text-gray-600 text-xs">
              No closes in this view
            </div>
          ) : (
            filteredRows.map((row, i) => (
              <div
                key={`${row.tf}-${i}`}
                className={`grid grid-cols-[60px_1fr_70px_50px] gap-1 px-2 py-1 text-xs items-center ${urgencyBg(row.minsToFirstClose)}`}
              >
                <span className={`font-mono font-semibold ${catColor(row.category)}`}>
                  {row.tf}
                </span>
                <span className="text-gray-300 text-[11px] font-mono truncate">
                  {fmtCloseTime(row.firstCloseAtISO, assetClass)}
                </span>
                <span className={`text-right font-mono ${
                  row.minsToFirstClose !== null && row.minsToFirstClose <= 30
                    ? 'text-red-400 font-bold'
                    : row.minsToFirstClose !== null && row.minsToFirstClose <= 120
                    ? 'text-orange-400'
                    : 'text-gray-400'
                }`}>
                  {fmtMinsShort(row.minsToFirstClose)}
                </span>
                <span className="text-right text-gray-500 font-mono">
                  {row.weight.toFixed(0)}
                </span>
              </div>
            ))
          )}
        </div>
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
  assetType,
  autoRefresh = true,
  refreshInterval = 120_000,
  variant = 'full',
  className = '',
}: TimeGravityMapWidgetProps) {
  const [tgm, setTGM] = useState<TimeGravityMap | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedPrice, setResolvedPrice] = useState<number>(currentPrice || 0);
  const [midpointCount, setMidpointCount] = useState<number>(-1); // -1 = unknown
  const [generationInfo, setGenerationInfo] = useState<{
    attempted: boolean;
    stored: number;
    timeframes: string[];
    rateLimited: boolean;
    error?: string;
  } | null>(null);
  const [localDemoInfo, setLocalDemoInfo] = useState<{ active: boolean; warnings: string[] }>({ active: false, warnings: [] });
  const [coverage, setCoverage] = useState<CoverageDiagnostics | null>(null);
  const [calendar, setCalendar] = useState<ForwardCloseCalendar | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Fetch forward close calendar from confluence-scan API
  const fetchCalendar = useCallback(async () => {
    if (!symbol) return;
    setCalendarLoading(true);
    try {
      const res = await fetch('/api/confluence-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          mode: 'calendar',
          anchor: 'TODAY',
          horizonDays: 1,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data || data.schedule) {
          setCalendar(data.data ?? data);
        }
      }
    } catch {
      // Calendar is non-critical — fail silently
    } finally {
      setCalendarLoading(false);
    }
  }, [symbol]);
  
  // Fetch TGM data from API
  const fetchTGM = async (forceGenerate = false) => {
    if (!symbol) return;
    
    if (forceGenerate) {
      setGenerating(true);
    } else {
      setLoading(true);
    }
    setError(null);
    setGenerationInfo(null);
    
    try {
      const params = new URLSearchParams({ symbol });
      if (currentPrice) params.set('price', String(currentPrice));
      if (assetType) params.set('assetType', assetType);
      if (forceGenerate) params.set('forceGenerate', '1');
      
      const res = await fetch(`/api/time-gravity-map?${params}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      
      const data = await res.json();
      setLocalDemoInfo({ active: Boolean(data.localDemo), warnings: Array.isArray(data.warnings) ? data.warnings : [] });
      
      // Track midpoint count and generation info from API
      const apiMidpointCount = data.midpointCount ?? 0;
      setMidpointCount(apiMidpointCount);
      
      if (data.generationAttempted) {
        setGenerationInfo({
          attempted: true,
          stored: data.generationResult?.stored ?? 0,
          timeframes: data.generationResult?.timeframes ?? [],
          rateLimited: data.generationResult?.rateLimited ?? false,
          error: data.generationResult?.error,
        });
      }
      
      if (data.data) {
        setTGM(data.data);
        setResolvedPrice(data.data.currentPrice || currentPrice || 0);
        setLastUpdate(new Date());
        if (data.coverage) setCoverage(data.coverage);
        
        // If we got TGM data but zero midpoints, don't treat as success
        if (apiMidpointCount === 0 && !data.generationAttempted) {
          // First load with no data — will show empty state with generate button
        }
      } else if (data.midpoints && data.midpoints.length > 0) {
        // Fallback: compute client-side from midpoints
        const price = data.currentPrice || currentPrice || 0;
        if (price > 0) {
          const result = computeTimeGravityMap(data.midpoints, price);
          setTGM(result);
          setResolvedPrice(price);
          setLastUpdate(new Date());
          setMidpointCount(data.midpoints.length);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Time Gravity Map');
      
      // Fallback to external midpoints if provided
      if (externalMidpoints && externalMidpoints.length > 0 && (currentPrice || 0) > 0) {
        const result = computeTimeGravityMap(externalMidpoints, currentPrice!);
        setTGM(result);
        setResolvedPrice(currentPrice!);
        setLastUpdate(new Date());
        setMidpointCount(externalMidpoints.length);
        setError(null);
      }
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  };
  
  // Initial fetch
  useEffect(() => {
    fetchTGM();
    fetchCalendar();
  }, [symbol, currentPrice]);
  
  // Auto-refresh — pauses when the browser tab is hidden to save resources
  useEffect(() => {
    if (!autoRefresh) return;
    
    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval) return;
      interval = setInterval(() => { fetchTGM(); fetchCalendar(); }, refreshInterval);
    };
    const stop = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };

    const onVisibility = () => {
      if (document.hidden) { stop(); } else { start(); }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
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

  if (generating) {
    return (
      <div className={`bg-slate-900/60 border border-slate-800 rounded-lg p-6 ${className}`}>
        <div className="text-center">
          <div className="text-slate-400 text-sm mb-2">🧲 Time Gravity Map</div>
          <div className="animate-pulse text-cyan-400 text-sm mb-1">Generating midpoint data for {symbol}...</div>
          <div className="text-slate-500 text-xs">Fetching candles across multiple timeframes (1H, 4H, 1D, 1W)</div>
        </div>
      </div>
    );
  }
  
  if (error && !tgm) {
    return (
      <div className={`bg-slate-900/60 border border-slate-800 rounded-lg p-6 ${className}`}>
        <div className="text-center">
          <div className="text-slate-400 text-sm mb-2">🧲 Time Gravity Map</div>
          <div className="text-amber-400/80 text-xs mb-2">{error}</div>
          <button 
            onClick={() => fetchTGM(true)}
            className="mt-1 px-4 py-2 text-xs font-semibold border border-cyan-600 bg-cyan-950/40 rounded-lg text-cyan-300 hover:bg-cyan-900/60 transition-colors"
          >
            🔄 Generate Data for {symbol}
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

  // ── Empty state: TGM loaded but zero midpoints ──────────────────────────
  const hasNoData = midpointCount === 0 && tgm.allPoints.length === 0;
  
  // Check if generation was attempted but produced nothing useful
  const generationFailed = generationInfo?.attempted && generationInfo.stored === 0;
  const wasRateLimited = generationInfo?.rateLimited;
  
  if (variant === 'compact') {
    return (
      <div className={`bg-gray-900 border border-gray-800 rounded-lg p-4 ${className}`}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-white">Time Gravity Map</h3>
            <p className="text-xs text-gray-400">{symbol}</p>
          </div>
          <div className="text-right">
            <div className={`text-lg font-mono ${
              tgm.targetStatus === 'TARGET_HIT' ? 'text-emerald-400' :
              tgm.targetStatus === 'OVERSHOT' ? 'text-amber-400' :
              tgm.targetStatus === 'EXPANSION' ? 'text-purple-400' :
              'text-white'
            }`}>
              {tgm.targetStatus === 'TARGET_HIT' ? '✅ HIT' :
               tgm.targetStatus === 'OVERSHOT' ? '🚀 OVERSHOT' :
               tgm.targetPrice?.toFixed(2) || '—'}
            </div>
            <div className="text-xs text-gray-400">
              {tgm.targetStatus === 'ACTIVE' ? 'Target' : tgm.targetStatus}
            </div>
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
          <div className={`text-2xl font-mono font-bold ${
            tgm.targetStatus === 'TARGET_HIT' ? 'text-emerald-400' :
            tgm.targetStatus === 'OVERSHOT' ? 'text-amber-400' :
            tgm.targetStatus === 'EXPANSION' ? 'text-purple-400' :
            'text-cyan-400'
          }`}>
            {tgm.targetStatus === 'TARGET_HIT' ? '✅' :
             tgm.targetStatus === 'OVERSHOT' ? '🚀' :
             tgm.targetStatus === 'EXPANSION' ? '⚡' :
             `${tgm.confidence}%`}
          </div>
          <div className="text-xs text-gray-400">
            {tgm.targetStatus === 'ACTIVE' ? 'Confidence' : tgm.targetStatus}
          </div>
        </div>
      </div>
      
      {/* Target Status Banner */}
      <TargetStatusBanner tgm={tgm} />

      {localDemoInfo.active && (
        <div className="bg-amber-950/30 border border-amber-500/40 rounded-lg px-3 py-2 mb-3 text-xs text-amber-200">
          <div className="font-semibold text-amber-300 mb-1">Local demo data — not live market output</div>
          <div>{localDemoInfo.warnings[0] || 'Synthetic Time Gravity midpoints are being used because local live midpoint data is unavailable.'}</div>
        </div>
      )}

      {/* ── Empty state: No midpoint data for this symbol ────────────── */}
      {hasNoData && (
        <div className="bg-slate-950/60 border border-slate-700 rounded-lg p-5 mb-4 text-center">
          <div className="text-slate-300 text-sm font-semibold mb-1">
            No midpoint data for {symbol}
          </div>
          {wasRateLimited ? (
            <p className="text-amber-400/80 text-xs mb-3">
              API rate limit reached — try again in a moment.
            </p>
          ) : generationFailed ? (
            <p className="text-amber-400/80 text-xs mb-3">
              {generationInfo?.error || 'On-demand generation returned no data. The symbol may not be available via the market data provider.'}
            </p>
          ) : generationInfo?.attempted && generationInfo.stored > 0 ? (
            <p className="text-green-400/80 text-xs mb-3">
              Generated {generationInfo.stored} midpoints ({generationInfo.timeframes.join(', ')}), but none are within the current price range. Try widening the search distance.
            </p>
          ) : (
            <p className="text-slate-500 text-xs mb-3">
              This symbol hasn&apos;t been scanned yet. Click below to generate gravity map data across multiple timeframes.
            </p>
          )}
          <button
            onClick={() => fetchTGM(true)}
            disabled={generating}
            className="px-5 py-2.5 text-sm font-semibold border border-cyan-600 bg-cyan-950/40 rounded-lg text-cyan-300 hover:bg-cyan-900/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin inline-block w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full" />
                Generating...
              </span>
            ) : wasRateLimited ? (
              '🔄 Retry Generation'
            ) : (
              '🧲 Generate Gravity Map Data'
            )}
          </button>
          <p className="text-slate-600 text-[10px] mt-2">
            Fetches 1H, 4H, Daily & Weekly candle data and stores midpoints for the Time Gravity Map.
            Data persists and is maintained by the background worker going forward.
          </p>
        </div>
      )}

      {/* Generation success banner (when data was just generated for the first time) */}
      {generationInfo?.attempted && generationInfo.stored > 0 && !hasNoData && (
        <div className="bg-green-950/30 border border-green-600/40 rounded-lg px-3 py-2 mb-3 text-xs text-green-400 flex items-center gap-2">
          <span>✅</span>
          <span>Generated {generationInfo.stored} midpoints ({generationInfo.timeframes.join(', ')}) — data is now stored for future scans</span>
        </div>
      )}
      
      {/* Momentum Override Banner (when active) */}
      {tgm.momentumOverride?.isOverride && (
        <MomentumOverrideBanner override={tgm.momentumOverride} />
      )}
      
      {/* Alert Banner (non-override alerts only) */}
      {tgm.alert && !tgm.momentumOverride?.isOverride && (
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

      {/* Truth Diagnostics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {tgm.closeConfluence && (
          <CloseConfluencePanel confluence={tgm.closeConfluence} />
        )}
        {coverage && (
          <CoverageBar coverage={coverage} />
        )}
      </div>

      {/* Forward Close Calendar — Full Schedule */}
      <div className="mt-4">
        <ForwardSchedulePanel calendar={calendar} loading={calendarLoading} />
      </div>
      
      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-500">
        <span>Last update: {lastUpdate.toLocaleTimeString()}</span>
        <span>
          {tgm.allPoints.length} active • {tgm.taggingStats.taggedThisCycle > 0 ? `${tgm.taggingStats.taggedThisCycle} tagged` : '0 tagged'}
        </span>
      </div>
    </div>
  );
}
