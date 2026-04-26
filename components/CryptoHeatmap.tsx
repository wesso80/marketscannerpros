'use client';

import { useState, useEffect } from 'react';

interface CryptoData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  weight: number;
  color: string;
  volume?: number;
  marketCap?: number;
  // Derivatives overlay
  fundingRate?: number | null;
  fundingSentiment?: string | null;
  openInterest?: number | null;
  oiChange24h?: number | null;
  // Sector categorization
  sector?: string;
}

interface DefiData {
  defi_market_cap: string;
  eth_market_cap: string;
  defi_to_eth_ratio: string;
  trading_volume_24h: string;
  defi_dominance: string;
  top_coin_name: string;
  top_coin_defi_dominance: number;
}

export default function CryptoHeatmap() {
  const [cryptos, setCryptos] = useState<CryptoData[]>([]);
  const [defi, setDefi] = useState<DefiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState('CoinGecko');
  const [hoveredCrypto, setHoveredCrypto] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'weight' | 'change'>('weight');

  useEffect(() => {
    fetchCryptoData();
    const interval = setInterval(fetchCryptoData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  async function fetchCryptoData() {
    try {
      const res = await fetch('/api/crypto/heatmap');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setCryptos(data.cryptos);
      setDefi(data.defi ?? null);
      setLastUpdate(data.timestamp);
      if (typeof data.source === 'string' && data.source.trim()) {
        setDataSource(data.source.toLowerCase() === 'coingecko' ? 'CoinGecko' : data.source);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load crypto data');
    } finally {
      setLoading(false);
    }
  }

  function getHeatColor(changePercent: number): string {
    const intensity = Math.min(Math.abs(changePercent) / 8, 1);
    
    if (changePercent > 0) {
      const base = Math.round(30 + intensity * 40);
      const green = Math.round(140 + intensity * 115);
      return `rgb(${base}, ${green}, ${Math.round(base * 1.5)})`;
    } else if (changePercent < 0) {
      const base = Math.round(30 + intensity * 40);
      const red = Math.round(140 + intensity * 115);
      return `rgb(${red}, ${base}, ${Math.round(base * 1.5)})`;
    }
    return 'rgb(50, 50, 60)';
  }

  function formatPrice(price: number): string {
    if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.0001) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(8)}`;
  }

  function formatMarketCap(cap?: number): string {
    if (!cap) return 'N/A';
    if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
    if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
    if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
    return `$${cap.toLocaleString()}`;
  }

  function formatDefiValue(val: string): string {
    const n = parseFloat(val);
    if (isNaN(n)) return val;
    if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    return n.toLocaleString();
  }

  function calculateLayout(items: CryptoData[]): { x: number; y: number; w: number; h: number; crypto: CryptoData }[] {
    const sorted = sortBy === 'change' 
      ? [...items].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      : [...items].sort((a, b) => b.weight - a.weight);
    
    const totalWeight = sorted.reduce((sum, s) => sum + s.weight, 0);
    const layout: { x: number; y: number; w: number; h: number; crypto: CryptoData }[] = [];
    
    // Create rows
    const targetRowWeight = totalWeight / 4;
    const rows: CryptoData[][] = [];
    let rowItems: CryptoData[] = [];
    let rowWeight = 0;
    
    sorted.forEach(crypto => {
      if (rowWeight + crypto.weight > targetRowWeight && rowItems.length > 0) {
        rows.push(rowItems);
        rowItems = [crypto];
        rowWeight = crypto.weight;
      } else {
        rowItems.push(crypto);
        rowWeight += crypto.weight;
      }
    });
    if (rowItems.length > 0) rows.push(rowItems);
    
    const rowHeight = 100 / rows.length;
    
    rows.forEach((row, rowIndex) => {
      const rowTotalWeight = row.reduce((sum, c) => sum + c.weight, 0);
      let xOffset = 0;
      
      row.forEach(crypto => {
        const width = (crypto.weight / rowTotalWeight) * 100;
        layout.push({
          x: xOffset,
          y: rowIndex * rowHeight,
          w: width,
          h: rowHeight,
          crypto
        });
        xOffset += width;
      });
    });
    
    return layout;
  }

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

  if (error) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
        <p className="text-red-400">{error}</p>
        <button type="button" onClick={fetchCryptoData} className="mt-2 text-emerald-400 hover:text-emerald-300 text-sm">
          Try again
        </button>
      </div>
    );
  }

  const layout = calculateLayout(cryptos);
  const sortedByChange = [...cryptos].sort((a, b) => b.changePercent - a.changePercent);
  const bestPerformer = sortedByChange[0];
  const worstPerformer = sortedByChange[sortedByChange.length - 1];

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-2xl">🪙</span>
              Crypto Heat Map
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Top cryptocurrencies by market cap • 24h change • <span className="text-amber-400">Data updates every 60s</span>
            </p>
          </div>
          
          {/* Sort Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Sort:</span>
            <div className="flex bg-slate-900/50 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setSortBy('weight')}
                className={`px-3 py-1 text-xs rounded transition-all ${
                  sortBy === 'weight'
                    ? 'bg-emerald-500 text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Market Cap
              </button>
              <button
                type="button"
                onClick={() => setSortBy('change')}
                className={`px-3 py-1 text-xs rounded transition-all ${
                  sortBy === 'change'
                    ? 'bg-emerald-500 text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                % Change
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="relative" style={{ height: 'clamp(280px, 50vw, 450px)' }}>
        {layout.map(item => {
          const isHovered = hoveredCrypto === item.crypto.symbol;
          
          return (
            <div
              key={item.crypto.symbol}
              className="absolute transition-all duration-200 cursor-pointer border border-slate-900/50 group"
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: `${item.w}%`,
                height: `${item.h}%`,
                backgroundColor: getHeatColor(item.crypto.changePercent),
                transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                zIndex: isHovered ? 10 : 1,
              }}
              onMouseEnter={() => setHoveredCrypto(item.crypto.symbol)}
              onMouseLeave={() => setHoveredCrypto(null)}
            >
              <div className="h-full flex flex-col items-center justify-center p-1 text-center overflow-hidden relative">
                {/* Sector badge */}
                {item.crypto.sector && (
                  <span className="absolute top-0.5 left-0.5 text-[8px] font-semibold rounded px-1 py-0.5 leading-none bg-black/40 text-white/80 truncate max-w-[90%]">
                    {item.crypto.sector}
                  </span>
                )}
                {/* Funding sentiment indicator */}
                {item.crypto.fundingSentiment && (
                  <span className={`absolute top-0.5 right-0.5 text-[8px] font-bold rounded px-1 py-0.5 leading-none ${
                    item.crypto.fundingSentiment === 'Bullish' ? 'bg-emerald-500/70 text-white' :
                    item.crypto.fundingSentiment === 'Bearish' ? 'bg-red-500/70 text-white' :
                    'bg-slate-500/50 text-white/80'
                  }`}>
                    {item.crypto.fundingRate != null ? `${(item.crypto.fundingRate).toFixed(3)}%` : item.crypto.fundingSentiment[0]}
                  </span>
                )}
                <span className="text-white font-bold text-sm sm:text-base md:text-lg drop-shadow-lg">
                  {item.crypto.symbol}
                </span>
                <span className="text-white/80 text-xs drop-shadow truncate max-w-full">
                  {item.crypto.name}
                </span>
                <span className="text-base sm:text-lg md:text-xl font-bold drop-shadow-lg mt-1 text-white">
                  {item.crypto.changePercent >= 0 ? '+' : ''}{item.crypto.changePercent.toFixed(2)}%
                </span>
                {item.crypto.price > 0 && (
                  <span className="text-white/70 text-xs mt-1 drop-shadow truncate max-w-full">
                    {formatPrice(item.crypto.price)}
                  </span>
                )}
              </div>
              
              {/* Hover tooltip - positioned to float above */}
              {isHovered && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-slate-900 border border-slate-600 rounded-lg p-3 text-xs shadow-xl min-w-[180px] z-50">
                  <div className="font-semibold text-white mb-2 text-center">{item.crypto.name}</div>
                  {item.crypto.sector && (
                    <div className="text-center mb-2">
                      <span className="text-[11px] bg-slate-700 text-slate-300 rounded px-1.5 py-0.5">{item.crypto.sector}</span>
                    </div>
                  )}
                  {item.crypto.price > 0 && (
                    <div className="flex justify-between text-white/80 gap-4">
                      <span>Price:</span>
                      <span className="font-medium text-white">{formatPrice(item.crypto.price)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-white/80 gap-4 mt-1">
                    <span>24h Change:</span>
                    <span className={`font-medium ${item.crypto.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {item.crypto.changePercent >= 0 ? '+' : ''}{item.crypto.changePercent.toFixed(2)}%
                    </span>
                  </div>
                  {item.crypto.marketCap && (
                    <div className="flex justify-between text-white/80 gap-4 mt-1">
                      <span>Market Cap:</span>
                      <span className="font-medium text-white">{formatMarketCap(item.crypto.marketCap)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-white/80 gap-4 mt-1">
                    <span>Weight:</span>
                    <span className="font-medium text-white">{item.crypto.weight}%</span>
                  </div>
                  {/* Derivatives overlay */}
                  {(item.crypto.fundingRate != null || item.crypto.openInterest != null) && (
                    <div className="border-t border-slate-700 mt-2 pt-2 space-y-1">
                      {item.crypto.fundingRate != null && (
                        <div className="flex justify-between text-white/80 gap-4">
                          <span>Funding:</span>
                          <span className={`font-medium ${
                            item.crypto.fundingRate > 0.03 ? 'text-emerald-400' :
                            item.crypto.fundingRate < -0.01 ? 'text-red-400' : 'text-slate-300'
                          }`}>{item.crypto.fundingRate.toFixed(4)}%</span>
                        </div>
                      )}
                      {item.crypto.fundingSentiment && (
                        <div className="flex justify-between text-white/80 gap-4">
                          <span>Sentiment:</span>
                          <span className={`font-medium ${
                            item.crypto.fundingSentiment === 'Bullish' ? 'text-emerald-400' :
                            item.crypto.fundingSentiment === 'Bearish' ? 'text-red-400' : 'text-slate-300'
                          }`}>{item.crypto.fundingSentiment}</span>
                        </div>
                      )}
                      {item.crypto.openInterest != null && item.crypto.openInterest > 0 && (
                        <div className="flex justify-between text-white/80 gap-4">
                          <span>Open Interest:</span>
                          <span className="font-medium text-white">{formatMarketCap(item.crypto.openInterest)}</span>
                        </div>
                      )}
                      {item.crypto.oiChange24h != null && (
                        <div className="flex justify-between text-white/80 gap-4">
                          <span>OI Chg 24h:</span>
                          <span className={`font-medium ${
                            item.crypto.oiChange24h >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}>{item.crypto.oiChange24h >= 0 ? '+' : ''}{item.crypto.oiChange24h.toFixed(1)}%</span>
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
              <div className="w-4 h-4 rounded" style={{ backgroundColor: getHeatColor(-8) }}></div>
              <span className="text-xs text-slate-400">-8%</span>
            </div>
            <div className="w-24 h-3 rounded" style={{
              background: 'var(--msp-panel)'
            }}></div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: getHeatColor(8) }}></div>
              <span className="text-xs text-slate-400">+8%</span>
            </div>
          </div>

          {/* Best/Worst */}
          <div className="flex items-center gap-4 text-xs">
            {bestPerformer && (
              <div className="flex items-center gap-1">
                <span className="text-slate-400">🚀 Best:</span>
                <span className="text-emerald-400 font-medium">
                  {bestPerformer.symbol} (+{bestPerformer.changePercent.toFixed(2)}%)
                </span>
              </div>
            )}
            {worstPerformer && (
              <div className="flex items-center gap-1">
                <span className="text-slate-400">📉 Worst:</span>
                <span className="text-red-400 font-medium">
                  {worstPerformer.symbol} ({worstPerformer.changePercent.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          {lastUpdate && (
            <p className="text-xs text-slate-500">
              Last updated: {new Date(lastUpdate).toLocaleTimeString()}
            </p>
          )}
          <span className="text-xs text-slate-500">
            Data by {dataSource}
          </span>
        </div>
      </div>

      {/* Crypto Intelligence Panel */}
      {cryptos.some(c => c.fundingRate != null || c.sector) && (
        <div className="p-4 border-t border-slate-700 bg-slate-900/30">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <span>🧠</span> Crypto Intelligence
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Funding Rate Overview */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <h5 className="text-xs font-semibold text-slate-300 mb-2">Funding Rates</h5>
              {cryptos.some(c => c.fundingRate != null) ? (
                <div className="space-y-1">
                  {[...cryptos]
                    .filter(c => c.fundingRate != null)
                    .sort((a, b) => Math.abs(b.fundingRate ?? 0) - Math.abs(a.fundingRate ?? 0))
                    .map(c => (
                      <div key={c.symbol} className="flex items-center justify-between text-xs">
                        <span className="text-white">{c.symbol}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-medium ${
                            (c.fundingRate ?? 0) > 0.03 ? 'text-emerald-400' :
                            (c.fundingRate ?? 0) < -0.01 ? 'text-red-400' : 'text-slate-300'
                          }`}>{(c.fundingRate ?? 0).toFixed(4)}%</span>
                          <span className={`text-[11px] rounded px-1 ${
                            c.fundingSentiment === 'Bullish' ? 'bg-emerald-500/20 text-emerald-400' :
                            c.fundingSentiment === 'Bearish' ? 'bg-red-500/20 text-red-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>{c.fundingSentiment?.[0] ?? '—'}</span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">Funding data populates from derivatives cron</p>
              )}
            </div>

            {/* OI Change */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <h5 className="text-xs font-semibold text-slate-300 mb-2">OI Change (24h)</h5>
              {cryptos.some(c => c.oiChange24h != null) ? (
                <div className="space-y-1">
                  {[...cryptos]
                    .filter(c => c.oiChange24h != null)
                    .sort((a, b) => (b.oiChange24h ?? 0) - (a.oiChange24h ?? 0))
                    .map(c => (
                      <div key={c.symbol} className="flex items-center justify-between text-xs">
                        <span className="text-white">{c.symbol}</span>
                        <div className="flex items-center gap-1.5">
                          {c.openInterest != null && c.openInterest > 0 && (
                            <span className="text-slate-500 text-[11px]">{formatMarketCap(c.openInterest)}</span>
                          )}
                          <span className={`font-medium ${
                            (c.oiChange24h ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}>{(c.oiChange24h ?? 0) >= 0 ? '+' : ''}{(c.oiChange24h ?? 0).toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">OI data populates from derivatives cron snapshots</p>
              )}
            </div>

            {/* Sector Breakdown */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <h5 className="text-xs font-semibold text-slate-300 mb-2">Sector Breakdown</h5>
              <div className="space-y-1">
                {(() => {
                  const sectors: Record<string, { coins: string[]; avgChange: number }> = {};
                  for (const c of cryptos) {
                    const sec = c.sector || 'Other';
                    if (!sectors[sec]) sectors[sec] = { coins: [], avgChange: 0 };
                    sectors[sec].coins.push(c.symbol);
                    sectors[sec].avgChange += c.changePercent;
                  }
                  for (const s of Object.values(sectors)) {
                    s.avgChange = s.coins.length > 0 ? s.avgChange / s.coins.length : 0;
                  }
                  return Object.entries(sectors)
                    .sort((a, b) => b[1].avgChange - a[1].avgChange)
                    .map(([name, data]) => (
                      <div key={name} className="text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-white font-medium">{name}</span>
                          <span className={`font-medium ${data.avgChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {data.avgChange >= 0 ? '+' : ''}{data.avgChange.toFixed(2)}%
                          </span>
                        </div>
                        <span className="text-slate-500 text-[11px]">{data.coins.join(', ')}</span>
                      </div>
                    ));
                })()}
              </div>
            </div>

            {/* DeFi TVL Overview */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <h5 className="text-xs font-semibold text-slate-300 mb-2">DeFi TVL</h5>
              {defi ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Market Cap</span>
                    <span className="text-white font-medium">${formatDefiValue(defi.defi_market_cap)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">24h Volume</span>
                    <span className="text-white font-medium">${formatDefiValue(defi.trading_volume_24h)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">DeFi Dominance</span>
                    <span className="text-emerald-400 font-medium">{parseFloat(defi.defi_dominance).toFixed(2)}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">DeFi/ETH Ratio</span>
                    <span className="text-white font-medium">{parseFloat(defi.defi_to_eth_ratio).toFixed(2)}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Top DeFi Coin</span>
                    <span className="text-amber-400 font-medium">{defi.top_coin_name} ({defi.top_coin_defi_dominance.toFixed(1)}%)</span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">DeFi data unavailable</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
