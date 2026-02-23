'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import ExplorerActionGrid from '@/components/explorer/ExplorerActionGrid';

interface IntradayBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IntradayData {
  symbol: string;
  interval: string;
  lastRefreshed: string;
  timeZone: string;
  data: IntradayBar[];
}

interface DealerStructure {
  callWall: number | null;
  putWall: number | null;
  gammaFlip: number | null;
  topNodes: Array<{ strike: number; netGexUsd: number }>;
}

interface DealerOverlayData {
  regime: 'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEUTRAL';
  structure: DealerStructure;
  attentionTriggered: boolean;
}

type Interval = '1min' | '5min' | '15min' | '30min' | '60min';

const POPULAR_STOCKS = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'SPY', name: 'S&P 500 ETF' },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF' },
  { symbol: 'AMD', name: 'AMD' },
];

const POPULAR_CRYPTO = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'XRP', name: 'XRP' },
  { symbol: 'DOGE', name: 'Dogecoin' },
  { symbol: 'ADA', name: 'Cardano' },
  { symbol: 'AVAX', name: 'Avalanche' },
  { symbol: 'LINK', name: 'Chainlink' },
  { symbol: 'DOT', name: 'Polkadot' },
  { symbol: 'MATIC', name: 'Polygon' },
];

type AssetType = 'stocks' | 'crypto';

const INTERVALS: { value: Interval; label: string; description: string }[] = [
  { value: '1min', label: '1 Min', description: '1 minute candles' },
  { value: '5min', label: '5 Min', description: '5 minute candles' },
  { value: '15min', label: '15 Min', description: '15 minute candles' },
  { value: '30min', label: '30 Min', description: '30 minute candles' },
  { value: '60min', label: '1 Hour', description: '1 hour candles' },
];

function formatPrice(price: number): string {
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(vol: number): string {
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(2)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
  return vol.toString();
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Calculate EMA (Exponential Moving Average)
function calculateEMA(data: IntradayBar[], period: number): (number | null)[] {
  const multiplier = 2 / (period + 1);
  const emaValues: (number | null)[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      emaValues.push(null);
    } else if (i === period - 1) {
      // First EMA is SMA
      const sum = data.slice(0, period).reduce((acc, bar) => acc + bar.close, 0);
      emaValues.push(sum / period);
    } else {
      const prevEma = emaValues[i - 1]!;
      emaValues.push((data[i].close - prevEma) * multiplier + prevEma);
    }
  }
  return emaValues;
}

// Calculate SMA (Simple Moving Average)
function calculateSMA(data: IntradayBar[], period: number): (number | null)[] {
  const smaValues: (number | null)[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      smaValues.push(null);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((acc, bar) => acc + bar.close, 0);
      smaValues.push(sum / period);
    }
  }
  return smaValues;
}

// Calculate VWAP (Volume Weighted Average Price)
function calculateVWAP(data: IntradayBar[]): number[] {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  return data.map(bar => {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativeTPV += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;
    return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice;
  });
}

// Calculate Bollinger Bands
function calculateBollingerBands(data: IntradayBar[], period: number = 20, stdDev: number = 2): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = calculateSMA(data, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (middle[i] === null) {
      upper.push(null);
      lower.push(null);
    } else {
      const slice = data.slice(i - period + 1, i + 1).map(bar => bar.close);
      const mean = middle[i]!;
      const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
      const std = Math.sqrt(variance);
      upper.push(mean + stdDev * std);
      lower.push(mean - stdDev * std);
    }
  }
  
  return { upper, middle, lower };
}

type IndicatorType = 'ema9' | 'ema21' | 'sma20' | 'sma50' | 'vwap' | 'bollinger';

// Candlestick Chart Component
function CandlestickChart({ 
  data, 
  width = 800, 
  height = 400,
  onHover,
  indicators = [],
  dealerOverlay = null,
}: { 
  data: IntradayBar[]; 
  width?: number; 
  height?: number;
  onHover?: (bar: IntradayBar | null) => void;
  indicators?: IndicatorType[];
  dealerOverlay?: DealerOverlayData | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data || data.length < 2) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-800/50 rounded-lg border border-slate-700">
        <p className="text-gray-400">Not enough data to display chart</p>
      </div>
    );
  }

  // Calculate indicator data
  const indicatorData: Record<string, (number | null)[]> = {};
  let bollingerBands: { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } | null = null;
  
  if (indicators.includes('ema9')) indicatorData.ema9 = calculateEMA(data, 9);
  if (indicators.includes('ema21')) indicatorData.ema21 = calculateEMA(data, 21);
  if (indicators.includes('sma20')) indicatorData.sma20 = calculateSMA(data, 20);
  if (indicators.includes('sma50')) indicatorData.sma50 = calculateSMA(data, 50);
  if (indicators.includes('vwap')) indicatorData.vwap = calculateVWAP(data);
  if (indicators.includes('bollinger')) bollingerBands = calculateBollingerBands(data, 20, 2);

  const padding = { top: 20, right: 60, bottom: 40, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  // Calculate price range (include indicator values)
  let allPrices = data.flatMap(d => [d.high, d.low]);
  Object.values(indicatorData).forEach(vals => {
    vals.forEach(v => { if (v !== null) allPrices.push(v); });
  });
  if (bollingerBands) {
    bollingerBands.upper.forEach(v => { if (v !== null) allPrices.push(v); });
    bollingerBands.lower.forEach(v => { if (v !== null) allPrices.push(v); });
  }
  
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceRange = maxPrice - minPrice || 1;
  const pricePadding = priceRange * 0.05;
  const adjustedMin = minPrice - pricePadding;
  const adjustedMax = maxPrice + pricePadding;
  const adjustedRange = adjustedMax - adjustedMin;

  // Calculate bar width
  const barWidth = Math.max(1, Math.min(12, (chartWidth / data.length) * 0.8));
  const barGap = Math.max(1, (chartWidth / data.length) * 0.2);

  // Scale functions
  const scaleX = (index: number) => padding.left + (index * (barWidth + barGap)) + barWidth / 2;
  const scaleY = (price: number) => padding.top + chartHeight - ((price - adjustedMin) / adjustedRange) * chartHeight;

  // Generate price grid lines
  const priceGridCount = 5;
  const priceStep = adjustedRange / priceGridCount;
  const priceGridLines = Array.from({ length: priceGridCount + 1 }, (_, i) => adjustedMin + i * priceStep);

  // Generate time labels
  const labelInterval = Math.max(1, Math.floor(data.length / 8));
  const timeLabels = data.filter((_, i) => i % labelInterval === 0);
  const latestPrice = data[data.length - 1]?.close || 0;
  const dealerLines = dealerOverlay ? [
    {
      key: 'call-wall',
      level: dealerOverlay.structure.callWall,
      label: 'Dealer Call Wall',
      color: '#22c55e',
      dashed: false,
    },
    {
      key: 'put-wall',
      level: dealerOverlay.structure.putWall,
      label: 'Dealer Put Wall',
      color: '#ef4444',
      dashed: false,
    },
    {
      key: 'gamma-flip',
      level: dealerOverlay.structure.gammaFlip,
      label: 'Gamma Flip',
      color: '#38bdf8',
      dashed: true,
    },
  ].filter((line): line is { key: string; level: number; label: string; color: string; dashed: boolean } => Number.isFinite(line.level)) : [];

  return (
    <div className="relative">
      <svg 
        ref={svgRef}
        width="100%" 
        height={height} 
        viewBox={`0 0 ${width} ${height}`}
        className="block"
        onMouseLeave={() => {
          setHoveredIndex(null);
          onHover?.(null);
        }}
      >
        {/* Background */}
        <rect 
          x={padding.left} 
          y={padding.top} 
          width={chartWidth} 
          height={chartHeight} 
          fill="#1e293b" 
          rx="4"
        />

        {/* Price grid lines */}
        {priceGridLines.map((price, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              y1={scaleY(price)}
              x2={width - padding.right}
              y2={scaleY(price)}
              stroke="#334155"
              strokeWidth="1"
              strokeDasharray="4,4"
            />
            <text
              x={width - padding.right + 5}
              y={scaleY(price) + 4}
              fill="#94a3b8"
              fontSize="10"
            >
              ${formatPrice(price)}
            </text>
          </g>
        ))}

        {/* Dealer Structure Lines (Operator-centric overlay) */}
        {dealerLines.map((line) => {
          const y = scaleY(line.level);
          const distancePct = latestPrice > 0 ? Math.abs(latestPrice - line.level) / latestPrice : 1;
          const isNear = distancePct <= 0.005;

          return (
            <g key={line.key}>
              {isNear && (
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke={line.color}
                  strokeWidth="6"
                  opacity="0.18"
                />
              )}
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke={line.color}
                strokeWidth={isNear ? '2' : '1.2'}
                strokeDasharray={line.dashed ? '4,4' : undefined}
                opacity={isNear ? '0.95' : '0.7'}
              />
              <text
                x={padding.left + 8}
                y={y - 6}
                fill={line.color}
                fontSize="10"
                fontWeight="700"
              >
                {line.label} {formatPrice(line.level)}
              </text>
            </g>
          );
        })}

        {/* Time labels */}
        {timeLabels.map((bar, i) => {
          const index = data.indexOf(bar);
          return (
            <text
              key={i}
              x={scaleX(index)}
              y={height - 10}
              fill="#94a3b8"
              fontSize="10"
              textAnchor="middle"
            >
              {formatTime(bar.timestamp)}
            </text>
          );
        })}

        {/* Bollinger Bands (drawn first so they're behind candles) */}
        {bollingerBands && (
          <>
            {/* Upper band fill area */}
            <path
              d={`M ${data.map((_, i) => {
                const upper = bollingerBands!.upper[i];
                const lower = bollingerBands!.lower[i];
                if (upper === null || lower === null) return '';
                return `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(upper)}`;
              }).join(' ')} ${data.map((_, i) => {
                const lower = bollingerBands!.lower[data.length - 1 - i];
                if (lower === null) return '';
                return `L ${scaleX(data.length - 1 - i)} ${scaleY(lower)}`;
              }).join(' ')} Z`}
              fill="rgba(156, 163, 175, 0.1)"
            />
            {/* Upper band line */}
            <polyline
              points={data.map((_, i) => {
                const val = bollingerBands!.upper[i];
                if (val === null) return '';
                return `${scaleX(i)},${scaleY(val)}`;
              }).filter(Boolean).join(' ')}
              fill="none"
              stroke="#9ca3af"
              strokeWidth="1"
              strokeDasharray="3,3"
              opacity="0.7"
            />
            {/* Lower band line */}
            <polyline
              points={data.map((_, i) => {
                const val = bollingerBands!.lower[i];
                if (val === null) return '';
                return `${scaleX(i)},${scaleY(val)}`;
              }).filter(Boolean).join(' ')}
              fill="none"
              stroke="#9ca3af"
              strokeWidth="1"
              strokeDasharray="3,3"
              opacity="0.7"
            />
          </>
        )}

        {/* Candlesticks */}
        {data.map((bar, i) => {
          const x = scaleX(i);
          const isUp = bar.close >= bar.open;
          const color = isUp ? '#22c55e' : '#ef4444';
          const bodyTop = scaleY(Math.max(bar.open, bar.close));
          const bodyBottom = scaleY(Math.min(bar.open, bar.close));
          const bodyHeight = Math.max(1, bodyBottom - bodyTop);
          const isHovered = hoveredIndex === i;

          return (
            <g 
              key={i}
              onMouseEnter={() => {
                setHoveredIndex(i);
                onHover?.(bar);
              }}
              style={{ cursor: 'crosshair' }}
            >
              {/* Wick */}
              <line
                x1={x}
                y1={scaleY(bar.high)}
                x2={x}
                y2={scaleY(bar.low)}
                stroke={color}
                strokeWidth={isHovered ? 2 : 1}
              />
              {/* Body */}
              <rect
                x={x - barWidth / 2}
                y={bodyTop}
                width={barWidth}
                height={bodyHeight}
                fill={isUp ? color : color}
                stroke={isHovered ? '#fff' : color}
                strokeWidth={isHovered ? 2 : 1}
                rx="1"
              />
            </g>
          );
        })}

        {/* Indicator Overlays */}
        {/* EMA 9 - Yellow */}
        {indicatorData.ema9 && (
          <polyline
            points={data.map((_, i) => {
              const val = indicatorData.ema9[i];
              if (val === null) return '';
              return `${scaleX(i)},${scaleY(val)}`;
            }).filter(Boolean).join(' ')}
            fill="none"
            stroke="#facc15"
            strokeWidth="1.5"
          />
        )}

        {/* EMA 21 - Orange */}
        {indicatorData.ema21 && (
          <polyline
            points={data.map((_, i) => {
              const val = indicatorData.ema21[i];
              if (val === null) return '';
              return `${scaleX(i)},${scaleY(val)}`;
            }).filter(Boolean).join(' ')}
            fill="none"
            stroke="#f97316"
            strokeWidth="1.5"
          />
        )}

        {/* SMA 20 - Blue */}
        {indicatorData.sma20 && (
          <polyline
            points={data.map((_, i) => {
              const val = indicatorData.sma20[i];
              if (val === null) return '';
              return `${scaleX(i)},${scaleY(val)}`;
            }).filter(Boolean).join(' ')}
            fill="none"
            stroke="var(--msp-accent)"
            strokeWidth="1.5"
          />
        )}

        {/* SMA 50 - Cyan */}
        {indicatorData.sma50 && (
          <polyline
            points={data.map((_, i) => {
              const val = indicatorData.sma50[i];
              if (val === null) return '';
              return `${scaleX(i)},${scaleY(val)}`;
            }).filter(Boolean).join(' ')}
            fill="none"
            stroke="var(--msp-accent)"
            strokeWidth="1.5"
          />
        )}

        {/* VWAP - Purple */}
        {indicatorData.vwap && (
          <polyline
            points={data.map((_, i) => {
              const val = indicatorData.vwap[i];
              if (val === null) return '';
              return `${scaleX(i)},${scaleY(val)}`;
            }).filter(Boolean).join(' ')}
            fill="none"
            stroke="#a855f7"
            strokeWidth="2"
          />
        )}

        {/* Hover line */}
        {hoveredIndex !== null && (
          <>
            <line
              x1={scaleX(hoveredIndex)}
              y1={padding.top}
              x2={scaleX(hoveredIndex)}
              y2={padding.top + chartHeight}
              stroke="#ffffff"
              strokeWidth="1"
              strokeDasharray="4,4"
              opacity="0.5"
            />
            <line
              x1={padding.left}
              y1={scaleY(data[hoveredIndex].close)}
              x2={width - padding.right}
              y2={scaleY(data[hoveredIndex].close)}
              stroke="#ffffff"
              strokeWidth="1"
              strokeDasharray="4,4"
              opacity="0.5"
            />
          </>
        )}
      </svg>
    </div>
  );
}

// Volume Chart Component
function VolumeChart({ data, width = 800, height = 80 }: { data: IntradayBar[]; width?: number; height?: number }) {
  if (!data || data.length < 2) return null;

  const padding = { left: 10, right: 60, top: 5, bottom: 5 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const maxVolume = Math.max(1, ...data.map(d => d.volume));
  const barWidth = Math.max(1, Math.min(12, (chartWidth / data.length) * 0.8));
  const barGap = Math.max(1, (chartWidth / data.length) * 0.2);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <rect x={padding.left} y={padding.top} width={chartWidth} height={chartHeight} fill="#1e293b" rx="4" />
      {data.map((bar, i) => {
        const x = padding.left + (i * (barWidth + barGap));
        const isUp = bar.close >= bar.open;
        const barHeight = (bar.volume / maxVolume) * chartHeight;
        return (
          <rect
            key={i}
            x={x}
            y={padding.top + chartHeight - barHeight}
            width={barWidth}
            height={barHeight}
            fill={isUp ? '#22c55e' : '#ef4444'}
            opacity="0.6"
            rx="1"
          />
        );
      })}
      <text x={width - padding.right + 5} y={padding.top + 12} fill="#94a3b8" fontSize="10">
        Vol
      </text>
    </svg>
  );
}

export default function IntradayChartsPage() {
  const [symbol, setSymbol] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [interval, setInterval] = useState<Interval>('5min');
  const [data, setData] = useState<IntradayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<IntradayBar | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [assetType, setAssetType] = useState<AssetType>('stocks');
  const [isCrypto, setIsCrypto] = useState(false);
  const [indicators, setIndicators] = useState<IndicatorType[]>([]);
  const [dealerOverlay, setDealerOverlay] = useState<DealerOverlayData | null>(null);

  const toggleIndicator = (ind: IndicatorType) => {
    setIndicators(prev => 
      prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]
    );
  };

  const fetchDealerOverlay = useCallback(async (sym: string, int: Interval) => {
    const scanModeMap: Record<Interval, string> = {
      '1min': 'scalping',
      '5min': 'intraday_30m',
      '15min': 'intraday_1h',
      '30min': 'intraday_4h',
      '60min': 'swing_1d',
    };

    try {
      const response = await fetch(
        `/api/options/gex?symbol=${encodeURIComponent(sym)}&scanMode=${encodeURIComponent(scanModeMap[int])}`
      );
      if (!response.ok) { setDealerOverlay(null); return; }
      const payload = await response.json();
      if (!payload?.success) {
        setDealerOverlay(null);
        return;
      }

      setDealerOverlay({
        regime: payload.data?.dealerGamma?.regime || 'NEUTRAL',
        structure: payload.data?.dealerIntelligence?.dealerStructure || {
          callWall: null,
          putWall: null,
          gammaFlip: null,
          topNodes: [],
        },
        attentionTriggered: Boolean(payload.data?.dealerIntelligence?.attention?.triggered),
      });
    } catch {
      setDealerOverlay(null);
    }
  }, []);

  const fetchData = useCallback(async (sym: string, int: Interval, includeDealer = true) => {
    if (!sym) return;
    
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/intraday?symbol=${encodeURIComponent(sym)}&interval=${int}&outputsize=compact&extended_hours=true`
      );

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Failed to fetch data');
      }
      const result = await response.json();

      setData(result);
      setSymbol(sym);
      setIsCrypto(result.isCrypto || false);
      if (includeDealer && !(result.isCrypto || false)) {
        await fetchDealerOverlay(sym, int);
      }
      if (result.isCrypto) {
        setDealerOverlay(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch intraday data');
      setData(null);
      setDealerOverlay(null);
    } finally {
      setLoading(false);
    }
  }, [fetchDealerOverlay]);

  // Initial load with a popular stock
  useEffect(() => {
    fetchData('AAPL', '5min');
  }, [fetchData]);

  // Auto-refresh every 60 seconds if enabled
  useEffect(() => {
    if (!autoRefresh || !symbol) return;
    const timer = window.setInterval(() => {
      fetchData(symbol, interval, false);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, symbol, interval, fetchData]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      fetchData(searchInput.trim().toUpperCase(), interval);
    }
  };

  const handleIntervalChange = (newInterval: Interval) => {
    setInterval(newInterval);
    if (symbol) {
      fetchData(symbol, newInterval);
    }
  };

  // Calculate stats
  const stats = data?.data?.length ? (() => {
    const bars = data.data;
    const first = bars[0];
    const last = bars[bars.length - 1];
    const change = last.close - first.open;
    const changePercent = first.open !== 0 ? (change / first.open) * 100 : 0;
    const high = Math.max(...bars.map(b => b.high));
    const low = Math.min(...bars.map(b => b.low));
    const totalVolume = bars.reduce((sum, b) => sum + b.volume, 0);
    const avgVolume = bars.length > 0 ? totalVolume / bars.length : 0;
    const vwap = totalVolume > 0 ? bars.reduce((sum, b) => sum + ((b.high + b.low + b.close) / 3) * b.volume, 0) / totalVolume : last.close;

    return { first, last, change, changePercent, high, low, totalVolume, avgVolume, vwap };
  })() : null;

  const rangePercent = stats
    ? ((stats.high - stats.low) / Math.max(stats.last.close, 1)) * 100
    : 0;

  const volatilityState = rangePercent >= 3 ? 'Expansion' : rangePercent >= 1.5 ? 'Normal' : 'Compression';
  const liquidityState = !stats ? 'Unknown' : stats.avgVolume >= 500000 ? 'Strong' : stats.avgVolume >= 100000 ? 'Stable' : 'Thin';
  const dealerState = dealerOverlay
    ? dealerOverlay.regime === 'LONG_GAMMA'
      ? 'Supportive'
      : dealerOverlay.regime === 'SHORT_GAMMA'
        ? 'Hostile'
        : 'Neutral'
    : 'Unavailable';

  const permissionState: 'Yes' | 'Conditional' | 'No' = !stats
    ? 'Conditional'
    : dealerOverlay?.regime === 'SHORT_GAMMA' && volatilityState === 'Expansion'
      ? 'No'
      : dealerOverlay?.regime === 'LONG_GAMMA' && volatilityState !== 'Expansion' && liquidityState !== 'Thin'
        ? 'Yes'
        : 'Conditional';

  const permissionReason = permissionState === 'Yes'
    ? 'Structure supports intraday execution.'
    : permissionState === 'No'
      ? 'Short-gamma expansion risk is elevated.'
      : 'Mixed structure. Size down and wait for confirmation.';

  const playbook = permissionState === 'Yes'
    ? 'Trend continuation on pullback to VWAP/EMA cluster.'
    : permissionState === 'No'
      ? 'Stand down or hedge only. Avoid fresh directional risk.'
      : 'Wait for reclaim/reject at VWAP before committing.';

  const blockedActionReason = permissionState === 'No' ? 'Execution blocked by session risk state' : '';

  return (
    <div className="min-h-screen bg-[var(--msp-bg)] text-white">
      <main className="mx-auto w-full max-w-none space-y-2 px-2 pb-6 pt-3 md:px-3">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 bg-slate-900 p-2">
          <div className="text-xs text-slate-400 uppercase tracking-wide">Intraday Console</div>
          <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white">
            ← Dashboard
          </Link>
        </div>

        {stats && (
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
            <div className="grid gap-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Permission To Trade</div>
                <div className={`mt-1 text-lg font-semibold ${
                  permissionState === 'Yes' ? 'text-emerald-400' : permissionState === 'No' ? 'text-rose-400' : 'text-amber-300'
                }`}>
                  {permissionState}
                </div>
                <div className="mt-1 text-xs text-slate-400">{permissionReason}</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Volatility</div>
                <div className={`mt-1 text-lg font-semibold ${
                  volatilityState === 'Expansion' ? 'text-rose-300' : volatilityState === 'Compression' ? 'text-emerald-300' : 'text-slate-200'
                }`}>
                  {volatilityState}
                </div>
                <div className="mt-1 text-xs text-slate-400">Session range {rangePercent.toFixed(2)}%</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Dealer Context</div>
                <div className={`mt-1 text-lg font-semibold ${
                  dealerState === 'Supportive' ? 'text-emerald-300' : dealerState === 'Hostile' ? 'text-rose-300' : 'text-slate-200'
                }`}>
                  {dealerState}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {dealerOverlay
                    ? `Flip ${dealerOverlay.structure.gammaFlip ? `$${formatPrice(dealerOverlay.structure.gammaFlip)}` : 'N/A'}`
                    : 'Overlay unavailable'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Recommended Playbook</div>
                <div className="mt-1 text-xs text-slate-100 leading-5">{playbook}</div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg bg-slate-800 p-1">
                <button
                  onClick={() => {
                    setAssetType('stocks');
                    fetchData('AAPL', interval);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    assetType === 'stocks'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  Stocks
                </button>
                <button
                  onClick={() => {
                    setAssetType('crypto');
                    fetchData('BTC', interval);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    assetType === 'crypto'
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  Crypto
                </button>
              </div>
              {assetType === 'crypto' && (
                <span className="text-xs text-orange-300 bg-orange-500/20 px-2 py-1 rounded">24/7</span>
              )}
            </div>

            <form onSubmit={handleSearch} className="flex w-full max-w-xl gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                placeholder={assetType === 'crypto' ? 'Symbol (e.g., BTC)' : 'Symbol (e.g., AAPL)'}
                className="h-10 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium transition hover:bg-emerald-700 disabled:bg-slate-700"
              >
                {loading ? 'Loading...' : 'Load'}
              </button>
            </form>
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {(assetType === 'stocks' ? POPULAR_STOCKS : POPULAR_CRYPTO).slice(0, 8).map((item) => (
              <button
                key={item.symbol}
                onClick={() => {
                  setSearchInput(item.symbol);
                  fetchData(item.symbol, interval);
                }}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                  symbol === item.symbol
                    ? assetType === 'crypto'
                      ? 'border-orange-400 bg-orange-500/10 text-orange-200'
                      : 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {item.symbol}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-400">Finding intraday setup data...</p>
          </div>
        )}

        {data && stats && (
          <div className="grid gap-2 xl:grid-cols-3">
            <div className="xl:col-span-2 space-y-2">
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">{data.symbol}</div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-semibold">${formatPrice(stats.last.close)}</h2>
                      <span className={`text-sm ${stats.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stats.change >= 0 ? '▲' : '▼'} {stats.changePercent >= 0 ? '+' : ''}{stats.changePercent.toFixed(2)}%
                      </span>
                      <span className="text-xs text-slate-400">{data.data.length} bars</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
                      {INTERVALS.map((int) => (
                        <button
                          key={int.value}
                          onClick={() => handleIntervalChange(int.value)}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                            interval === int.value
                              ? 'bg-emerald-600 text-white'
                              : 'text-gray-400 hover:bg-slate-700 hover:text-white'
                          }`}
                          title={int.description}
                        >
                          {int.label}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-400">
                      <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-600 focus:ring-emerald-500"
                      />
                      Auto 60s
                    </label>
                  </div>
                </div>

                <div className="mb-1 flex flex-wrap items-center gap-2 border-t border-slate-700 pt-2">
                  <span className="mr-1 text-xs text-gray-400">Overlays</span>
                  <button
                    onClick={() => toggleIndicator('ema9')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      indicators.includes('ema9')
                        ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                        : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                    }`}
                  >
                    EMA 9
                  </button>
                  <button
                    onClick={() => toggleIndicator('ema21')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      indicators.includes('ema21')
                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50'
                        : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                    }`}
                  >
                    EMA 21
                  </button>
                  <button
                    onClick={() => toggleIndicator('sma20')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      indicators.includes('sma20')
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                        : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                    }`}
                  >
                    SMA 20
                  </button>
                  <button
                    onClick={() => toggleIndicator('sma50')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      indicators.includes('sma50')
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                        : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                    }`}
                  >
                    SMA 50
                  </button>
                  <button
                    onClick={() => toggleIndicator('vwap')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      indicators.includes('vwap')
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                        : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                    }`}
                  >
                    VWAP
                  </button>
                  <button
                    onClick={() => toggleIndicator('bollinger')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      indicators.includes('bollinger')
                        ? 'bg-gray-500/20 text-gray-300 border border-gray-500/50'
                        : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                    }`}
                  >
                    Bollinger
                  </button>
                  {indicators.length > 0 && (
                    <button
                      onClick={() => setIndicators([])}
                      className="ml-1 px-2 py-1 text-xs text-gray-500 hover:text-red-400 transition"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto pt-1">
                  <CandlestickChart
                    data={data.data}
                    width={Math.max(800, data.data.length * 8)}
                    height={360}
                    onHover={setHoveredBar}
                    indicators={indicators}
                    dealerOverlay={dealerOverlay}
                  />
                </div>
                <div className="mt-2 overflow-x-auto">
                  <VolumeChart
                    data={data.data}
                    width={Math.max(800, data.data.length * 8)}
                    height={76}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 xl:sticky xl:top-20 self-start">
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Execution Context</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-slate-700 bg-slate-800/60 p-2">
                    <div className="text-slate-400">VWAP</div>
                    <div className="text-slate-100">${formatPrice(stats.vwap)}</div>
                  </div>
                  <div className="rounded border border-slate-700 bg-slate-800/60 p-2">
                    <div className="text-slate-400">Range</div>
                    <div className="text-slate-100">${formatPrice(stats.high - stats.low)}</div>
                  </div>
                  <div className="rounded border border-slate-700 bg-slate-800/60 p-2">
                    <div className="text-slate-400">Session High</div>
                    <div className="text-emerald-300">${formatPrice(stats.high)}</div>
                  </div>
                  <div className="rounded border border-slate-700 bg-slate-800/60 p-2">
                    <div className="text-slate-400">Session Low</div>
                    <div className="text-rose-300">${formatPrice(stats.low)}</div>
                  </div>
                  <div className="rounded border border-slate-700 bg-slate-800/60 p-2">
                    <div className="text-slate-400">Avg Bar Volume</div>
                    <div className="text-slate-100">{formatVolume(stats.avgVolume)}</div>
                  </div>
                  <div className="rounded border border-slate-700 bg-slate-800/60 p-2">
                    <div className="text-slate-400">Liquidity</div>
                    <div className="text-slate-100">{liquidityState}</div>
                  </div>
                </div>

                {dealerOverlay && (
                  <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-xs text-slate-300">
                    <div className="font-medium text-slate-200">Dealer Structure</div>
                    <div className="mt-1">
                      Regime {dealerOverlay.regime === 'LONG_GAMMA' ? 'Long Gamma' : dealerOverlay.regime === 'SHORT_GAMMA' ? 'Short Gamma' : 'Neutral'}
                    </div>
                    <div className="mt-1 text-slate-400">
                      Flip {dealerOverlay.structure.gammaFlip ? `$${formatPrice(dealerOverlay.structure.gammaFlip)}` : 'N/A'} •
                      Call Wall {dealerOverlay.structure.callWall ? `$${formatPrice(dealerOverlay.structure.callWall)}` : 'N/A'} •
                      Put Wall {dealerOverlay.structure.putWall ? `$${formatPrice(dealerOverlay.structure.putWall)}` : 'N/A'}
                    </div>
                    {dealerOverlay.attentionTriggered && (
                      <div className="mt-1 text-amber-300">Attention: inflection zone near spot.</div>
                    )}
                  </div>
                )}

                {hoveredBar && (
                  <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-xs">
                    <div className="mb-1 text-slate-400">{formatTime(hoveredBar.timestamp)} • {formatDate(hoveredBar.timestamp)}</div>
                    <div className="grid grid-cols-2 gap-2 text-slate-100 md:grid-cols-4">
                      <div>O ${formatPrice(hoveredBar.open)}</div>
                      <div className="text-emerald-300">H ${formatPrice(hoveredBar.high)}</div>
                      <div className="text-rose-300">L ${formatPrice(hoveredBar.low)}</div>
                      <div className={hoveredBar.close >= hoveredBar.open ? 'text-emerald-300' : 'text-rose-300'}>
                        C ${formatPrice(hoveredBar.close)}
                      </div>
                    </div>
                    <div className="mt-1 text-slate-400">Volume {formatVolume(hoveredBar.volume)}</div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Execution Actions</div>
                <ExplorerActionGrid
                  assetType={assetType === 'crypto' ? 'crypto' : 'equity'}
                  symbol={symbol}
                  blocked={permissionState === 'No'}
                  blockReason={blockedActionReason}
                />
                <div className="mt-2 text-[11px] text-slate-400">
                  Last refresh {new Date(data.lastRefreshed).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )}

        <details className="rounded-lg border border-slate-700 bg-slate-900 p-2">
          <summary className="cursor-pointer list-none text-sm font-medium text-slate-200">
            Help & methodology
          </summary>
          <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm text-gray-400">
            <div>
              <div className="mb-2 font-medium text-white">Candlestick basics</div>
              <ul className="space-y-1">
                <li>• Green candles close above open.</li>
                <li>• Red candles close below open.</li>
                <li>• Wicks represent intrabar high and low.</li>
                <li>• VWAP and moving averages frame entries.</li>
              </ul>
            </div>
            <div>
              <div className="mb-2 font-medium text-white">Intervals</div>
              <ul className="space-y-1">
                <li>• 1m for high-frequency reads.</li>
                <li>• 5m for standard day-trade setups.</li>
                <li>• 15m for slower intraday structure.</li>
                <li>• 30m and 60m for higher-timeframe bias.</li>
              </ul>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Data from Alpha Vantage. Auto-refresh checks every 60 seconds when enabled.
          </p>
        </details>
      </main>
    </div>
  );
}
