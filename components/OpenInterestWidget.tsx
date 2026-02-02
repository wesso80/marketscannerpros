'use client';

import { useEffect, useState } from 'react';

interface CoinOI {
  symbol: string;
  openInterest: number;
  openInterestCoin: number;
  price: number;
  change24h?: number;
}

interface OIData {
  total: {
    openInterest: number;
    formatted: string;
    btcDominance: string;
    ethDominance: string;
    altDominance: string;
    change24h?: number;
  };
  btc: {
    openInterest: number;
    formatted: string;
    price: number;
    contracts: number;
    change24h?: number;
  } | null;
  eth: {
    openInterest: number;
    formatted: string;
    price: number;
    contracts: number;
    change24h?: number;
  } | null;
  coins: CoinOI[];
  exchange: string;
  stale?: boolean;
}

interface OpenInterestWidgetProps {
  compact?: boolean;
  showBreakdown?: boolean;
  className?: string;
}

export default function OpenInterestWidget({
  compact = false,
  showBreakdown = true,
  className = ''
}: OpenInterestWidgetProps) {
  const [data, setData] = useState<OIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const tooltipText = `Open Interest (OI) = Total value of all open futures contracts.

📈 Rising OI + Rising Price = Strong bullish trend
📈 Rising OI + Falling Price = Strong bearish trend
📉 Falling OI + Rising Price = Short squeeze / weak rally
📉 Falling OI + Falling Price = Capitulation / weak sell-off

BTC/ETH Dominance shows which assets are driving market activity.
High Alt dominance = Risk-on sentiment, altseason potential.`;

  useEffect(() => {
    let retries = 2;
    
    const fetchData = () => {
      fetch('/api/open-interest')
        .then(res => res.json())
        .then(result => {
          if (result.error && !result.total) {
            if (retries > 0) {
              retries--;
              setTimeout(fetchData, 1000);
            } else {
              setError(result.error);
              setLoading(false);
            }
          } else {
            setData(result);
            setLoading(false);
          }
        })
        .catch(() => {
          if (retries > 0) {
            retries--;
            setTimeout(fetchData, 1000);
          } else {
            setError('OI data unavailable');
            setLoading(false);
          }
        });
    };
    
    fetchData();
  }, []);

  const formatCompact = (value: number): string => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    return `$${(value / 1e3).toFixed(0)}K`;
  };

  const formatChange = (change: number | undefined): string => {
    if (change === undefined) return '';
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  const getChangeColor = (change: number | undefined): string => {
    if (change === undefined) return 'text-slate-400';
    if (change > 0) return 'text-green-400';
    if (change < 0) return 'text-red-400';
    return 'text-slate-400';
  };

  // Get OI directional interpretation based on OI change
  const getOIInterpretation = (oiChange: number | undefined): {
    label: string;
    icon: string;
    color: string;
    description: string;
  } | null => {
    if (oiChange === undefined) return null;
    
    if (oiChange > 3) {
      return {
        label: 'OI Expanding',
        icon: '📈',
        color: 'text-green-400',
        description: 'New positions entering — trend building'
      };
    }
    if (oiChange > 0) {
      return {
        label: 'OI Rising',
        icon: '↑',
        color: 'text-green-400',
        description: 'Gradual position building'
      };
    }
    if (oiChange < -3) {
      return {
        label: 'OI Contracting',
        icon: '📉',
        color: 'text-red-400',
        description: 'Deleveraging — risk-off mode'
      };
    }
    if (oiChange < 0) {
      return {
        label: 'OI Falling',
        icon: '↓',
        color: 'text-yellow-400',
        description: 'Position unwinding'
      };
    }
    return {
      label: 'OI Flat',
      icon: '➖',
      color: 'text-slate-400',
      description: 'No significant change'
    };
  };

  if (loading) {
    return (
      <div className={`animate-pulse bg-slate-800/50 rounded-lg ${compact ? 'p-3 h-16' : 'p-6 h-64'} ${className}`}>
        <div className="h-4 bg-slate-700 rounded w-1/2 mb-4"></div>
        <div className="h-8 bg-slate-700 rounded w-1/3"></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={`bg-slate-800/50 rounded-lg p-3 border border-slate-700 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <span className="text-xs text-slate-400">Open Interest</span>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="text-xs text-emerald-400 hover:text-emerald-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Compact version for sidebar/header
  if (compact) {
    return (
      <div className={`bg-slate-800/50 rounded-lg p-3 border border-slate-700 relative ${className}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <div>
              <div className="text-xs text-slate-400 flex items-center gap-1">
                Open Interest
                <span className="text-blue-400/70">(CoinGecko)</span>
                <button
                  onClick={() => setShowTooltip(!showTooltip)}
                  className="ml-2 w-4 h-4 rounded-full bg-slate-600 hover:bg-emerald-500 text-[10px] text-white font-bold flex items-center justify-center transition-colors"
                  title="What is this?"
                >
                  ?
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">
                  {data.total.formatted}
                </span>
                {data.total.change24h !== undefined && (
                  <span className={`text-xs font-medium ${getChangeColor(data.total.change24h)}`}>
                    {formatChange(data.total.change24h)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="flex items-center justify-end gap-1">
              <span className="text-amber-400">BTC: {data.total.btcDominance}%</span>
              {data.btc?.change24h !== undefined && (
                <span className={`${getChangeColor(data.btc.change24h)}`}>
                  ({formatChange(data.btc.change24h)})
                </span>
              )}
            </div>
            <div className="flex items-center justify-end gap-1">
              <span className="text-blue-400">ETH: {data.total.ethDominance}%</span>
              {data.eth?.change24h !== undefined && (
                <span className={`${getChangeColor(data.eth.change24h)}`}>
                  ({formatChange(data.eth.change24h)})
                </span>
              )}
            </div>
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

  // Full version
  return (
    <div className={`bg-slate-800/50 rounded-xl p-6 border border-slate-700 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          📊 Global Open Interest
        </h3>
        <div className="flex items-center gap-2">
          {data.stale && (
            <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-1 rounded">
              Cached
            </span>
          )}
          <span className="text-xs text-slate-500">{data.exchange}</span>
        </div>
      </div>

      {/* Total OI */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-3">
          <span className="text-4xl font-bold text-white">
            {data.total.formatted}
          </span>
          {data.total.change24h !== undefined && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium ${
              data.total.change24h >= 0 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-red-500/20 text-red-400'
            }`}>
              <span>{data.total.change24h >= 0 ? '↑' : '↓'}</span>
              <span>{Math.abs(data.total.change24h).toFixed(2)}%</span>
              <span className="text-xs opacity-70">24h</span>
            </div>
          )}
        </div>
        <div className="text-sm text-slate-400 mb-3">
          Total Open Interest (Top 20 Coins)
        </div>

        {/* OI Directional Interpretation */}
        {(() => {
          const interpretation = getOIInterpretation(data.total.change24h);
          if (!interpretation) return null;
          return (
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${
              interpretation.color === 'text-green-400' ? 'bg-green-500/10 border-green-500/30' :
              interpretation.color === 'text-red-400' ? 'bg-red-500/10 border-red-500/30' :
              interpretation.color === 'text-yellow-400' ? 'bg-yellow-500/10 border-yellow-500/30' :
              'bg-slate-500/10 border-slate-500/30'
            } mb-4`}>
              <span className="text-lg">{interpretation.icon}</span>
              <div className="text-left">
                <div className={`text-sm font-semibold ${interpretation.color}`}>{interpretation.label}</div>
                <div className="text-xs text-slate-400">{interpretation.description}</div>
              </div>
            </div>
          );
        })()}

        {/* Dominance bar */}
        <div className="h-3 bg-slate-700 rounded-full overflow-hidden flex">
          <div
            className="bg-amber-500 transition-all"
            style={{ width: `${data.total.btcDominance}%` }}
            title={`BTC: ${data.total.btcDominance}%`}
          />
          <div
            className="bg-blue-500 transition-all"
            style={{ width: `${data.total.ethDominance}%` }}
            title={`ETH: ${data.total.ethDominance}%`}
          />
          <div
            className="bg-purple-500 transition-all"
            style={{ width: `${data.total.altDominance}%` }}
            title={`Alts: ${data.total.altDominance}%`}
          />
        </div>
        <div className="flex justify-center gap-4 text-xs mt-2">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span className="text-amber-400">BTC {data.total.btcDominance}%</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span className="text-blue-400">ETH {data.total.ethDominance}%</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            <span className="text-purple-400">Alts {data.total.altDominance}%</span>
          </span>
        </div>
      </div>

      {/* BTC & ETH highlights */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {data.btc && (
          <div className="bg-slate-900/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-amber-400 font-semibold">₿ BTC</span>
              {data.btc.change24h !== undefined && (
                <span className={`text-xs font-medium ${getChangeColor(data.btc.change24h)}`}>
                  {formatChange(data.btc.change24h)}
                </span>
              )}
            </div>
            <div className="text-xl font-bold text-white">{data.btc.formatted}</div>
            <div className="text-xs text-slate-400">
              {data.btc.contracts.toLocaleString()} contracts
            </div>
          </div>
        )}
        {data.eth && (
          <div className="bg-slate-900/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-blue-400 font-semibold">Ξ ETH</span>
              {data.eth.change24h !== undefined && (
                <span className={`text-xs font-medium ${getChangeColor(data.eth.change24h)}`}>
                  {formatChange(data.eth.change24h)}
                </span>
              )}
            </div>
            <div className="text-xl font-bold text-white">{data.eth.formatted}</div>
            <div className="text-xs text-slate-400">
              {data.eth.contracts.toLocaleString()} contracts
            </div>
          </div>
        )}
      </div>

      {/* Top coins breakdown */}
      {showBreakdown && (
        <div>
          <div className="text-sm text-slate-400 mb-2">Top by Open Interest</div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {data.coins.slice(0, 10).map((coin, i) => {
              const coinInterpretation = getOIInterpretation(coin.change24h);
              return (
                <div key={coin.symbol} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 w-5 text-right text-xs">{i + 1}</span>
                    <span className="font-medium text-white">{coin.symbol}</span>
                    {coin.change24h !== undefined && (
                      <span className={`text-xs flex items-center gap-1 ${getChangeColor(coin.change24h)}`}>
                        <span>{coin.change24h > 0 ? '↑' : coin.change24h < 0 ? '↓' : '–'}</span>
                        {formatChange(coin.change24h)}
                      </span>
                    )}
                    {coinInterpretation && coin.change24h !== undefined && Math.abs(coin.change24h) > 3 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        coin.change24h > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {coin.change24h > 0 ? 'Expanding' : 'Contracting'}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-white text-sm">
                      {formatCompact(coin.openInterest)}
                    </div>
                    <div className="text-xs text-slate-500">
                      ${coin.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interpretation hint */}
      <div className="mt-4 p-3 bg-slate-900/50 rounded-lg">
        <p className="text-xs text-slate-400">
          💡 <strong className="text-slate-300">OI Rising + Price Rising</strong> = New money entering (bullish).
          <strong className="text-slate-300"> OI Falling + Price Rising</strong> = Shorts covering (watch for reversal).
        </p>
      </div>
    </div>
  );
}
