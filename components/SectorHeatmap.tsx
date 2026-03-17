'use client';

import { useState, useEffect } from 'react';

interface SectorData {
  symbol: string;
  name: string;
  price?: number;
  change?: number;
  changePercent: number;
  daily?: number;
  weekly?: number;
  monthly?: number;
  quarterly?: number;
  ytd?: number;
  yearly?: number;
  weight: number;
  color: string;
  // Technical overlay
  rsi14?: number | null;
  adx14?: number | null;
  ema200_dist?: number | null;
  in_squeeze?: boolean | null;
  mfi14?: number | null;
  obv?: number | null;
  // Rotation & RS
  rs_rank?: number;
  rotation_phase?: string;
}

type TimeFrame = 'realtime' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'ytd' | 'yearly';

export default function SectorHeatmap() {
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('realtime');
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);

  useEffect(() => {
    fetchSectorData();
    const interval = setInterval(fetchSectorData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  async function fetchSectorData() {
    if (sectors.length > 0) {
      setRefreshing(true);
    }
    try {
      const res = await fetch('/api/sectors/heatmap');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSectors(Array.isArray(data.sectors) ? data.sectors : []);
      setLastUpdate(data.timestamp);
      setError(null);
    } catch (err) {
      setError('Failed to load sector data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function getChangeValue(sector: SectorData): number {
    switch (timeFrame) {
      case 'daily': return sector.daily ?? sector.changePercent;
      case 'weekly': return sector.weekly ?? sector.changePercent;
      case 'monthly': return sector.monthly ?? sector.changePercent;
      case 'quarterly': return sector.quarterly ?? sector.changePercent;
      case 'ytd': return sector.ytd ?? sector.changePercent;
      case 'yearly': return sector.yearly ?? sector.changePercent;
      default: return sector.changePercent;
    }
  }

  function getHeatColor(changePercent: number): string {
    // Gradient from deep red to bright green
    const intensity = Math.min(Math.abs(changePercent) / 3, 1);
    
    if (changePercent > 0) {
      // Green gradient
      const base = Math.round(40 + intensity * 60);
      const green = Math.round(160 + intensity * 95);
      return `rgb(${base}, ${green}, ${Math.round(base * 1.2)})`;
    } else if (changePercent < 0) {
      // Red gradient
      const base = Math.round(40 + intensity * 60);
      const red = Math.round(160 + intensity * 95);
      return `rgb(${red}, ${base}, ${Math.round(base * 1.2)})`;
    }
    return 'rgb(60, 60, 70)'; // Neutral gray
  }

  function calculateLayout(sectors: SectorData[]): { x: number; y: number; w: number; h: number; sector: SectorData }[] {
    // Sort by weight (descending) for better treemap layout
    const sorted = [...sectors].sort((a, b) => b.weight - a.weight);
    const totalWeight = sorted.reduce((sum, s) => sum + s.weight, 0);
    
    // Simple row-based layout
    const items: { x: number; y: number; w: number; h: number; sector: SectorData }[] = [];
    let currentY = 0;
    let currentX = 0;
    let rowHeight = 0;
    const containerWidth = 100; // percentage
    const containerHeight = 100;
    
    // Create rows based on weight
    let rowSectors: SectorData[] = [];
    let rowWeight = 0;
    const targetRowWeight = totalWeight / 3; // 3 rows approximately
    
    const rows: SectorData[][] = [];
    
    sorted.forEach(sector => {
      if (rowWeight + sector.weight > targetRowWeight && rowSectors.length > 0) {
        rows.push(rowSectors);
        rowSectors = [sector];
        rowWeight = sector.weight;
      } else {
        rowSectors.push(sector);
        rowWeight += sector.weight;
      }
    });
    if (rowSectors.length > 0) rows.push(rowSectors);
    
    // Calculate positions
    const rowHeightPercent = containerHeight / rows.length;
    
    rows.forEach((row, rowIndex) => {
      const rowTotalWeight = row.reduce((sum, s) => sum + s.weight, 0);
      let xOffset = 0;
      
      row.forEach(sector => {
        const widthPercent = (sector.weight / rowTotalWeight) * containerWidth;
        items.push({
          x: xOffset,
          y: rowIndex * rowHeightPercent,
          w: widthPercent,
          h: rowHeightPercent,
          sector
        });
        xOffset += widthPercent;
      });
    });
    
    return items;
  }

  const timeFrameOptions: { value: TimeFrame; label: string }[] = [
    { value: 'realtime', label: 'Real-Time' },
    { value: 'daily', label: '1 Day' },
    { value: 'weekly', label: '1 Week' },
    { value: 'monthly', label: '1 Month' },
    { value: 'quarterly', label: '3 Months' },
    { value: 'ytd', label: 'YTD' },
    { value: 'yearly', label: '1 Year' },
  ];

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-700 rounded w-48"></div>
          <div className="h-64 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (error && sectors.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
        <p className="text-red-400">{error}</p>
        <button
          onClick={fetchSectorData}
          className="mt-2 text-emerald-400 hover:text-emerald-300 text-sm"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!loading && sectors.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 text-center">
        <p className="text-slate-300 font-medium">No sector data available right now.</p>
        <p className="text-slate-500 text-sm mt-1">Try refreshing in a few seconds.</p>
        <button
          onClick={fetchSectorData}
          className="mt-3 px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-sm hover:bg-emerald-500/30"
        >
          Refresh Sector Data
        </button>
      </div>
    );
  }

  const layout = calculateLayout(sectors);

  // Find best and worst performers
  const sortedByChange = [...sectors].sort((a, b) => getChangeValue(b) - getChangeValue(a));
  const bestPerformer = sortedByChange[0];
  const worstPerformer = sortedByChange[sortedByChange.length - 1];

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-2xl">🗺️</span>
              S&P 500 Sector Map
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Hover for details • Size = market weight • <span className="text-amber-400">Data updates every 60s</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {error && (
              <span className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
                Showing cached view
              </span>
            )}
            <button
              onClick={fetchSectorData}
              className="text-xs px-3 py-1.5 rounded border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500"
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          
          {/* Time Frame Selector */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1 bg-slate-900/50 rounded-lg p-1">
              {timeFrameOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTimeFrame(opt.value)}
                  className={`px-2 py-1 text-xs rounded transition-all ${
                    timeFrame === opt.value
                      ? 'bg-emerald-500 text-white font-medium'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="relative" style={{ height: '400px' }}>
        {layout.map(item => {
          const change = getChangeValue(item.sector) ?? 0;
          const isHovered = hoveredSector === item.sector.symbol;
          
          return (
            <div
              key={item.sector.symbol}
              className="absolute transition-all duration-200 cursor-pointer border border-slate-900/50 group"
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: `${item.w}%`,
                height: `${item.h}%`,
                backgroundColor: getHeatColor(change),
                transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                zIndex: isHovered ? 10 : 1,
              }}
              onMouseEnter={() => setHoveredSector(item.sector.symbol)}
              onMouseLeave={() => setHoveredSector(null)}
            >
              <div className="h-full flex flex-col items-center justify-center p-1 text-center overflow-hidden relative">
                {/* RS Rank badge */}
                {item.sector.rs_rank != null && (
                  <span className={`absolute top-1 left-1 text-[10px] font-bold rounded px-1 py-0.5 leading-none ${
                    item.sector.rs_rank <= 3 ? 'bg-emerald-500/80 text-white' :
                    item.sector.rs_rank <= 6 ? 'bg-slate-500/70 text-white' :
                    'bg-red-500/70 text-white'
                  }`}>
                    #{item.sector.rs_rank}
                  </span>
                )}
                {/* Rotation phase badge */}
                {item.sector.rotation_phase && (
                  <span className={`absolute top-1 right-1 text-[9px] font-semibold rounded px-1 py-0.5 leading-none ${
                    item.sector.rotation_phase === 'Leading' ? 'bg-emerald-500/80 text-white' :
                    item.sector.rotation_phase === 'Strengthening' || item.sector.rotation_phase === 'Improving' ? 'bg-cyan-500/70 text-white' :
                    item.sector.rotation_phase === 'Weakening' || item.sector.rotation_phase === 'Deteriorating' ? 'bg-amber-500/70 text-white' :
                    'bg-red-500/70 text-white'
                  }`}>
                    {item.sector.rotation_phase}
                  </span>
                )}
                <span className="text-white font-bold text-xs sm:text-sm md:text-base drop-shadow-lg truncate max-w-full">
                  {item.sector.name}
                </span>
                <span className="text-base sm:text-lg md:text-xl font-bold drop-shadow-lg text-white">
                  {(change ?? 0) >= 0 ? '+' : ''}{(change ?? 0).toFixed(2)}%
                </span>
                <span className="text-white/70 text-xs drop-shadow">
                  {item.sector.symbol}
                </span>
              </div>
              
              {/* Hover tooltip - positioned to float above */}
              {isHovered && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-slate-900 border border-slate-600 rounded-lg p-3 text-xs shadow-xl min-w-[180px] z-50">
                  <div className="font-semibold text-white mb-2 text-center">{item.sector.name}</div>
                  <div className="flex justify-between text-white/80 gap-4">
                    <span>Weight:</span>
                    <span className="font-medium text-white">{item.sector.weight}%</span>
                  </div>
                  <div className="flex justify-between text-white/80 gap-4 mt-1">
                    <span>Change:</span>
                    <span className={`font-medium ${(change ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(change ?? 0) >= 0 ? '+' : ''}{(change ?? 0).toFixed(2)}%
                    </span>
                  </div>
                  {item.sector.price && (
                    <div className="flex justify-between text-white/80 gap-4 mt-1">
                      <span>Price:</span>
                      <span className="font-medium text-white">${item.sector.price.toFixed(2)}</span>
                    </div>
                  )}
                  {/* Technical overlay */}
                  {(item.sector.rsi14 != null || item.sector.adx14 != null || item.sector.ema200_dist != null) && (
                    <div className="border-t border-slate-700 mt-2 pt-2 space-y-1">
                      {item.sector.rsi14 != null && (
                        <div className="flex justify-between text-white/80 gap-4">
                          <span>RSI(14):</span>
                          <span className={`font-medium ${
                            item.sector.rsi14 > 70 ? 'text-red-400' :
                            item.sector.rsi14 < 30 ? 'text-emerald-400' : 'text-white'
                          }`}>{item.sector.rsi14.toFixed(1)}</span>
                        </div>
                      )}
                      {item.sector.adx14 != null && (
                        <div className="flex justify-between text-white/80 gap-4">
                          <span>ADX:</span>
                          <span className={`font-medium ${
                            item.sector.adx14 > 25 ? 'text-cyan-400' : 'text-slate-400'
                          }`}>{item.sector.adx14.toFixed(1)}</span>
                        </div>
                      )}
                      {item.sector.ema200_dist != null && (
                        <div className="flex justify-between text-white/80 gap-4">
                          <span>EMA200:</span>
                          <span className={`font-medium ${
                            item.sector.ema200_dist >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}>{item.sector.ema200_dist >= 0 ? '+' : ''}{item.sector.ema200_dist.toFixed(1)}%</span>
                        </div>
                      )}
                      {item.sector.mfi14 != null && (
                        <div className="flex justify-between text-white/80 gap-4">
                          <span>MFI:</span>
                          <span className={`font-medium ${
                            item.sector.mfi14 > 80 ? 'text-red-400' :
                            item.sector.mfi14 < 20 ? 'text-emerald-400' : 'text-white'
                          }`}>{item.sector.mfi14.toFixed(1)}</span>
                        </div>
                      )}
                      {item.sector.in_squeeze && (
                        <div className="text-center mt-1">
                          <span className="text-amber-400 font-semibold text-[10px] bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">SQUEEZE</span>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Arrow */}
                  <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-slate-900"></div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend & Stats */}
      <div className="p-4 border-t border-slate-700 bg-slate-900/30">
        <div className="flex items-center justify-between flex-wrap gap-4">
          {/* Color Legend */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: getHeatColor(-3) }}></div>
              <span className="text-xs text-slate-400">-3%</span>
            </div>
            <div className="w-24 h-3 rounded" style={{
              background: 'var(--msp-panel)'
            }}></div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: getHeatColor(3) }}></div>
              <span className="text-xs text-slate-400">+3%</span>
            </div>
          </div>

          {/* Best/Worst */}
          <div className="flex items-center gap-4 text-xs">
            {bestPerformer && (
              <div className="flex items-center gap-1">
                <span className="text-slate-400">Best:</span>
                <span className="text-emerald-400 font-medium">
                  {bestPerformer.name} (+{(getChangeValue(bestPerformer) ?? 0).toFixed(2)}%)
                </span>
              </div>
            )}
            {worstPerformer && (
              <div className="flex items-center gap-1">
                <span className="text-slate-400">Worst:</span>
                <span className="text-red-400 font-medium">
                  {worstPerformer.name} ({(getChangeValue(worstPerformer) ?? 0).toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Last Update */}
        {lastUpdate && (
          <p className="text-xs text-slate-500 mt-2">
            Last updated: {new Date(lastUpdate).toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Sector Intelligence Panel */}
      {sectors.some(s => s.rs_rank != null || s.rotation_phase) && (
        <div className="p-4 border-t border-slate-700 bg-slate-900/30">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <span>🧠</span> Sector Intelligence
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* RS Ranking Table */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <h5 className="text-xs font-semibold text-slate-300 mb-2">Relative Strength Ranking</h5>
              <div className="space-y-1">
                {[...sectors].sort((a, b) => (a.rs_rank ?? 99) - (b.rs_rank ?? 99)).map(s => (
                  <div key={s.symbol} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-4 text-center font-bold ${
                        (s.rs_rank ?? 99) <= 3 ? 'text-emerald-400' :
                        (s.rs_rank ?? 99) <= 6 ? 'text-slate-300' : 'text-red-400'
                      }`}>{s.rs_rank ?? '-'}</span>
                      <span className="text-white">{s.symbol}</span>
                    </div>
                    <span className={`font-medium ${s.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rotation Model */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <h5 className="text-xs font-semibold text-slate-300 mb-2">Rotation Model</h5>
              <div className="space-y-1">
                {(['Leading', 'Strengthening', 'Improving', 'Weakening', 'Deteriorating', 'Lagging'] as const).map(phase => {
                  const inPhase = sectors.filter(s => s.rotation_phase === phase);
                  if (inPhase.length === 0) return null;
                  return (
                    <div key={phase} className="text-xs">
                      <span className={`font-semibold ${
                        phase === 'Leading' ? 'text-emerald-400' :
                        phase === 'Strengthening' || phase === 'Improving' ? 'text-cyan-400' :
                        phase === 'Weakening' || phase === 'Deteriorating' ? 'text-amber-400' :
                        'text-red-400'
                      }`}>{phase}:</span>
                      <span className="text-slate-300 ml-1">{inPhase.map(s => s.symbol).join(', ')}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                Based on weekly vs monthly vs quarterly momentum
              </p>
            </div>

            {/* Money Flow Summary */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <h5 className="text-xs font-semibold text-slate-300 mb-2">Money Flow (MFI)</h5>
              {sectors.some(s => s.mfi14 != null) ? (
                <div className="space-y-1">
                  {[...sectors]
                    .filter(s => s.mfi14 != null)
                    .sort((a, b) => (b.mfi14 ?? 0) - (a.mfi14 ?? 0))
                    .map(s => (
                      <div key={s.symbol} className="flex items-center justify-between text-xs">
                        <span className="text-white">{s.symbol}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                (s.mfi14 ?? 0) > 80 ? 'bg-red-400' :
                                (s.mfi14 ?? 0) < 20 ? 'bg-emerald-400' :
                                'bg-cyan-400'
                              }`}
                              style={{ width: `${Math.min(s.mfi14 ?? 0, 100)}%` }}
                            />
                          </div>
                          <span className={`font-medium w-8 text-right ${
                            (s.mfi14 ?? 0) > 80 ? 'text-red-400' :
                            (s.mfi14 ?? 0) < 20 ? 'text-emerald-400' : 'text-slate-300'
                          }`}>{(s.mfi14 ?? 0).toFixed(0)}</span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-[10px] text-slate-500">MFI data populates as sector ETFs are ingested by the worker</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
