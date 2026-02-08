'use client';

import { useState, useEffect } from 'react';

interface DefiData {
  marketCap: number;
  ethMarketCap: number;
  volume24h: number;
  dominance: number;
  defiToEthRatio: number;
  topCoin: string;
  topCoinDominance: number;
}

export default function DefiStatsWidget() {
  const [data, setData] = useState<DefiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDefi() {
      try {
        const res = await fetch('/api/crypto/defi-stats');
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

    fetchDefi();
    const interval = setInterval(fetchDefi, 300000); // Refresh every 5 mins
    return () => clearInterval(interval);
  }, []);

  const formatValue = (val: number): string => {
    if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
    if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
    return `$${val.toLocaleString()}`;
  };

  if (loading) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #334155'
      }}>
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-slate-700 rounded w-32"></div>
          <div className="grid grid-cols-2 gap-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-16 bg-slate-700/50 rounded"></div>
            ))}
          </div>
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
        <div style={{ color: '#ef4444', fontSize: '14px' }}>Failed to load DeFi stats</div>
      </div>
    );
  }

  // DeFi health indicator
  const defiHealth = data.defiToEthRatio > 50 ? 'Strong' : data.defiToEthRatio > 30 ? 'Healthy' : 'Weak';
  const healthColor = data.defiToEthRatio > 50 ? '#10b981' : data.defiToEthRatio > 30 ? '#eab308' : '#ef4444';

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
          🏦 DeFi Market
        </h3>
        <span style={{
          fontSize: '11px',
          padding: '4px 10px',
          borderRadius: '12px',
          fontWeight: 600,
          background: `${healthColor}22`,
          color: healthColor,
          border: `1px solid ${healthColor}44`
        }}>
          {defiHealth}
        </span>
      </div>

      {/* Stats Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)', 
        gap: '10px',
        marginBottom: '12px'
      }}>
        {/* DeFi Market Cap */}
        <div style={{
          padding: '12px',
          background: 'rgba(15, 23, 42, 0.6)',
          borderRadius: '8px',
          border: '1px solid rgba(51, 65, 85, 0.5)'
        }}>
          <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase' }}>
            DeFi Market Cap
          </div>
          <div style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: 700 }}>
            {formatValue(data.marketCap)}
          </div>
        </div>

        {/* 24h Volume */}
        <div style={{
          padding: '12px',
          background: 'rgba(15, 23, 42, 0.6)',
          borderRadius: '8px',
          border: '1px solid rgba(51, 65, 85, 0.5)'
        }}>
          <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase' }}>
            24h Volume
          </div>
          <div style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: 700 }}>
            {formatValue(data.volume24h)}
          </div>
        </div>

        {/* DeFi Dominance */}
        <div style={{
          padding: '12px',
          background: 'rgba(15, 23, 42, 0.6)',
          borderRadius: '8px',
          border: '1px solid rgba(51, 65, 85, 0.5)'
        }}>
          <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase' }}>
            DeFi Dominance
          </div>
          <div style={{ color: '#10b981', fontSize: '18px', fontWeight: 700 }}>
            {data.dominance.toFixed(2)}%
          </div>
        </div>

        {/* DeFi/ETH Ratio */}
        <div style={{
          padding: '12px',
          background: 'rgba(15, 23, 42, 0.6)',
          borderRadius: '8px',
          border: '1px solid rgba(51, 65, 85, 0.5)'
        }}>
          <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase' }}>
            DeFi/ETH Ratio
          </div>
          <div style={{ color: '#8b5cf6', fontSize: '18px', fontWeight: 700 }}>
            {data.defiToEthRatio.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Top DeFi Coin */}
      <div style={{
        padding: '12px',
        background: 'rgba(139, 92, 246, 0.1)',
        borderRadius: '8px',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ color: '#a78bfa', fontSize: '10px', textTransform: 'uppercase' }}>
            Top DeFi Coin
          </div>
          <div style={{ color: '#f1f5f9', fontSize: '14px', fontWeight: 600, marginTop: '2px' }}>
            {data.topCoin}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#64748b', fontSize: '10px' }}>DeFi Dominance</div>
          <div style={{ color: '#8b5cf6', fontSize: '16px', fontWeight: 700 }}>
            {data.topCoinDominance.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}
