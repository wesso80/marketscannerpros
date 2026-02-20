'use client';

import { useState, useEffect } from 'react';

interface DominanceData {
  btc: number;
  eth: number;
  usdt: number;
  usdc: number;
  btcChange24h?: number;
  usdtChange24h?: number;
  totalMarketCap: number;
  totalMarketCapChange24h: number;
  loading: boolean;
  error?: string;
}

export default function DominanceWidget() {
  const [data, setData] = useState<DominanceData>({
    btc: 0,
    eth: 0,
    usdt: 0,
    usdc: 0,
    totalMarketCap: 0,
    totalMarketCapChange24h: 0,
    loading: true,
  });

  useEffect(() => {
    async function fetchDominance() {
      try {
        const res = await fetch('/api/crypto/market-overview', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to fetch');

        const json = await res.json();
        const payload = json?.data || {};
        const marketCap = payload.dominanceMap || {};

        setData({
          btc: payload.btcDominance ?? marketCap.btc ?? 0,
          eth: payload.ethDominance ?? marketCap.eth ?? 0,
          usdt: payload.usdtDominance ?? marketCap.usdt ?? 0,
          usdc: payload.usdcDominance ?? marketCap.usdc ?? 0,
          totalMarketCap: payload.totalMarketCap || 0,
          totalMarketCapChange24h: payload.marketCapChange24h || 0,
          loading: false,
        });
      } catch (err: any) {
        setData(prev => ({ ...prev, loading: false, error: err.message }));
      }
    }
    
    fetchDominance();
    const interval = setInterval(fetchDominance, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const formatMarketCap = (value: number) => {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(0)}B`;
    return `$${(value / 1e6).toFixed(0)}M`;
  };

  // Determine sentiment based on stablecoin dominance
  // High USDT+USDC = bearish (money in stables), Low = bullish (money in risk assets)
  const stableDominance = data.usdt + data.usdc;
  const stableSentiment = stableDominance > 8 ? 'BEARISH' : stableDominance > 6 ? 'CAUTIOUS' : 'BULLISH';
  const stableColor = stableDominance > 8 ? '#ef4444' : stableDominance > 6 ? '#f59e0b' : '#10b981';

  if (data.loading) {
    return (
      <div style={{
        background: 'var(--msp-card)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #334155'
      }}>
        <div style={{ color: '#64748b', textAlign: 'center' }}>Loading dominance data...</div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div style={{
        background: 'var(--msp-card)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #334155'
      }}>
        <div style={{ color: '#ef4444', textAlign: 'center' }}>Failed to load dominance</div>
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
          📊 Market Dominance
        </h3>
        <div style={{
          fontSize: '11px',
          color: '#64748b',
          background: '#0f172a',
          padding: '4px 8px',
          borderRadius: '4px'
        }}>
          Total: {formatMarketCap(data.totalMarketCap)}
          <span style={{ 
            color: data.totalMarketCapChange24h >= 0 ? '#10b981' : '#ef4444',
            marginLeft: '4px'
          }}>
            {data.totalMarketCapChange24h >= 0 ? '+' : ''}{data.totalMarketCapChange24h.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* BTC Dominance */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '6px'
        }}>
          <span style={{ color: '#f7931a', fontWeight: 600, fontSize: '14px' }}>
            ₿ BTC Dominance
          </span>
          <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '18px' }}>
            {data.btc.toFixed(1)}%
          </span>
        </div>
        <div style={{
          height: '8px',
          background: '#1e293b',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${Math.min(data.btc, 100)}%`,
            height: '100%',
            background: '#f7931a',
            borderRadius: '4px',
            transition: 'width 0.5s ease'
          }} />
        </div>
        <div style={{ 
          fontSize: '11px', 
          color: '#64748b', 
          marginTop: '4px'
        }}>
          {data.btc > 55 ? '🔥 BTC Season - Alts underperforming' : 
           data.btc < 45 ? '🚀 Alt Season - Money flowing to alts' : 
           '⚖️ Balanced market'}
        </div>
      </div>

      {/* ETH Dominance */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '6px'
        }}>
          <span style={{ color: '#627eea', fontWeight: 600, fontSize: '14px' }}>
            Ξ ETH Dominance
          </span>
          <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '18px' }}>
            {data.eth.toFixed(1)}%
          </span>
        </div>
        <div style={{
          height: '8px',
          background: '#1e293b',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${Math.min(data.eth * 2, 100)}%`, // Scale up for visibility
            height: '100%',
            background: 'var(--msp-accent)',
            borderRadius: '4px',
            transition: 'width 0.5s ease'
          }} />
        </div>
      </div>

      {/* Stablecoin Dominance (USDT + USDC) */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '6px'
        }}>
          <span style={{ color: '#26a17b', fontWeight: 600, fontSize: '14px' }}>
            💵 Stablecoin Dominance
          </span>
          <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '18px' }}>
            {stableDominance.toFixed(1)}%
          </span>
        </div>
        <div style={{
          height: '8px',
          background: '#1e293b',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${Math.min(stableDominance * 5, 100)}%`, // Scale up for visibility
            height: '100%',
            background: stableColor,
            borderRadius: '4px',
            transition: 'width 0.5s ease'
          }} />
        </div>
        <div style={{ 
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '11px', 
          marginTop: '6px'
        }}>
          <span style={{ color: '#64748b' }}>
            USDT: {data.usdt.toFixed(2)}% | USDC: {data.usdc.toFixed(2)}%
          </span>
          <span style={{ 
            color: stableColor,
            fontWeight: 600
          }}>
            {stableSentiment}
          </span>
        </div>
      </div>

      {/* Interpretation */}
      <div style={{
        background: '#0f172a',
        borderRadius: '8px',
        padding: '12px',
        marginTop: '12px'
      }}>
        <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>
          <strong style={{ color: '#f1f5f9' }}>📈 How to read:</strong><br/>
          • <span style={{ color: '#f7931a' }}>High BTC dominance</span> = Risk-off, BTC outperforms alts<br/>
          • <span style={{ color: '#26a17b' }}>High stablecoin dominance</span> = Money on sidelines, bearish<br/>
          • <span style={{ color: '#10b981' }}>Low stablecoin dominance</span> = Money in market, bullish
        </div>
      </div>
    </div>
  );
}
