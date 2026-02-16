'use client';

import { useState, useEffect } from 'react';

interface TrendingCoin {
  id: string;
  name: string;
  symbol: string;
  rank: number;
  image: string;
  score: number;
  price: number;
  change24h: number;
  marketCap: number;
}

interface TrendingCategory {
  id: number;
  name: string;
  change1h: number;
}

export default function TrendingCoinsWidget() {
  const [coins, setCoins] = useState<TrendingCoin[]>([]);
  const [categories, setCategories] = useState<TrendingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTrending() {
      try {
        const res = await fetch('/api/crypto/trending');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (data.success) {
          setCoins(data.coins || []);
          setCategories(data.categories || []);
        } else {
          throw new Error(data.error);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchTrending();
    const interval = setInterval(fetchTrending, 300000); // Refresh every 5 mins
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (price: number | null | undefined): string => {
    if (price == null) return 'N/A';
    if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.0001) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(8)}`;
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
          <div className="h-5 bg-slate-700 rounded w-32"></div>
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-10 bg-slate-700/50 rounded"></div>
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
        <div style={{ color: '#ef4444', fontSize: '14px' }}>Failed to load trending</div>
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
          🔥 Trending Now
        </h3>
        <span style={{
          fontSize: '11px',
          color: '#64748b',
          background: '#0f172a',
          padding: '4px 8px',
          borderRadius: '4px'
        }}>
          Last 24h
        </span>
      </div>

      {/* Coins List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {coins.slice(0, 7).map((coin, index) => (
          <div 
            key={coin.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: index === 0 ? 'rgba(234, 179, 8, 0.1)' : 'rgba(15, 23, 42, 0.5)',
              borderRadius: '8px',
              border: index === 0 ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid transparent',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ 
                color: index === 0 ? '#eab308' : '#64748b', 
                fontSize: '12px', 
                fontWeight: 600,
                width: '20px'
              }}>
                #{coin.score}
              </span>
              <img 
                src={coin.image} 
                alt={coin.name}
                style={{ width: '24px', height: '24px', borderRadius: '50%' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div>
                <div style={{ color: '#f1f5f9', fontSize: '14px', fontWeight: 500 }}>
                  {coin.symbol}
                </div>
                <div style={{ color: '#64748b', fontSize: '11px' }}>
                  {coin.name.length > 15 ? coin.name.slice(0, 15) + '...' : coin.name}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#f1f5f9', fontSize: '13px', fontWeight: 500, fontFamily: 'monospace' }}>
                {formatPrice(coin.price)}
              </div>
              <div style={{ 
                color: (coin.change24h ?? 0) >= 0 ? '#10b981' : '#ef4444', 
                fontSize: '12px',
                fontWeight: 500
              }}>
                {(coin.change24h ?? 0) >= 0 ? '+' : ''}{(coin.change24h ?? 0).toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Trending Categories */}
      {categories.length > 0 && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #334155' }}>
          <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '8px', textTransform: 'uppercase' }}>
            Hot Categories
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {categories.map(cat => (
              <span 
                key={cat.id}
                style={{
                  fontSize: '11px',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  background: (cat.change1h ?? 0) >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: (cat.change1h ?? 0) >= 0 ? '#10b981' : '#ef4444',
                  border: `1px solid ${(cat.change1h ?? 0) >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                }}
              >
                {cat.name} {(cat.change1h ?? 0) >= 0 ? '↗' : '↘'} {Math.abs(cat.change1h ?? 0).toFixed(1)}%
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
