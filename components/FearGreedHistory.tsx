'use client';

import { useEffect, useState } from 'react';

interface HistoryPoint {
  value: number;
  classification: string;
  date: string;
}

interface FGHistoryData {
  current: {
    value: number;
    classification: string;
  };
  history: HistoryPoint[];
  market: string;
}

interface Props {
  days?: 7 | 14 | 30;
  height?: number;
  showLegend?: boolean;
  className?: string;
}

export default function FearGreedHistory({ 
  days = 7, 
  height = 200,
  showLegend = true,
  className = '' 
}: Props) {
  const [data, setData] = useState<FGHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<HistoryPoint | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/fear-greed')
      .then(res => res.json())
      .then(result => {
        if (!result.error && result.history) {
          setData(result);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const getColor = (val: number) => {
    if (val <= 19) return '#dc2626'; // Extreme Fear
    if (val <= 39) return '#f97316'; // Fear
    if (val <= 59) return '#eab308'; // Neutral
    if (val <= 79) return '#84cc16'; // Greed
    return '#22c55e'; // Extreme Greed
  };

  const getZoneColor = (zone: string) => {
    switch (zone) {
      case 'Extreme Fear': return '#dc2626';
      case 'Fear': return '#f97316';
      case 'Neutral': return '#eab308';
      case 'Greed': return '#84cc16';
      case 'Extreme Greed': return '#22c55e';
      default: return '#6b7280';
    }
  };

  if (loading) {
    return (
      <div className={`animate-pulse bg-slate-800/50 rounded-xl p-4 ${className}`}>
        <div className="h-4 bg-slate-700 rounded w-1/3 mb-4"></div>
        <div className="h-40 bg-slate-700 rounded"></div>
      </div>
    );
  }

  if (!data || !data.history?.length) {
    return (
      <div className={`bg-slate-800/50 rounded-xl p-4 border border-slate-700 ${className}`}>
        <p className="text-slate-400 text-sm">Historical data unavailable</p>
      </div>
    );
  }

  // Get the last N days of history (reversed so oldest is first)
  const historyData = data.history.slice(0, days).reverse();
  const chartWidth = 100;
  const chartHeight = height - 60; // Leave room for labels
  const padding = { top: 10, right: 10, bottom: 30, left: 35 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Calculate points
  const points = historyData.map((point, i) => ({
    x: padding.left + (i / (historyData.length - 1)) * innerWidth,
    y: padding.top + ((100 - point.value) / 100) * innerHeight,
    ...point
  }));

  // Create path
  const pathD = points.map((p, i) => 
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ');

  // Create area path
  const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${padding.left} ${padding.top + innerHeight} Z`;

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Calculate trend
  const firstValue = historyData[0]?.value || 0;
  const lastValue = historyData[historyData.length - 1]?.value || 0;
  const trendChange = lastValue - firstValue;
  const trendPercent = firstValue > 0 ? ((trendChange / firstValue) * 100).toFixed(1) : '0';

  return (
    <div className={`bg-gradient-to-br from-slate-800/60 to-slate-900/60 rounded-xl border border-slate-700/50 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              Fear & Greed Index
              <span className="ml-2 text-xs font-normal text-slate-400">
                {days}-Day History
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Crypto Market Sentiment</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold" style={{ color: getColor(data.current.value) }}>
                {data.current.value}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded ${trendChange >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {trendChange >= 0 ? '↑' : '↓'} {Math.abs(trendChange)}pts
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: getColor(data.current.value) }}>
              {data.current.classification}
            </p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4">
        <div style={{ height }} className="relative">
          <svg 
            viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            {/* Background zones */}
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={getColor(lastValue)} stopOpacity="0.3" />
                <stop offset="100%" stopColor={getColor(lastValue)} stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {/* Zone backgrounds */}
            <rect x={padding.left} y={padding.top} width={innerWidth} height={innerHeight * 0.2} fill="#22c55e" opacity="0.1" />
            <rect x={padding.left} y={padding.top + innerHeight * 0.2} width={innerWidth} height={innerHeight * 0.2} fill="#84cc16" opacity="0.1" />
            <rect x={padding.left} y={padding.top + innerHeight * 0.4} width={innerWidth} height={innerHeight * 0.2} fill="#eab308" opacity="0.1" />
            <rect x={padding.left} y={padding.top + innerHeight * 0.6} width={innerWidth} height={innerHeight * 0.2} fill="#f97316" opacity="0.1" />
            <rect x={padding.left} y={padding.top + innerHeight * 0.8} width={innerWidth} height={innerHeight * 0.2} fill="#dc2626" opacity="0.1" />

            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map(val => {
              const y = padding.top + ((100 - val) / 100) * innerHeight;
              return (
                <g key={val}>
                  <line 
                    x1={padding.left} 
                    y1={y} 
                    x2={padding.left + innerWidth} 
                    y2={y} 
                    stroke="#374151" 
                    strokeWidth="0.3" 
                    strokeDasharray="2,2"
                  />
                  <text 
                    x={padding.left - 3} 
                    y={y + 1} 
                    fontSize="3" 
                    fill="#6b7280" 
                    textAnchor="end"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Area fill */}
            <path d={areaD} fill="url(#areaGradient)" />

            {/* Line */}
            <path 
              d={pathD} 
              fill="none" 
              stroke={getColor(lastValue)} 
              strokeWidth="1" 
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Points */}
            {points.map((point, i) => (
              <g key={i}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={hoveredIndex === i ? 2 : 1.2}
                  fill={getColor(point.value)}
                  stroke="#0f172a"
                  strokeWidth="0.5"
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => {
                    setHoveredPoint(point);
                    setHoveredIndex(i);
                  }}
                  onMouseLeave={() => {
                    setHoveredPoint(null);
                    setHoveredIndex(null);
                  }}
                />
              </g>
            ))}

            {/* X-axis labels */}
            {[0, Math.floor(historyData.length / 2), historyData.length - 1].map(i => {
              if (!historyData[i]) return null;
              const x = padding.left + (i / (historyData.length - 1)) * innerWidth;
              return (
                <text 
                  key={i}
                  x={x} 
                  y={chartHeight - 5} 
                  fontSize="2.5" 
                  fill="#6b7280" 
                  textAnchor="middle"
                >
                  {formatDate(historyData[i].date)}
                </text>
              );
            })}
          </svg>

          {/* Hover tooltip */}
          {hoveredPoint && (
            <div 
              className="absolute bg-slate-900/95 border border-slate-600 rounded-lg px-3 py-2 pointer-events-none shadow-xl z-10"
              style={{
                left: `${(hoveredIndex! / (points.length - 1)) * 100}%`,
                top: '10%',
                transform: 'translateX(-50%)'
              }}
            >
              <div className="text-xs text-slate-400">{formatDate(hoveredPoint.date)}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-lg font-bold" style={{ color: getColor(hoveredPoint.value) }}>
                  {hoveredPoint.value}
                </span>
                <span className="text-xs" style={{ color: getColor(hoveredPoint.value) }}>
                  {hoveredPoint.classification}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        {showLegend && (
          <div className="flex flex-wrap items-center justify-center gap-3 mt-4 pt-3 border-t border-slate-700/50">
            {[
              { label: 'Extreme Fear', range: '0-19' },
              { label: 'Fear', range: '20-39' },
              { label: 'Neutral', range: '40-59' },
              { label: 'Greed', range: '60-79' },
              { label: 'Extreme Greed', range: '80-100' },
            ].map(zone => (
              <div key={zone.label} className="flex items-center gap-1.5">
                <div 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ backgroundColor: getZoneColor(zone.label) }}
                />
                <span className="text-[10px] text-slate-400">{zone.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-4 pb-4">
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="text-xs text-slate-500">High</div>
            <div className="text-sm font-semibold text-green-400">
              {Math.max(...historyData.map(d => d.value))}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="text-xs text-slate-500">Low</div>
            <div className="text-sm font-semibold text-red-400">
              {Math.min(...historyData.map(d => d.value))}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="text-xs text-slate-500">Avg</div>
            <div className="text-sm font-semibold text-yellow-400">
              {Math.round(historyData.reduce((a, b) => a + b.value, 0) / historyData.length)}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="text-xs text-slate-500">Change</div>
            <div className={`text-sm font-semibold ${trendChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {trendChange >= 0 ? '+' : ''}{trendChange}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
