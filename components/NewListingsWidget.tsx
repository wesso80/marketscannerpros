'use client';

import { useState, useEffect } from 'react';

interface NewCoin {
  id: string;
  name: string;
  symbol: string;
  listedAt: string;
  timeAgo: string;
  hoursAgo: number;
  price: number | null;
  change24h: number | null;
  marketCap: number | null;
}

export default function NewListingsWidget() {
  const [coins, setCoins] = useState<NewCoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchNewListings() {
      try {
        const res = await fetch('/api/crypto/new-listings');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (data.success) {
          setCoins(data.coins || []);
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

    fetchNewListings();
    const interval = setInterval(fetchNewListings, 600000); // Refresh every 10 mins
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (price: number | null): string => {
    if (!price) return 'N/A';
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
          <div className="h-5 bg-slate-700 rounded w-36"></div>
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
        <div style={{ color: '#ef4444', fontSize: '14px' }}>Failed to load new listings</div>
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
          🆕 New Listings
        </h3>
        <span style={{
          fontSize: '11px',
          color: '#64748b',
          background: '#0f172a',
          padding: '4px 8px',
          borderRadius: '4px'
        }}>
          Latest 200+
        </span>
      </div>

      {/* Listings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {coins.slice(0, 8).map((coin, index) => (
          <div 
            key={coin.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: coin.hoursAgo < 24 ? 'rgba(234, 179, 8, 0.08)' : 'rgba(15, 23, 42, 0.5)',
              borderRadius: '8px',
              border: coin.hoursAgo < 24 ? '1px solid rgba(234, 179, 8, 0.2)' : '1px solid transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
              <div style={{
                background: coin.hoursAgo < 12 ? '#eab308' : 
                            coin.hoursAgo < 24 ? 'rgba(234, 179, 8, 0.3)' : 'rgba(100, 116, 139, 0.3)',
                color: coin.hoursAgo < 24 ? '#000' : '#94a3b8',
                fontSize: '9px',
                fontWeight: 700,
                padding: '3px 6px',
                borderRadius: '4px',
                whiteSpace: 'nowrap'
              }}>
                {coin.hoursAgo < 12 ? '🔥 NEW' : coin.timeAgo}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ 
                  color: '#f1f5f9', 
                  fontSize: '13px', 
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {coin.symbol}
                </div>
                <div style={{ 
                  color: '#64748b', 
                  fontSize: '10px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {coin.name.length > 18 ? coin.name.slice(0, 18) + '...' : coin.name}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ 
                color: '#f1f5f9', 
                fontSize: '12px', 
                fontWeight: 500, 
                fontFamily: 'monospace' 
              }}>
                {formatPrice(coin.price)}
              </div>
              {coin.change24h != null && (
                <div style={{ 
                  color: (coin.change24h ?? 0) >= 0 ? '#10b981' : '#ef4444', 
                  fontSize: '11px',
                  fontWeight: 500
                }}>
                  {(coin.change24h ?? 0) >= 0 ? '+' : ''}{(coin.change24h ?? 0).toFixed(1)}%
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '12px',
        padding: '10px',
        background: 'rgba(234, 179, 8, 0.1)',
        borderRadius: '8px',
        border: '1px solid rgba(234, 179, 8, 0.2)',
        fontSize: '11px',
        color: '#eab308'
      }}>
        ⚠️ New listings are high-risk. DYOR before investing. Many new coins fail.
      </div>
    </div>
  );
}
