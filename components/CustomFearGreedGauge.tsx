'use client';

import { useEffect, useState } from 'react';

interface ComponentData {
  name: string;
  value: number;
  weight: number;
  contribution: number;
  interpretation: string;
}

interface CustomFGData {
  market: string;
  value: number;
  classification: string;
  components: ComponentData[];
  raw: Record<string, number | undefined>;
  source: string;
  methodology: string;
  cachedAt: string;
}

interface Props {
  initialMarket?: 'crypto' | 'stock';
  compact?: boolean;
  showComponents?: boolean;
  className?: string;
}

export default function CustomFearGreedGauge({ 
  initialMarket = 'crypto',
  compact = false,
  showComponents = true,
  className = '' 
}: Props) {
  const [market, setMarket] = useState<'crypto' | 'stock'>(initialMarket);
  const [data, setData] = useState<CustomFGData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    
    fetch(`/api/fear-greed-custom?market=${market}`)
      .then(res => res.json())
      .then(result => {
        if (result.error) {
          setError(result.error);
        } else {
          setData(result);
        }
      })
      .catch(() => setError('Failed to load sentiment data'))
      .finally(() => setLoading(false));
  }, [market]);

  const getColor = (val: number) => {
    if (val <= 19) return '#dc2626'; // red-600 - extreme fear
    if (val <= 39) return '#f97316'; // orange-500 - fear
    if (val <= 59) return '#eab308'; // yellow-500 - neutral
    if (val <= 79) return '#84cc16'; // lime-500 - greed
    return '#22c55e'; // green-500 - extreme greed
  };

  const getEmoji = (val: number) => {
    if (val <= 19) return '😱';
    if (val <= 39) return '😰';
    if (val <= 59) return '😐';
    if (val <= 79) return '😀';
    return '🤑';
  };

  const getBgGradient = (val: number) => {
    if (val <= 19) return 'from-red-900/30 to-red-950/30';
    if (val <= 39) return 'from-orange-900/30 to-orange-950/30';
    if (val <= 59) return 'from-yellow-900/30 to-yellow-950/30';
    if (val <= 79) return 'from-lime-900/30 to-lime-950/30';
    return 'from-green-900/30 to-green-950/30';
  };

  if (loading) {
    return (
      <div className={`animate-pulse bg-slate-800/50 rounded-xl ${compact ? 'p-4 h-24' : 'p-6'} ${className}`}>
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

  const { value, classification, components } = data;
  const color = getColor(value);

  // Compact version
  if (compact) {
    return (
      <div className={`bg-gradient-to-br ${getBgGradient(value)} rounded-xl p-4 border border-slate-700/50 ${className}`}>
        {/* Market toggle */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex bg-slate-800/50 rounded-lg p-0.5">
            <button
              onClick={() => setMarket('crypto')}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                market === 'crypto' 
                  ? 'bg-emerald-600 text-white' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🪙 Crypto
            </button>
            <button
              onClick={() => setMarket('stock')}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                market === 'stock' 
                  ? 'bg-blue-600 text-white' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📈 Stocks
            </button>
          </div>
          <span className="text-[10px] text-slate-500">MSP Index</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{getEmoji(value)}</span>
            <div>
              <div className="text-3xl font-bold" style={{ color }}>
                {value}
              </div>
              <div className="text-sm font-medium" style={{ color }}>
                {classification}
              </div>
            </div>
          </div>
          
          {/* Mini gauge */}
          <div className="flex-1">
            <div className="w-full h-3 bg-slate-700/50 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ 
                  width: `${value}%`, 
                  background: `var(--msp-accent)`,
                  backgroundSize: '500% 100%',
                  backgroundPosition: `${value}% 0`
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>Fear</span>
              <span>Greed</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full version
  return (
    <div className={`bg-gradient-to-br ${getBgGradient(value)} rounded-xl p-6 border border-slate-700/50 ${className}`}>
      {/* Header with market toggle */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">
            MSP Fear & Greed Index
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Proprietary multi-factor sentiment analysis
          </p>
        </div>
        <div className="flex bg-slate-800/50 rounded-lg p-0.5">
          <button
            onClick={() => setMarket('crypto')}
            className={`px-4 py-1.5 text-sm rounded-md transition-all ${
              market === 'crypto' 
                ? 'bg-emerald-600 text-white font-medium' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🪙 Crypto
          </button>
          <button
            onClick={() => setMarket('stock')}
            className={`px-4 py-1.5 text-sm rounded-md transition-all ${
              market === 'stock' 
                ? 'bg-blue-600 text-white font-medium' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            📈 Stocks
          </button>
        </div>
      </div>
      
      {/* Main gauge */}
      <div className="flex items-center gap-6 mb-6">
        {/* Circular gauge */}
        <div className="relative w-32 h-32">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            {/* Background circle */}
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke="rgba(100,116,139,0.2)"
              strokeWidth="12"
            />
            {/* Value arc */}
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke={color}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${(value / 100) * 264} 264`}
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl">{getEmoji(value)}</span>
            <span className="text-3xl font-bold" style={{ color }}>{value}</span>
          </div>
        </div>

        {/* Classification + explanation */}
        <div className="flex-1">
          <div className="text-2xl font-bold mb-2" style={{ color }}>
            {classification}
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            {value <= 19 && "Extreme fear often signals a buying opportunity - smart money accumulates here."}
            {value > 19 && value <= 39 && "Fear dominates - watch for capitulation or reversal signals."}
            {value > 39 && value <= 59 && "Balanced sentiment - market searching for direction."}
            {value > 59 && value <= 79 && "Greed rising - momentum is strong but watch for overextension."}
            {value > 79 && "Extreme greed warns of potential correction - consider taking profits."}
          </p>
        </div>
      </div>

      {/* Components breakdown */}
      {showComponents && components.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-300">Index Components</h4>
          {components.map((comp, i) => (
            <div key={i} className="bg-slate-900/30 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{comp.name}</span>
                  <span className="text-xs text-slate-500">({comp.weight}%)</span>
                </div>
                <span className="text-sm font-bold" style={{ color: getColor(comp.value) }}>
                  {Math.round(comp.value)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${comp.value}%`, 
                      backgroundColor: getColor(comp.value)
                    }}
                  />
                </div>
                <span className="text-xs text-slate-400 w-28 text-right">
                  {comp.interpretation}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Methodology footer */}
      <div className="mt-4 pt-4 border-t border-slate-700/50">
        <p className="text-xs text-slate-500">
          <strong className="text-slate-400">Methodology:</strong> {data.methodology}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Last updated: {new Date(data.cachedAt).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
