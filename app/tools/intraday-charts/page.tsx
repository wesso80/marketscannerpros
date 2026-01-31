'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

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
  indicators = []
}: { 
  data: IntradayBar[]; 
  width?: number; 
  height?: number;
  onHover?: (bar: IntradayBar | null) => void;
  indicators?: IndicatorType[];
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
            stroke="#3b82f6"
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
            stroke="#06b6d4"
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
  
  const maxVolume = Math.max(...data.map(d => d.volume));
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

  const toggleIndicator = (ind: IndicatorType) => {
    setIndicators(prev => 
      prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]
    );
  };

  const fetchData = useCallback(async (sym: string, int: Interval) => {
    if (!sym) return;
    
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/intraday?symbol=${encodeURIComponent(sym)}&interval=${int}&outputsize=compact&extended_hours=true`
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      setData(result);
      setSymbol(sym);
      setIsCrypto(result.isCrypto || false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch intraday data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load with a popular stock
  useEffect(() => {
    fetchData('AAPL', '5min');
  }, [fetchData]);

  // Auto-refresh every 60 seconds if enabled
  useEffect(() => {
    if (!autoRefresh || !symbol) return;
    const timer = window.setInterval(() => {
      fetchData(symbol, interval);
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
  const stats = data?.data ? (() => {
    const bars = data.data;
    const first = bars[0];
    const last = bars[bars.length - 1];
    const change = last.close - first.open;
    const changePercent = (change / first.open) * 100;
    const high = Math.max(...bars.map(b => b.high));
    const low = Math.min(...bars.map(b => b.low));
    const totalVolume = bars.reduce((sum, b) => sum + b.volume, 0);
    const avgVolume = totalVolume / bars.length;
    const vwap = bars.reduce((sum, b) => sum + ((b.high + b.low + b.close) / 3) * b.volume, 0) / totalVolume;

    return { first, last, change, changePercent, high, low, totalVolume, avgVolume, vwap };
  })() : null;

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0F172A]/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-gray-400 hover:text-white">
                ← Dashboard
              </Link>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                📈 Intraday Charts
                <span className={`text-sm font-normal px-2 py-0.5 rounded ${
                  isCrypto 
                    ? 'text-orange-400 bg-orange-500/20' 
                    : 'text-emerald-400 bg-emerald-500/20'
                }`}>
                  {isCrypto ? '₿ Crypto' : 'Real-Time'}
                </span>
              </h1>
            </div>

            {/* Search */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                placeholder="Enter symbol (e.g., AAPL)"
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none w-48"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 rounded-lg font-medium transition"
              >
                {loading ? '...' : 'Load'}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Asset Type Toggle */}
        <div className="mb-4 flex items-center gap-4">
          <div className="flex bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => {
                setAssetType('stocks');
                fetchData('AAPL', interval);
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                assetType === 'stocks'
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              📈 Stocks
            </button>
            <button
              onClick={() => {
                setAssetType('crypto');
                fetchData('BTC', interval);
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                assetType === 'crypto'
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              ₿ Crypto
            </button>
          </div>
          {assetType === 'crypto' && (
            <span className="text-xs text-orange-400 bg-orange-500/20 px-2 py-1 rounded">
              24/7 Trading
            </span>
          )}
        </div>

        {/* Quick Picks */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            {(assetType === 'stocks' ? POPULAR_STOCKS : POPULAR_CRYPTO).map((item) => (
              <button
                key={item.symbol}
                onClick={() => {
                  setSearchInput(item.symbol);
                  fetchData(item.symbol, interval);
                }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                  symbol === item.symbol
                    ? assetType === 'crypto' ? 'bg-orange-500 text-white' : 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
                }`}
              >
                {item.symbol}
              </button>
            ))}
          </div>
        </div>

        {/* Interval Selector */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <span className="text-gray-400">Interval:</span>
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            {INTERVALS.map((int) => (
              <button
                key={int.value}
                onClick={() => handleIntervalChange(int.value)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                  interval === int.value
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-slate-700'
                }`}
                title={int.description}
              >
                {int.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 ml-auto text-sm text-gray-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-600 focus:ring-emerald-500"
            />
            Auto-refresh (60s)
          </label>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-400">Loading intraday data...</p>
          </div>
        )}

        {/* Chart Section */}
        {data && stats && (
          <>
            {/* Symbol Header */}
            <div className="mb-6 bg-slate-800/50 rounded-xl p-6 border border-slate-700">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold flex items-center gap-3">
                    {data.symbol}
                    <span className={`text-2xl ${stats.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${formatPrice(stats.last.close)}
                    </span>
                  </h2>
                  <div className="flex items-center gap-4 mt-1 text-sm">
                    <span className={stats.change >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {stats.change >= 0 ? '▲' : '▼'} ${formatPrice(Math.abs(stats.change))} ({stats.changePercent >= 0 ? '+' : ''}{stats.changePercent.toFixed(2)}%)
                    </span>
                    <span className="text-gray-400">
                      {data.interval} • {data.data.length} bars
                    </span>
                    <span className="text-gray-500">
                      Last: {new Date(data.lastRefreshed).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* OHLC for hovered bar */}
                {hoveredBar && (
                  <div className="bg-slate-900/80 backdrop-blur rounded-lg px-4 py-2 text-sm">
                    <div className="text-gray-400 mb-1">{formatTime(hoveredBar.timestamp)} • {formatDate(hoveredBar.timestamp)}</div>
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <span className="text-gray-500">O</span>
                        <span className="ml-1">${formatPrice(hoveredBar.open)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">H</span>
                        <span className="ml-1 text-green-400">${formatPrice(hoveredBar.high)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">L</span>
                        <span className="ml-1 text-red-400">${formatPrice(hoveredBar.low)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">C</span>
                        <span className={`ml-1 ${hoveredBar.close >= hoveredBar.open ? 'text-green-400' : 'text-red-400'}`}>
                          ${formatPrice(hoveredBar.close)}
                        </span>
                      </div>
                    </div>
                    <div className="text-gray-400 mt-1">
                      Vol: {formatVolume(hoveredBar.volume)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Candlestick Chart */}
            <div className="mb-2 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
              {/* Indicator Toggles */}
              <div className="px-4 py-3 border-b border-slate-700 flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-400 mr-2">Overlays:</span>
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
                    className="ml-2 px-2 py-1 text-xs text-gray-500 hover:text-red-400 transition"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="p-4 overflow-x-auto">
                <CandlestickChart 
                  data={data.data} 
                  width={Math.max(800, data.data.length * 8)} 
                  height={400}
                  onHover={setHoveredBar}
                  indicators={indicators}
                />
              </div>
            </div>

            {/* Volume Chart */}
            <div className="mb-6 bg-slate-800/50 rounded-xl p-4 border border-slate-700 overflow-x-auto">
              <VolumeChart 
                data={data.data} 
                width={Math.max(800, data.data.length * 8)} 
                height={80} 
              />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-gray-400 text-sm">Session High</div>
                <div className="text-xl font-semibold text-green-400">${formatPrice(stats.high)}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-gray-400 text-sm">Session Low</div>
                <div className="text-xl font-semibold text-red-400">${formatPrice(stats.low)}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-gray-400 text-sm">VWAP</div>
                <div className="text-xl font-semibold text-blue-400">${formatPrice(stats.vwap)}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-gray-400 text-sm">Total Volume</div>
                <div className="text-xl font-semibold">{formatVolume(stats.totalVolume)}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-gray-400 text-sm">Avg Volume/Bar</div>
                <div className="text-xl font-semibold">{formatVolume(stats.avgVolume)}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-gray-400 text-sm">Range</div>
                <div className="text-xl font-semibold">${formatPrice(stats.high - stats.low)}</div>
              </div>
            </div>

            {/* Data Table */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700">
                <h3 className="font-semibold">Recent Bars (Latest 20)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-900/50">
                      <th className="text-left px-4 py-2 text-gray-400 font-medium">Time</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-medium">Open</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-medium">High</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-medium">Low</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-medium">Close</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-medium">Volume</th>
                      <th className="text-right px-4 py-2 text-gray-400 font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.slice(-20).reverse().map((bar, i) => {
                      const change = bar.close - bar.open;
                      const changePercent = (change / bar.open) * 100;
                      const isUp = change >= 0;
                      return (
                        <tr 
                          key={i} 
                          className="border-t border-slate-700/50 hover:bg-slate-700/30 transition"
                        >
                          <td className="px-4 py-2 text-gray-300">
                            {formatTime(bar.timestamp)} <span className="text-gray-500">{formatDate(bar.timestamp)}</span>
                          </td>
                          <td className="text-right px-4 py-2">${formatPrice(bar.open)}</td>
                          <td className="text-right px-4 py-2 text-green-400">${formatPrice(bar.high)}</td>
                          <td className="text-right px-4 py-2 text-red-400">${formatPrice(bar.low)}</td>
                          <td className={`text-right px-4 py-2 font-medium ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                            ${formatPrice(bar.close)}
                          </td>
                          <td className="text-right px-4 py-2 text-gray-400">{formatVolume(bar.volume)}</td>
                          <td className={`text-right px-4 py-2 ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                            {isUp ? '+' : ''}{changePercent.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Help Section */}
        <div className="mt-8 bg-slate-800/30 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">📊 About Intraday Charts</h3>
          <div className="grid md:grid-cols-2 gap-6 text-sm text-gray-400">
            <div>
              <h4 className="text-white font-medium mb-2">Candlestick Basics</h4>
              <ul className="space-y-1">
                <li>• <span className="text-green-400">Green candles</span> = Close higher than Open (bullish)</li>
                <li>• <span className="text-red-400">Red candles</span> = Close lower than Open (bearish)</li>
                <li>• The body shows Open-Close range</li>
                <li>• Wicks show the High and Low</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-medium mb-2">Available Intervals</h4>
              <ul className="space-y-1">
                <li>• <strong>1 min</strong> - Scalping, high-frequency analysis</li>
                <li>• <strong>5 min</strong> - Day trading (most popular)</li>
                <li>• <strong>15 min</strong> - Intraday swing trades</li>
                <li>• <strong>30 min / 1 hour</strong> - Position entries</li>
              </ul>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Data provided by Alpha Vantage. Includes extended hours trading (4:00 AM - 8:00 PM ET).
            Charts update every 60 seconds when auto-refresh is enabled.
          </p>
        </div>
      </main>
    </div>
  );
}
