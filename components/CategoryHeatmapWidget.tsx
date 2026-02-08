'use client';

import { useState, useEffect } from 'react';

interface Category {
  id: string;
  name: string;
  marketCap: number;
  change24h: number;
  volume24h: number;
  topCoins: string[];
}

export default function CategoryHeatmapWidget() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'marketCap' | 'change24h'>('marketCap');

  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch('/api/crypto/categories');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (data.success) {
          setCategories(data.highlighted || []);
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

    fetchCategories();
    const interval = setInterval(fetchCategories, 300000); // Refresh every 5 mins
    return () => clearInterval(interval);
  }, []);

  const formatMarketCap = (cap: number | null | undefined): string => {
    if (cap == null) return 'N/A';
    if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
    if (cap >= 1e9) return `$${(cap / 1e9).toFixed(0)}B`;
    if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
    return `$${cap.toLocaleString()}`;
  };

  const getHeatColor = (change: number | null | undefined): string => {
    const safeChange = change ?? 0;
    const intensity = Math.min(Math.abs(safeChange) / 15, 1);
    
    if (safeChange > 0) {
      return `rgba(16, 185, 129, ${0.15 + intensity * 0.35})`;
    } else if (safeChange < 0) {
      return `rgba(239, 68, 68, ${0.15 + intensity * 0.35})`;
    }
    return 'rgba(100, 116, 139, 0.2)';
  };

  const getBorderColor = (change: number | null | undefined): string => {
    const safeChange = change ?? 0;
    if (safeChange > 5) return 'rgba(16, 185, 129, 0.6)';
    if (safeChange > 0) return 'rgba(16, 185, 129, 0.3)';
    if (safeChange < -5) return 'rgba(239, 68, 68, 0.6)';
    if (safeChange < 0) return 'rgba(239, 68, 68, 0.3)';
    return 'rgba(100, 116, 139, 0.3)';
  };

  const getCategoryEmoji = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.includes('layer-1') || lower.includes('layer 1')) return '⛓️';
    if (lower.includes('layer-2') || lower.includes('layer 2')) return '🔗';
    if (lower.includes('defi')) return '🏦';
    if (lower.includes('meme')) return '🐕';
    if (lower.includes('ai') || lower.includes('artificial')) return '🤖';
    if (lower.includes('gaming') || lower.includes('game')) return '🎮';
    if (lower.includes('nft')) return '🖼️';
    if (lower.includes('real-world') || lower.includes('rwa')) return '🏠';
    if (lower.includes('exchange')) return '📊';
    if (lower.includes('privacy')) return '🔒';
    if (lower.includes('oracle')) return '🔮';
    if (lower.includes('storage')) return '💾';
    return '📈';
  };

  const sortedCategories = [...categories].sort((a, b) => {
    if (sortBy === 'change24h') return Math.abs(b.change24h ?? 0) - Math.abs(a.change24h ?? 0);
    return (b.marketCap ?? 0) - (a.marketCap ?? 0);
  });

  if (loading) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #334155'
      }}>
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-slate-700 rounded w-36"></div>
          <div className="grid grid-cols-2 gap-2">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="h-20 bg-slate-700/50 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #334155'
      }}>
        <div style={{ color: '#ef4444', fontSize: '14px' }}>Failed to load sectors</div>
      </div>
    );
  }

  // Compute market sentiment
  const avgChange = categories.length > 0 
    ? categories.reduce((sum, c) => sum + (c.change24h ?? 0), 0) / categories.length 
    : 0;
  const bullishCount = categories.filter(c => (c.change24h ?? 0) > 0).length;
  const marketSentiment = bullishCount > categories.length * 0.6 ? 'RISK ON' : 
                          bullishCount < categories.length * 0.4 ? 'RISK OFF' : 'MIXED';

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
          📊 Sector Performance
        </h3>
        <div style={{
          fontSize: '11px',
          padding: '4px 10px',
          borderRadius: '12px',
          fontWeight: 600,
          background: marketSentiment === 'RISK ON' ? 'rgba(16, 185, 129, 0.2)' : 
                      marketSentiment === 'RISK OFF' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(100, 116, 139, 0.2)',
          color: marketSentiment === 'RISK ON' ? '#10b981' : 
                 marketSentiment === 'RISK OFF' ? '#ef4444' : '#94a3b8'
        }}>
          {marketSentiment}
        </div>
      </div>

      {/* Sort Toggle */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '12px'
      }}>
        <button
          onClick={() => setSortBy('marketCap')}
          style={{
            padding: '4px 12px',
            fontSize: '11px',
            fontWeight: 500,
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            background: sortBy === 'marketCap' ? '#10b981' : '#0f172a',
            color: sortBy === 'marketCap' ? '#000' : '#64748b',
          }}
        >
          By Market Cap
        </button>
        <button
          onClick={() => setSortBy('change24h')}
          style={{
            padding: '4px 12px',
            fontSize: '11px',
            fontWeight: 500,
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            background: sortBy === 'change24h' ? '#10b981' : '#0f172a',
            color: sortBy === 'change24h' ? '#000' : '#64748b',
          }}
        >
          By Change
        </button>
      </div>

      {/* Category Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)', 
        gap: '8px' 
      }}>
        {sortedCategories.slice(0, 8).map((cat) => (
          <div
            key={cat.id}
            style={{
              padding: '12px',
              borderRadius: '8px',
              background: getHeatColor(cat.change24h),
              border: `1px solid ${getBorderColor(cat.change24h)}`,
              transition: 'all 0.2s',
              cursor: 'default'
            }}
          >
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              marginBottom: '6px'
            }}>
              <span style={{ fontSize: '14px' }}>{getCategoryEmoji(cat.name)}</span>
              <span style={{ 
                color: '#f1f5f9', 
                fontSize: '12px', 
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {cat.name.length > 12 ? cat.name.slice(0, 12) + '...' : cat.name}
              </span>
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'flex-end' 
            }}>
              <span style={{ color: '#94a3b8', fontSize: '10px' }}>
                {formatMarketCap(cat.marketCap)}
              </span>
              <span style={{ 
                color: (cat.change24h ?? 0) >= 0 ? '#10b981' : '#ef4444',
                fontSize: '14px',
                fontWeight: 700
              }}>
                {(cat.change24h ?? 0) >= 0 ? '+' : ''}{(cat.change24h ?? 0).toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Market Summary */}
      <div style={{
        marginTop: '12px',
        padding: '10px',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '8px',
        fontSize: '11px',
        color: '#64748b'
      }}>
        💡 {bullishCount}/{categories.length} sectors green • Avg change: {' '}
        <span style={{ color: (avgChange ?? 0) >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
          {(avgChange ?? 0) >= 0 ? '+' : ''}{(avgChange ?? 0).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
