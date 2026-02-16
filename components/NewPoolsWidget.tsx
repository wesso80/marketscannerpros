'use client';

import { useState, useEffect } from 'react';

interface NewPool {
  id: string;
  name: string;
  network: string;
  dex: string;
  priceUsd: number;
  change1h: number;
  change24h: number;
  volume24h: number;
  liquidity: number;
  buys24h: number;
  sells24h: number;
}

const networkIcons: Record<string, string> = {
  'eth': '⟠',
  'solana': '◎',
  'bsc': '🔶',
  'arbitrum': '🔵',
  'polygon': '🟣',
  'base': '🔷',
  'avalanche': '🔺',
  'optimism': '🔴',
};

export default function NewPoolsWidget() {
  const [pools, setPools] = useState<NewPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPools() {
      try {
        const res = await fetch('/api/crypto/new-pools');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setPools(data.pools || []);
      } catch (e) {
        setError('Failed to load new pools');
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchPools();
    const interval = setInterval(fetchPools, 60000);
    return () => clearInterval(interval);
  }, []);

  const formatVolume = (vol: number) => {
    if (vol >= 1e9) return `$${(vol / 1e9).toFixed(2)}B`;
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(2)}M`;
    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(1)}K`;
    return `$${vol.toFixed(0)}`;
  };

  const formatPrice = (price: number) => {
    if (price < 0.00001) return `$${price.toExponential(2)}`;
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div style={{
        background: 'var(--msp-card)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #334155',
      }}>
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-slate-700 rounded w-40"></div>
          <div className="h-16 bg-slate-700/50 rounded"></div>
          <div className="h-16 bg-slate-700/50 rounded"></div>
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
        border: '1px solid #334155',
        textAlign: 'center',
        color: '#ef4444',
      }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--msp-card)',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid #334155',
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🌱</span>
          <h3 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 600, margin: 0 }}>
            New DEX Pools
          </h3>
        </div>
        <span style={{
          fontSize: '10px',
          color: '#10b981',
          background: 'rgba(16, 185, 129, 0.15)',
          padding: '4px 8px',
          borderRadius: '12px',
          fontWeight: 600
        }}>
          JUST CREATED
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {pools.slice(0, 10).map((pool) => {
          const buyRatio = pool.buys24h + pool.sells24h > 0 
            ? (pool.buys24h / (pool.buys24h + pool.sells24h)) * 100 
            : 50;
          
          return (
            <div
              key={pool.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '8px',
                border: '1px solid #334155',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '16px' }}>
                  {networkIcons[pool.network] || '🔷'}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ 
                    color: '#f1f5f9', 
                    fontSize: '13px', 
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '180px'
                  }}>
                    {pool.name}
                  </div>
                  <div style={{ 
                    color: '#64748b', 
                    fontSize: '10px',
                    display: 'flex',
                    gap: '6px',
                    alignItems: 'center'
                  }}>
                    <span style={{ textTransform: 'capitalize' }}>{pool.network}</span>
                    <span>•</span>
                    <span style={{ textTransform: 'uppercase' }}>{pool.dex}</span>
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'center', minWidth: '70px' }}>
                <div style={{ color: '#f1f5f9', fontSize: '12px', fontWeight: 600 }}>
                  {formatPrice(pool.priceUsd)}
                </div>
                <div style={{ 
                  color: (pool.change24h ?? 0) >= 0 ? '#10b981' : '#ef4444',
                  fontSize: '10px',
                  fontWeight: 600
                }}>
                  {(pool.change24h ?? 0) >= 0 ? '+' : ''}{(pool.change24h ?? 0).toFixed(1)}%
                </div>
              </div>

              <div style={{ textAlign: 'right', minWidth: '80px' }}>
                <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                  Vol: {formatVolume(pool.volume24h)}
                </div>
                <div style={{ 
                  fontSize: '10px',
                  color: buyRatio > 55 ? '#10b981' : buyRatio < 45 ? '#ef4444' : '#64748b'
                }}>
                  {buyRatio.toFixed(0)}% buys
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ 
        marginTop: '12px',
        padding: '8px',
        background: 'rgba(234, 179, 8, 0.1)',
        borderRadius: '6px',
        border: '1px solid rgba(234, 179, 8, 0.2)'
      }}>
        <p style={{ 
          color: '#eab308', 
          fontSize: '10px', 
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span>⚠️</span>
          New pools are high-risk. Many are scams or rug pulls. DYOR.
        </p>
      </div>
    </div>
  );
}
