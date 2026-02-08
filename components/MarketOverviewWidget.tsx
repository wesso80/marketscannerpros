'use client';

import { useState, useEffect } from 'react';

interface DominanceCoin {
  symbol: string;
  dominance: number;
}

interface MarketData {
  totalMarketCap: number;
  totalMarketCapFormatted: string;
  totalVolume: number;
  totalVolumeFormatted: string;
  marketCapChange24h: number;
  dominance: DominanceCoin[];
  sparkline: { time: number; value: number }[];
}

export default function MarketOverviewWidget() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMarket() {
      try {
        const res = await fetch('/api/crypto/market-overview');
        if (!res.ok) throw new Error('Failed to fetch');
        const result = await res.json();
        if (result.success) {
          setData(result.data);
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

    fetchMarket();
    const interval = setInterval(fetchMarket, 300000); // Refresh every 5 mins
    return () => clearInterval(interval);
  }, []);

  // Simple sparkline SVG
  const renderSparkline = () => {
    if (!data?.sparkline?.length) return null;
    
    const values = data.sparkline.map(p => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    
    const width = 200;
    const height = 40;
    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    const isUp = values[values.length - 1] > values[0];
    const color = isUp ? '#10b981' : '#ef4444';

    return (
      <svg width={width} height={height} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon 
          points={`0,${height} ${points} ${width},${height}`}
          fill="url(#sparklineGradient)"
        />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
        />
      </svg>
    );
  };

  if (loading) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #334155',
        height: '100%'
      }}>
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-slate-700 rounded w-40"></div>
          <div className="h-20 bg-slate-700/50 rounded"></div>
          <div className="h-10 bg-slate-700/50 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #334155'
      }}>
        <div style={{ color: '#ef4444', fontSize: '14px' }}>Failed to load market data</div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid #334155',
      height: '100%'
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
          📈 Market Overview
        </h3>
        <span style={{
          fontSize: '12px',
          color: (data.marketCapChange24h ?? 0) >= 0 ? '#10b981' : '#ef4444',
          fontWeight: 600
        }}>
          {(data.marketCapChange24h ?? 0) >= 0 ? '↗' : '↘'} {Math.abs(data.marketCapChange24h ?? 0).toFixed(2)}%
        </span>
      </div>

      {/* Market Cap */}
      <div style={{ 
        marginBottom: '16px',
        padding: '16px',
        background: 'rgba(15, 23, 42, 0.6)',
        borderRadius: '10px',
        border: (data.marketCapChange24h ?? 0) >= 0 
          ? '1px solid rgba(16, 185, 129, 0.2)' 
          : '1px solid rgba(239, 68, 68, 0.2)'
      }}>
        <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>
          Total Crypto Market Cap
        </div>
        <div style={{ 
          color: '#f1f5f9', 
          fontSize: '28px', 
          fontWeight: 700,
          marginBottom: '8px'
        }}>
          {data.totalMarketCapFormatted}
        </div>
        {renderSparkline()}
        <div style={{ 
          color: '#64748b', 
          fontSize: '10px', 
          marginTop: '8px' 
        }}>
          30 Day Chart
        </div>
      </div>

      {/* Volume */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        padding: '12px',
        background: 'rgba(15, 23, 42, 0.4)',
        borderRadius: '8px',
        marginBottom: '16px'
      }}>
        <span style={{ color: '#94a3b8', fontSize: '12px' }}>24h Volume</span>
        <span style={{ color: '#f1f5f9', fontSize: '14px', fontWeight: 600 }}>
          {data.totalVolumeFormatted}
        </span>
      </div>

      {/* Dominance */}
      <div>
        <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '10px' }}>
          Market Dominance
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(data.dominance || []).slice(0, 4).map((coin, index) => {
            const colors = ['#f7931a', '#627eea', '#14f195', '#e84142'];
            return (
              <div
                key={coin.symbol}
                style={{
                  padding: '6px 10px',
                  background: `${colors[index]}15`,
                  borderRadius: '6px',
                  border: `1px solid ${colors[index]}40`,
                }}
              >
                <span style={{ 
                  color: colors[index], 
                  fontSize: '12px', 
                  fontWeight: 600 
                }}>
                  {coin.symbol}
                </span>
                <span style={{ 
                  color: '#94a3b8', 
                  fontSize: '11px',
                  marginLeft: '6px'
                }}>
                  {(coin.dominance ?? 0).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
