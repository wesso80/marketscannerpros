'use client';

import { useState, useEffect } from 'react';

interface DominanceData {
  btc: number;
  eth: number;
  stablecoin: number;
  totalMarketCap: number;
  change24h: number;
}

interface FearGreedData {
  value: number;
  classification: string;
  market: string;
}

interface OpenInterestData {
  total: string;
  btcDominance: string;
  ethDominance: string;
  change24h: number;
}

interface DerivativesData {
  longShortRatio: number;
  fundingRate: number;
}

export default function MarketPulseHero() {
  const [dominance, setDominance] = useState<DominanceData | null>(null);
  const [fearGreed, setFearGreed] = useState<FearGreedData | null>(null);
  const [openInterest, setOpenInterest] = useState<OpenInterestData | null>(null);
  const [derivatives, setDerivatives] = useState<DerivativesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch all data in parallel
        const [globalRes, fgRes, oiRes, derivRes] = await Promise.all([
          fetch('/api/crypto/market-overview', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
          fetch('/api/fear-greed-custom?market=crypto').then(r => r.json()).catch(() => null),
          fetch('/api/open-interest').then(r => r.json()).catch(() => null),
          fetch('/api/funding-rates').then(r => r.json()).catch(() => null),
        ]);

        if (globalRes?.data) {
          const mcap = globalRes.data.dominanceMap || {};
          setDominance({
            btc: globalRes.data.btcDominance ?? mcap.btc ?? 0,
            eth: globalRes.data.ethDominance ?? mcap.eth ?? 0,
            stablecoin: (globalRes.data.usdtDominance ?? mcap.usdt ?? 0) + (globalRes.data.usdcDominance ?? mcap.usdc ?? 0),
            totalMarketCap: globalRes.data.totalMarketCap || 0,
            change24h: globalRes.data.marketCapChange24h || 0,
          });
        }

        if (fgRes && !fgRes.error) {
          setFearGreed({
            value: fgRes.value,
            classification: fgRes.classification,
            market: fgRes.market,
          });
        }

        if (oiRes?.total) {
          setOpenInterest({
            total: oiRes.total.formatted,
            btcDominance: oiRes.total.btcDominance,
            ethDominance: oiRes.total.ethDominance,
            change24h: oiRes.total.change24h || 0,
          });
        }

        if (derivRes?.coins) {
          // Get BTC data for L/S ratio and funding
          const btc = derivRes.coins?.find((c: { symbol: string }) => c.symbol === 'BTC');
          if (btc) {
            setDerivatives({
              longShortRatio: btc.longShortRatio || 0,
              fundingRate: btc.fundingRate || 0,
            });
          }
        }
      } catch (err) {
        console.error('Error fetching market pulse:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const formatMcap = (value: number) => {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    return `$${(value / 1e9).toFixed(0)}B`;
  };

  const getFearGreedColor = (val: number) => {
    if (val <= 25) return '#ef4444';
    if (val <= 45) return '#f97316';
    if (val <= 55) return '#eab308';
    if (val <= 75) return '#84cc16';
    return '#22c55e';
  };

  const getFearGreedEmoji = (val: number) => {
    if (val <= 25) return '😱';
    if (val <= 45) return '😰';
    if (val <= 55) return '😐';
    if (val <= 75) return '😀';
    return '🤑';
  };

  if (loading) {
    return (
      <section className="w-full py-8 px-4 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-slate-800/50 rounded-xl p-5 animate-pulse h-40" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full py-8 px-4 bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-700/50">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-center text-lg font-semibold text-gray-400 mb-6 tracking-wide uppercase">
          📊 Live Market Pulse
        </h2>
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Box 1: Market Dominance */}
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-5 border border-slate-700/50 hover:border-blue-500/30 transition-all">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">₿</span>
              <span className="text-sm font-medium text-gray-400">Market Dominance</span>
            </div>
            {dominance ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-orange-400 font-medium">BTC</span>
                  <span className="text-xl font-bold text-white">{dominance.btc.toFixed(1)}%</span>
                </div>
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-orange-500 to-orange-400" style={{ width: `${dominance.btc}%` }} />
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-blue-400 text-sm">ETH</span>
                  <span className="text-sm text-gray-300">{dominance.eth.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-green-400 text-sm">Stables</span>
                  <span className="text-sm text-gray-300">{dominance.stablecoin.toFixed(1)}%</span>
                </div>
                <div className="pt-2 border-t border-slate-700 mt-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">Total MCap</span>
                    <span className={`font-medium ${dominance.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatMcap(dominance.totalMarketCap)} 
                      <span className="ml-1">({dominance.change24h >= 0 ? '+' : ''}{dominance.change24h.toFixed(1)}%)</span>
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-sm">Loading...</div>
            )}
          </div>

          {/* Box 2: Fear & Greed Index */}
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-5 border border-slate-700/50 hover:border-yellow-500/30 transition-all">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">📊</span>
              <span className="text-sm font-medium text-gray-400">Fear & Greed</span>
            </div>
            {fearGreed ? (
              <div className="text-center">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <span className="text-4xl">{getFearGreedEmoji(fearGreed.value)}</span>
                  <span 
                    className="text-4xl font-bold" 
                    style={{ color: getFearGreedColor(fearGreed.value) }}
                  >
                    {fearGreed.value}
                  </span>
                </div>
                <div 
                  className="text-lg font-semibold mb-2"
                  style={{ color: getFearGreedColor(fearGreed.value) }}
                >
                  {fearGreed.classification}
                </div>
                <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full transition-all duration-500"
                    style={{ 
                      width: `${fearGreed.value}%`,
                      background: `var(--msp-accent)`,
                      backgroundSize: '500% 100%',
                      backgroundPosition: `${fearGreed.value}% 0`
                    }} 
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Extreme Fear</span>
                  <span>Extreme Greed</span>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-sm">Loading...</div>
            )}
          </div>

          {/* Box 3: Open Interest */}
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-5 border border-slate-700/50 hover:border-purple-500/30 transition-all">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">📈</span>
              <span className="text-sm font-medium text-gray-400">Open Interest</span>
            </div>
            {openInterest ? (
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">{openInterest.total}</span>
                  <span className={`text-sm font-medium ${openInterest.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {openInterest.change24h >= 0 ? '▲' : '▼'} {Math.abs(openInterest.change24h).toFixed(1)}%
                  </span>
                </div>
                <div className="text-xs text-gray-500 mb-2">Crypto Futures</div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-orange-400">BTC</span>
                    <span className="text-gray-300">{openInterest.btcDominance}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-400">ETH</span>
                    <span className="text-gray-300">{openInterest.ethDominance}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-sm">Loading...</div>
            )}
          </div>

          {/* Box 4: Derivatives (L/S Ratio + Funding) */}
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-5 border border-slate-700/50 hover:border-green-500/30 transition-all">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">⚖️</span>
              <span className="text-sm font-medium text-gray-400">BTC Derivatives</span>
            </div>
            {derivatives ? (
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Long/Short Ratio</div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl font-bold ${derivatives.longShortRatio > 1 ? 'text-green-400' : 'text-red-400'}`}>
                      {derivatives.longShortRatio.toFixed(2)}
                    </span>
                    <span className={`text-sm ${derivatives.longShortRatio > 1 ? 'text-green-400' : 'text-red-400'}`}>
                      {derivatives.longShortRatio > 1 ? '↑ Longs' : '↓ Shorts'}
                    </span>
                  </div>
                  {/* Visual bar */}
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden mt-2 flex">
                    <div 
                      className="h-full bg-green-500" 
                      style={{ width: `${Math.min((derivatives.longShortRatio / (derivatives.longShortRatio + 1)) * 100, 100)}%` }} 
                    />
                    <div 
                      className="h-full bg-red-500 flex-1" 
                    />
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-700">
                  <div className="text-xs text-gray-500 mb-1">Funding Rate</div>
                  <div className={`text-xl font-bold ${derivatives.fundingRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {derivatives.fundingRate >= 0 ? '+' : ''}{(derivatives.fundingRate * 100).toFixed(4)}%
                  </div>
                  <div className="text-xs text-gray-500">
                    {derivatives.fundingRate > 0.01 ? 'Longs pay shorts' : derivatives.fundingRate < -0.01 ? 'Shorts pay longs' : 'Neutral'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-sm">Loading...</div>
            )}
          </div>
        </div>
        
        <p className="text-center text-xs text-gray-500 mt-4">
          Data from CoinGecko • Refreshes every minute
        </p>
      </div>
    </section>
  );
}
