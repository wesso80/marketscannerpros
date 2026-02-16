'use client';

import { useState, useEffect } from 'react';

interface TrendingPool {
  id: string;
  name: string;
  address: string;
  network: string;
  dex: string;
  baseTokenPrice: number;
  priceChange1h: number;
  priceChange24h: number;
  volume1h: number;
  volume24h: number;
  liquidity: number;
  buys24h: number;
  sells24h: number;
}

export default function TrendingPoolsWidget() {
  const [pools, setPools] = useState<TrendingPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPools() {
      try {
        const res = await fetch('/api/crypto/trending-pools');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (data.success) {
          setPools(data.pools || []);
          setError(null);
        } else {
          throw new Error(data.error);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchPools();
    const interval = setInterval(fetchPools, 300000); // Refresh every 5 mins
    return () => clearInterval(interval);
  }, []);

  const formatVolume = (vol: number | null | undefined): string => {
    if (vol == null) return 'N/A';
    if (vol >= 1e9) return `$${(vol / 1e9).toFixed(1)}B`;
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(0)}K`;
    return `$${vol.toFixed(0)}`;
  };

  const formatPrice = (price: number | null | undefined): string => {
    if (price == null) return 'N/A';
    if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.0001) return `$${price.toFixed(4)}`;
    if (price >= 0.00000001) return `$${price.toFixed(8)}`;
    return `$${price.toExponential(2)}`;
  };

  const getNetworkColor = (network: string): string => {
    const lower = network.toLowerCase();
    if (lower.includes('ethereum') || lower.includes('eth')) return '#627eea';
    if (lower.includes('solana') || lower.includes('sol')) return '#9945ff';
    if (lower.includes('base')) return '#0052ff';
    if (lower.includes('arbitrum') || lower.includes('arb')) return '#28a0f0';
    if (lower.includes('polygon') || lower.includes('matic')) return '#8247e5';
    if (lower.includes('bsc') || lower.includes('bnb')) return '#f3ba2f';
    if (lower.includes('avalanche') || lower.includes('avax')) return '#e84142';
    return '#64748b';
  };

  if (loading) {
    return (
      <div style={{
        background: 'var(--msp-card)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #334155'
      }}>
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-slate-700 rounded w-40"></div>
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-14 bg-slate-700/50 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'var(--msp-card)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #334155'
      }}>
        <div style={{ color: '#ef4444', fontSize: '14px' }}>Failed to load trending pools</div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--msp-card)',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid #334155'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <h3 style={{ 
          color: '#f1f5f9', 
          fontSize: '16px', 
          fontWeight: 600,
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          🌊 Trending DEX Pools
        </h3>
        <span style={{
          fontSize: '10px',
          color: '#9945ff',
          background: 'rgba(153, 69, 255, 0.15)',
          padding: '4px 8px',
          borderRadius: '4px',
          border: '1px solid rgba(153, 69, 255, 0.3)'
        }}>
          GeckoTerminal
        </span>
      </div>

      {/* Pools List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {pools.slice(0, 6).map((pool, index) => {
          const buys = pool.buys24h ?? 0;
          const sells = pool.sells24h ?? 0;
          const buyRatio = (buys + sells) > 0 ? (buys / (buys + sells)) * 100 : 50;
          
          return (
            <div 
              key={pool.id}
              style={{
                padding: '12px',
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '8px',
                border: index === 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(51, 65, 85, 0.5)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    color: '#f1f5f9', 
                    fontSize: '13px', 
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {pool.name.length > 20 ? pool.name.slice(0, 20) + '...' : pool.name}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '9px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: `${getNetworkColor(pool.network)}22`,
                      color: getNetworkColor(pool.network),
                      border: `1px solid ${getNetworkColor(pool.network)}44`
                    }}>
                      {pool.network.length > 10 ? pool.network.slice(0, 10) : pool.network}
                    </span>
                    <span style={{
                      fontSize: '9px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(100, 116, 139, 0.2)',
                      color: '#94a3b8'
                    }}>
                      {pool.dex.length > 12 ? pool.dex.slice(0, 12) : pool.dex}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ 
                    color: (pool.priceChange24h ?? 0) >= 0 ? '#10b981' : '#ef4444', 
                    fontSize: '14px',
                    fontWeight: 700
                  }}>
                    {(pool.priceChange24h ?? 0) >= 0 ? '+' : ''}{(pool.priceChange24h ?? 0).toFixed(1)}%
                  </div>
                  <div style={{ color: '#64748b', fontSize: '10px' }}>
                    1h: {(pool.priceChange1h ?? 0) >= 0 ? '+' : ''}{(pool.priceChange1h ?? 0).toFixed(1)}%
                  </div>
                </div>
              </div>
              
              {/* Stats Row */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                fontSize: '10px',
                color: '#94a3b8',
                borderTop: '1px solid rgba(51, 65, 85, 0.5)',
                paddingTop: '8px',
                marginTop: '4px'
              }}>
                <span>Vol: {formatVolume(pool.volume24h)}</span>
                <span>Liq: {formatVolume(pool.liquidity)}</span>
                <span style={{ color: buyRatio > 50 ? '#10b981' : '#ef4444' }}>
                  {buyRatio.toFixed(0)}% buys
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '12px',
        padding: '10px',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '8px',
        fontSize: '11px',
        color: '#64748b'
      }}>
        💡 Trending pools across all DEXs. High volume + high buy ratio = strong demand.
      </div>
    </div>
  );
}
