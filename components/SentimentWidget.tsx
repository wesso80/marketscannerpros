'use client';

import { useEffect, useState } from 'react';

interface MarketSentiment {
  value: number;
  classification: string;
  timestamp: string;
}

interface CryptoFGData {
  current: MarketSentiment;
  market: string;
  source: string;
  stale?: boolean;
}

interface StockIndicator {
  name: string;
  value: number;
  score: number;
  signal: string;
  weight: number;
}

interface StockFGData {
  current: MarketSentiment;
  indicators: StockIndicator[];
  market: string;
  source: string;
  methodology: string;
  stale?: boolean;
}

interface SentimentWidgetProps {
  className?: string;
  showDetails?: boolean;
}

export default function SentimentWidget({ 
  className = '',
  showDetails = true 
}: SentimentWidgetProps) {
  const [cryptoData, setCryptoData] = useState<CryptoFGData | null>(null);
  const [stockData, setStockData] = useState<StockFGData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'crypto' | 'stocks'>('crypto');
  const [showIndicators, setShowIndicators] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/fear-greed').then(r => r.json()).catch(() => null),
      fetch('/api/fear-greed/stocks').then(r => r.json()).catch(() => null),
    ]).then(([crypto, stocks]) => {
      if (crypto && !crypto.error) setCryptoData(crypto);
      if (stocks && !stocks.error) setStockData(stocks);
      setLoading(false);
    });
  }, []);

  const getColor = (val: number) => {
    if (val <= 24) return '#ef4444';
    if (val <= 44) return '#f97316';
    if (val <= 55) return '#eab308';
    if (val <= 75) return '#84cc16';
    return '#22c55e';
  };

  const getEmoji = (val: number) => {
    if (val <= 24) return '😱';
    if (val <= 44) return '😰';
    if (val <= 55) return '😐';
    if (val <= 75) return '😀';
    return '🤑';
  };

  const getBgGradient = (val: number) => {
    if (val <= 24) return 'from-red-900/20 to-red-950/10';
    if (val <= 44) return 'from-orange-900/20 to-orange-950/10';
    if (val <= 55) return 'from-yellow-900/20 to-yellow-950/10';
    if (val <= 75) return 'from-lime-900/20 to-lime-950/10';
    return 'from-green-900/20 to-green-950/10';
  };

  if (loading) {
    return (
      <div className={`animate-pulse bg-slate-800/50 rounded-xl p-6 h-64 ${className}`}>
        <div className="h-4 bg-slate-700 rounded w-1/2 mb-4"></div>
        <div className="h-24 bg-slate-700 rounded"></div>
      </div>
    );
  }

  if (!cryptoData && !stockData) {
    return (
      <div className={`bg-slate-800/50 rounded-xl p-4 border border-slate-700 ${className}`}>
        <p className="text-slate-400 text-sm">Sentiment data unavailable</p>
      </div>
    );
  }

  const activeData = activeTab === 'crypto' ? cryptoData : stockData;
  const value = activeData?.current?.value ?? 50;
  const classification = activeData?.current?.classification ?? 'Unknown';
  const color = getColor(value);

  return (
    <div className={`bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden ${className}`}>
      {/* Tab Header */}
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => setActiveTab('crypto')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'crypto' 
              ? 'bg-slate-700/50 text-emerald-400 border-b-2 border-emerald-400' 
              : 'text-slate-400 hover:text-white hover:bg-slate-700/30'
          }`}
        >
          🪙 Crypto F&G
        </button>
        <button
          onClick={() => setActiveTab('stocks')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'stocks' 
              ? 'bg-slate-700/50 text-blue-400 border-b-2 border-blue-400' 
              : 'text-slate-400 hover:text-white hover:bg-slate-700/30'
          }`}
        >
          📈 Stock F&G
        </button>
      </div>

      {/* Content */}
      <div className={`p-5 bg-gradient-to-br ${getBgGradient(value)}`}>
        {activeData ? (
          <>
            {/* Main Score */}
            <div className="flex items-center gap-4 mb-4">
              <div className="text-5xl">{getEmoji(value)}</div>
              <div>
                <div className="text-5xl font-bold" style={{ color }}>
                  {value}
                </div>
                <div className="text-lg font-semibold" style={{ color }}>
                  {classification}
                </div>
              </div>
              {/* Circular gauge */}
              <div className="ml-auto">
                <svg viewBox="0 0 100 100" className="w-24 h-24">
                  {/* Background circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#334155"
                    strokeWidth="8"
                  />
                  {/* Progress arc */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke={color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(value / 100) * 251.2} 251.2`}
                    transform="rotate(-90 50 50)"
                    className="transition-all duration-500"
                  />
                  {/* Center text */}
                  <text
                    x="50"
                    y="55"
                    textAnchor="middle"
                    className="text-2xl font-bold fill-white"
                  >
                    {value}
                  </text>
                </svg>
              </div>
            </div>

            {/* Scale bar */}
            <div className="relative h-3 rounded-full overflow-hidden mb-2" style={{
              background: 'linear-gradient(to right, #ef4444, #f97316, #eab308, #84cc16, #22c55e)'
            }}>
              <div 
                className="absolute top-0 w-3 h-3 bg-white rounded-full border-2 border-slate-900 transition-all duration-500"
                style={{ left: `calc(${value}% - 6px)` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500 mb-4">
              <span>Extreme Fear</span>
              <span>Neutral</span>
              <span>Extreme Greed</span>
            </div>

            {/* Stock indicators detail */}
            {activeTab === 'stocks' && stockData?.indicators && showDetails && (
              <>
                <button
                  onClick={() => setShowIndicators(!showIndicators)}
                  className="text-sm text-blue-400 hover:text-blue-300 mb-3 flex items-center gap-1"
                >
                  {showIndicators ? '▼' : '▶'} View Breakdown
                </button>
                
                {showIndicators && (
                  <div className="space-y-2 mb-4">
                    {stockData.indicators.map((ind) => (
                      <div key={ind.name} className="flex items-center gap-2">
                        <div className="flex-1 text-xs text-slate-400">{ind.name}</div>
                        <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: `${ind.score}%`, 
                              backgroundColor: getColor(ind.score) 
                            }}
                          />
                        </div>
                        <div className="w-8 text-xs text-right" style={{ color: getColor(ind.score) }}>
                          {ind.score}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Source & timestamp */}
            <div className="text-xs text-slate-500 flex justify-between items-center">
              <span>
                {activeTab === 'crypto' ? 'Source: Alternative.me' : 'Source: MSP Proprietary'}
              </span>
              <span>
                {activeData.stale && (
                  <span className="text-amber-400 mr-2">⚠️ Cached</span>
                )}
                Updated: {new Date(activeData.current.timestamp).toLocaleString()}
              </span>
            </div>
          </>
        ) : (
          <div className="text-slate-400 text-center py-8">
            {activeTab === 'crypto' ? 'Crypto' : 'Stock'} sentiment data unavailable
          </div>
        )}
      </div>

      {/* Comparison footer */}
      {cryptoData && stockData && (
        <div className="px-5 py-3 bg-slate-900/50 border-t border-slate-700">
          <div className="text-xs text-slate-400 mb-2">Market Comparison</div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">🪙 Crypto</span>
                <span className="font-bold" style={{ color: getColor(cryptoData.current.value) }}>
                  {cryptoData.current.value}
                </span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all"
                  style={{ 
                    width: `${cryptoData.current.value}%`, 
                    backgroundColor: getColor(cryptoData.current.value) 
                  }}
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">📈 Stocks</span>
                <span className="font-bold" style={{ color: getColor(stockData.current.value) }}>
                  {stockData.current.value}
                </span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all"
                  style={{ 
                    width: `${stockData.current.value}%`, 
                    backgroundColor: getColor(stockData.current.value) 
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
