'use client';

import { useState, useEffect } from 'react';

interface Mover {
  id: string;
  name: string;
  symbol: string;
  image: string;
  price: number;
  change: number;
  volume: number;
  marketCap: number;
  rank: number;
}

interface TopMoversData {
  gainers: Mover[];
  losers: Mover[];
  duration: string;
}

export default function TopMoversWidget() {
  const [data, setData] = useState<TopMoversData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<'1h' | '24h' | '7d'>('24h');
  const [view, setView] = useState<'gainers' | 'losers'>('gainers');

  useEffect(() => {
    async function fetchMovers() {
      try {
        setLoading(true);
        const res = await fetch(`/api/crypto/top-movers?duration=${duration}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const result = await res.json();
        if (result.success) {
          setData(result);
          setError(null);
        } else {
          throw new Error(result.error);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchMovers();
    const interval = setInterval(fetchMovers, 300000); // Refresh every 5 mins
    return () => clearInterval(interval);
  }, [duration]);

  const formatPrice = (price: number | null | undefined): string => {
    if (price == null) return 'N/A';
    if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.0001) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(8)}`;
  };

  const formatVolume = (vol: number | null | undefined): string => {
    if (vol == null) return 'N/A';
    if (vol >= 1e9) return `$${(vol / 1e9).toFixed(1)}B`;
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(0)}M`;
    return `$${(vol / 1e3).toFixed(0)}K`;
  };

  if (loading && !data) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #334155'
      }}>
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-slate-700 rounded w-40"></div>
          <div className="flex gap-2">
            <div className="h-8 bg-slate-700 rounded w-20"></div>
            <div className="h-8 bg-slate-700 rounded w-20"></div>
          </div>
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-12 bg-slate-700/50 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #334155'
      }}>
        <div style={{ color: '#ef4444', fontSize: '14px' }}>Failed to load top movers</div>
      </div>
    );
  }

  const movers = view === 'gainers' ? data?.gainers : data?.losers;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
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
          {view === 'gainers' ? '🚀' : '📉'} Top {view === 'gainers' ? 'Gainers' : 'Losers'}
        </h3>
        
        {/* Duration Toggle */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['1h', '24h', '7d'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 500,
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                background: duration === d ? '#10b981' : '#0f172a',
                color: duration === d ? '#000' : '#64748b',
                transition: 'all 0.2s'
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Gainers/Losers Toggle */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '16px',
        background: '#0f172a',
        padding: '4px',
        borderRadius: '8px'
      }}>
        <button
          onClick={() => setView('gainers')}
          style={{
            flex: 1,
            padding: '8px',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            background: view === 'gainers' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
            color: view === 'gainers' ? '#10b981' : '#64748b',
            transition: 'all 0.2s'
          }}
        >
          🟢 Gainers
        </button>
        <button
          onClick={() => setView('losers')}
          style={{
            flex: 1,
            padding: '8px',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            background: view === 'losers' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
            color: view === 'losers' ? '#ef4444' : '#64748b',
            transition: 'all 0.2s'
          }}
        >
          🔴 Losers
        </button>
      </div>

      {/* Movers List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {movers?.slice(0, 8).map((coin, index) => (
          <div 
            key={coin.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: 'rgba(15, 23, 42, 0.5)',
              borderRadius: '8px',
              border: index === 0 
                ? `1px solid ${view === 'gainers' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}` 
                : '1px solid transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ 
                color: '#64748b', 
                fontSize: '11px', 
                fontWeight: 600,
                width: '18px'
              }}>
                {index + 1}
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
                <div style={{ color: '#64748b', fontSize: '10px' }}>
                  Vol: {formatVolume(coin.volume)}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#f1f5f9', fontSize: '13px', fontWeight: 500, fontFamily: 'monospace' }}>
                {formatPrice(coin.price)}
              </div>
              <div style={{ 
                color: (coin.change ?? 0) >= 0 ? '#10b981' : '#ef4444', 
                fontSize: '13px',
                fontWeight: 600
              }}>
                {(coin.change ?? 0) >= 0 ? '+' : ''}{(coin.change ?? 0).toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer insight */}
      <div style={{
        marginTop: '12px',
        padding: '10px',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '8px',
        fontSize: '11px',
        color: '#64748b'
      }}>
        💡 {view === 'gainers' 
          ? `Top ${duration} gainers often indicate momentum - consider volume confirmation before entry.`
          : `Big losers may present bounce opportunities - check support levels and volume.`
        }
      </div>
    </div>
  );
}
