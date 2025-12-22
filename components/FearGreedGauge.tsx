'use client';

import { useEffect, useState } from 'react';

interface FearGreedData {
  current: {
    value: number;
    classification: string;
    timestamp: string;
    timeUntilUpdate: number;
  };
  history: Array<{
    value: number;
    classification: string;
    date: string;
  }>;
  market: string;
  source: string;
  stale?: boolean;
}

interface FearGreedGaugeProps {
  compact?: boolean;
  showHistory?: boolean;
  className?: string;
}

export default function FearGreedGauge({ 
  compact = false, 
  showHistory = true,
  className = '' 
}: FearGreedGaugeProps) {
  const [data, setData] = useState<FearGreedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/fear-greed')
      .then(res => res.json())
      .then(result => {
        if (result.error && !result.current) {
          setError(result.error);
        } else {
          setData(result);
        }
      })
      .catch(err => setError('Failed to load sentiment data'))
      .finally(() => setLoading(false));
  }, []);

  const getColor = (val: number) => {
    if (val <= 24) return '#ef4444'; // red - extreme fear
    if (val <= 44) return '#f97316'; // orange - fear
    if (val <= 55) return '#eab308'; // yellow - neutral
    if (val <= 75) return '#84cc16'; // lime - greed
    return '#22c55e'; // green - extreme greed
  };

  const getEmoji = (val: number) => {
    if (val <= 24) return '😱';
    if (val <= 44) return '😰';
    if (val <= 55) return '😐';
    if (val <= 75) return '😀';
    return '🤑';
  };

  const [showTooltip, setShowTooltip] = useState(false);

  const tooltipText = `Fear & Greed Index measures market sentiment from 0-100.

🔴 0-24: Extreme Fear - Investors worried, potential buying opportunity
🟠 25-44: Fear - Market anxiety, cautious sentiment
🟡 45-55: Neutral - Balanced market conditions
🟢 56-75: Greed - Optimism rising, watch for overextension
💚 76-100: Extreme Greed - Euphoria, potential market top

Based on: Volatility, Volume, Social Media, Surveys, BTC Dominance, Google Trends`;

  if (loading) {
    return (
      <div className={`animate-pulse bg-slate-800/50 rounded-xl ${compact ? 'p-4 h-24' : 'p-6 h-48'} ${className}`}>
        <div className="h-4 bg-slate-700 rounded w-1/2 mb-4"></div>
        <div className="h-8 bg-slate-700 rounded w-1/3"></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={`bg-slate-800/50 rounded-xl p-4 border border-slate-700 ${className}`}>
        <p className="text-slate-400 text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { value, classification } = data.current;
  const color = getColor(value);

  // Compact version for sidebar/header
  if (compact) {
    return (
      <div className={`bg-slate-800/50 rounded-lg p-3 border border-slate-700 relative ${className}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{getEmoji(value)}</span>
            <div>
              <div className="text-xs text-slate-400 flex items-center gap-1">
                Crypto Fear & Greed
                <span className="text-amber-400/70">(BTC/Alts only)</span>
                <button
                  onClick={() => setShowTooltip(!showTooltip)}
                  className="text-slate-500 hover:text-slate-300 ml-1"
                  title="What is this?"
                >
                  ℹ️
                </button>
              </div>
              <div className="font-bold" style={{ color }}>
                {value} - {classification}
              </div>
            </div>
          </div>
          {/* Mini bar indicator */}
          <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${value}%`, backgroundColor: color }}
            />
          </div>
        </div>
        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-slate-900 border border-slate-600 rounded-lg z-50 text-xs text-slate-300 whitespace-pre-line shadow-xl">
            <button
              onClick={() => setShowTooltip(false)}
              className="absolute top-2 right-2 text-slate-400 hover:text-white"
            >
              ✕
            </button>
            {tooltipText}
          </div>
        )}
      </div>
    );
  }

  // Full version with gauge
  return (
    <div className={`bg-slate-800/50 rounded-xl p-6 border border-slate-700 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">
          Crypto Fear & Greed Index
        </h3>
        {data.stale && (
          <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-1 rounded">
            Cached
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-6">
        {/* Gauge */}
        <div className="relative w-36 h-20">
          <svg viewBox="0 0 100 50" className="w-full">
            {/* Background arc segments */}
            <path d="M 10 50 A 40 40 0 0 1 26 18" fill="none" stroke="#ef4444" strokeWidth="8" strokeLinecap="round" opacity="0.3" />
            <path d="M 26 18 A 40 40 0 0 1 50 10" fill="none" stroke="#f97316" strokeWidth="8" opacity="0.3" />
            <path d="M 50 10 A 40 40 0 0 1 74 18" fill="none" stroke="#eab308" strokeWidth="8" opacity="0.3" />
            <path d="M 74 18 A 40 40 0 0 1 90 50" fill="none" stroke="#22c55e" strokeWidth="8" strokeLinecap="round" opacity="0.3" />
            
            {/* Needle */}
            <g transform={`rotate(${(value / 100) * 180 - 90}, 50, 50)`}>
              <line x1="50" y1="50" x2="50" y2="18" stroke={color} strokeWidth="3" strokeLinecap="round" />
              <circle cx="50" cy="50" r="5" fill={color} />
            </g>
          </svg>
          
          {/* Labels */}
          <div className="absolute bottom-0 left-0 text-xs text-red-400">Fear</div>
          <div className="absolute bottom-0 right-0 text-xs text-green-400">Greed</div>
        </div>

        {/* Details */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{getEmoji(value)}</span>
            <span className="text-4xl font-bold" style={{ color }}>
              {value}
            </span>
          </div>
          <div 
            className="text-xl font-semibold mb-2"
            style={{ color }}
          >
            {classification}
          </div>
          <div className="text-sm text-slate-400">
            Updated: {new Date(data.current.timestamp).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Sentiment explanation */}
      <div className="mt-4 p-3 bg-slate-900/50 rounded-lg">
        <p className="text-sm text-slate-300">
          {value <= 24 && "Extreme fear can indicate oversold conditions - potential buying opportunity."}
          {value > 24 && value <= 44 && "Fear in the market - investors are worried. Watch for reversal signals."}
          {value > 44 && value <= 55 && "Neutral sentiment - market is balanced between bulls and bears."}
          {value > 55 && value <= 75 && "Greed is building - consider taking some profits."}
          {value > 75 && "Extreme greed often precedes corrections - exercise caution."}
        </p>
      </div>

      {/* History sparkline */}
      {showHistory && data.history.length > 0 && (
        <>
          <div className="mt-4 flex items-end gap-1 h-12">
            {data.history.slice(0, 14).reverse().map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t transition-all hover:opacity-100 cursor-pointer"
                style={{
                  height: `${Math.max(h.value, 5)}%`,
                  backgroundColor: getColor(h.value),
                  opacity: 0.5 + (i / 14) * 0.5,
                }}
                title={`${new Date(h.date).toLocaleDateString()}: ${h.value} (${h.classification})`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>14 days ago</span>
            <span>Today</span>
          </div>
        </>
      )}

      {/* Source attribution */}
      <div className="mt-3 text-xs text-slate-500 text-right">
        Source: Alternative.me
      </div>
    </div>
  );
}
