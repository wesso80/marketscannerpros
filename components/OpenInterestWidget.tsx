'use client';

import { useEffect, useState } from 'react';

interface CoinOI {
  symbol: string;
  openInterest: number;
  openInterestCoin: number;
  price: number;
}

interface OIData {
  total: {
    openInterest: number;
    formatted: string;
    btcDominance: string;
    ethDominance: string;
    altDominance: string;
  };
  btc: {
    openInterest: number;
    formatted: string;
    price: number;
    contracts: number;
  } | null;
  eth: {
    openInterest: number;
    formatted: string;
    price: number;
    contracts: number;
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

  useEffect(() => {
    fetch('/api/open-interest')
      .then(res => res.json())
      .then(result => {
        if (result.error && !result.total) {
          setError(result.error);
        } else {
          setData(result);
        }
      })
      .catch(() => setError('Failed to load OI data'))
      .finally(() => setLoading(false));
  }, []);

  const formatCompact = (value: number): string => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    return `$${(value / 1e3).toFixed(0)}K`;
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
      <div className={`bg-slate-800/50 rounded-lg p-4 border border-slate-700 ${className}`}>
        <p className="text-slate-400 text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  // Compact version for sidebar/header
  if (compact) {
    return (
      <div className={`bg-slate-800/50 rounded-lg p-3 border border-slate-700 ${className}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <div>
              <div className="text-xs text-slate-400">
                Open Interest
                <span className="ml-1 text-blue-400/70">(Binance Futures)</span>
              </div>
              <div className="font-bold text-white">
                {data.total.formatted}
              </div>
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="text-amber-400">BTC: {data.total.btcDominance}%</div>
            <div className="text-blue-400">ETH: {data.total.ethDominance}%</div>
          </div>
        </div>
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
        <div className="text-4xl font-bold text-white mb-2">
          {data.total.formatted}
        </div>
        <div className="text-sm text-slate-400 mb-3">
          Total Open Interest (Top 20 Coins)
        </div>

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
            <div className="flex items-center gap-2 mb-1">
              <span className="text-amber-400 font-semibold">₿ BTC</span>
            </div>
            <div className="text-xl font-bold text-white">{data.btc.formatted}</div>
            <div className="text-xs text-slate-400">
              {data.btc.contracts.toLocaleString()} contracts
            </div>
          </div>
        )}
        {data.eth && (
          <div className="bg-slate-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-blue-400 font-semibold">Ξ ETH</span>
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
            {data.coins.slice(0, 10).map((coin, i) => (
              <div key={coin.symbol} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-5 text-right text-xs">{i + 1}</span>
                  <span className="font-medium text-white">{coin.symbol}</span>
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
            ))}
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
