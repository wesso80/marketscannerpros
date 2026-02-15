'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUserTier, canAccessPortfolioInsights } from '@/lib/useUserTier';
import { ToolsPageHeader } from '@/components/ToolsPageHeader';
import { useAIPageContext } from '@/lib/ai/pageContext';
import UpgradeGate from '@/components/UpgradeGate';

interface CommodityData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  unit: string;
  category: string;
  date: string;
  history: { date: string; value: number }[];
}

interface CommoditiesResponse {
  commodities: CommodityData[];
  byCategory: {
    Energy: CommodityData[];
    Metals: CommodityData[];
    Agriculture: CommodityData[];
  };
  summary: {
    totalCommodities: number;
    gainers: number;
    losers: number;
    avgChange: number;
    topGainer: CommodityData | null;
    topLoser: CommodityData | null;
  };
  lastUpdate: string;
}

// Category icons and colors
const CATEGORY_CONFIG = {
  Energy: { icon: '⛽', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)' },
  Metals: { icon: '🔩', color: '#94a3b8', bgColor: 'rgba(148, 163, 184, 0.1)' },
  Agriculture: { icon: '🌾', color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.1)' },
};

// Commodity-specific icons (6 core commodities)
const COMMODITY_ICONS: { [key: string]: string } = {
  WTI: '🛢️',
  NATURAL_GAS: '🔥',
  GOLD: '🥇',
  SILVER: '🥈',
  COPPER: '🟤',
  WHEAT: '🌾',
};

export default function CommoditiesPage() {
  const { tier } = useUserTier();
  const { setPageData } = useAIPageContext();
  const [data, setData] = useState<CommoditiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'Energy' | 'Metals' | 'Agriculture'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchCommodities = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/commodities');
      const json = await res.json();
      
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to fetch commodities');
      }
      
      setData(json);
    } catch (err: any) {
      console.error('Failed to fetch commodities:', err);
      setError(err.message || 'Failed to load commodity data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCommodities();
    
    // Auto-refresh every 15 minutes (commodities update less frequently)
    if (autoRefresh) {
      const interval = setInterval(fetchCommodities, 15 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [fetchCommodities, autoRefresh]);

  // Push data to AI context
  useEffect(() => {
    if (data) {
      const commoditySymbols = data.commodities.map(c => c.symbol);
      const summaryText = data.summary ? 
        `Commodities: ${data.summary.gainers} gainers, ${data.summary.losers} losers. ` +
        `Top Gainer: ${data.summary.topGainer?.name} (+${data.summary.topGainer?.changePercent.toFixed(2)}%). ` +
        `Top Loser: ${data.summary.topLoser?.name} (${data.summary.topLoser?.changePercent.toFixed(2)}%)` : 
        'Loading commodity data...';
      
      setPageData({
        skill: 'commodities' as any,
        symbols: commoditySymbols,
        data: {
          commodities: data.commodities,
          summary: data.summary,
          selectedCategory,
          lastUpdate: data.lastUpdate,
        },
        summary: summaryText,
      });
    }
  }, [data, selectedCategory, setPageData]);

  const filteredCommodities = data?.commodities.filter(c => 
    selectedCategory === 'all' || c.category === selectedCategory
  ) || [];

  const formatPrice = (price: number, unit: string) => {
    if (unit.includes('cents')) {
      return `${price.toFixed(2)}¢`;
    }
    return `$${price.toFixed(2)}`;
  };

  const formatChange = (change: number, changePercent: number) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
  };

  // Gate for Pro+ users
  if (!canAccessPortfolioInsights(tier)) {
    return (
      <div style={{ padding: '2rem', color: '#fff', minHeight: '100vh', background: '#0f172a' }}>
        <ToolsPageHeader 
          badge="Commodities"
          title="Commodities Dashboard" 
          subtitle="Find real-time commodity prices with live energy, metals, and agriculture context"
          icon="🛢️"
        />
        <main style={{ padding: '24px 16px', display: 'flex', justifyContent: 'center' }}>
          <UpgradeGate feature="Commodities Dashboard" requiredTier="pro" />
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', color: '#fff', minHeight: '100vh', background: '#0f172a' }}>
        <ToolsPageHeader 
          badge="Commodities"
          title="Commodities Dashboard" 
          subtitle="Find real-time commodity prices with live energy, metals, and agriculture context"
          icon="🛢️"
        />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', animation: 'pulse 2s infinite' }}>⛽🔩🌾</div>
            <div style={{ color: '#94a3b8' }}>Loading commodity data...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', color: '#fff', minHeight: '100vh', background: '#0f172a' }}>
        <ToolsPageHeader 
          badge="Commodities"
          title="Commodities Dashboard" 
          subtitle="Find real-time commodity prices with live energy, metals, and agriculture context"
          icon="🛢️"
        />
        <div style={{ 
          background: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          padding: '2rem',
          textAlign: 'center',
          maxWidth: '600px',
          margin: '2rem auto'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
          <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>
          <button
            onClick={fetchCommodities}
            style={{
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', color: '#fff', minHeight: '100vh', background: '#0f172a' }}>
      <ToolsPageHeader 
        badge="Commodities"
        title="Commodities Dashboard" 
        subtitle="Find real-time commodity prices across energy, metals, and agriculture"
        icon="🛢️"
      />

      {/* Summary Cards */}
      {data?.summary && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '1rem', 
          marginBottom: '2rem' 
        }}>
          {/* Top Gainer */}
          {data.summary.topGainer && (
            <div style={{
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '12px',
              padding: '1.25rem',
            }}>
              <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Top Gainer</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.5rem' }}>{COMMODITY_ICONS[data.summary.topGainer.symbol] || '📊'}</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#22c55e' }}>{data.summary.topGainer.name}</div>
                  <div style={{ color: '#22c55e', fontSize: '0.9rem' }}>
                    +{data.summary.topGainer.changePercent.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top Loser */}
          {data.summary.topLoser && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '1.25rem',
            }}>
              <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Top Loser</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.5rem' }}>{COMMODITY_ICONS[data.summary.topLoser.symbol] || '📊'}</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#ef4444' }}>{data.summary.topLoser.name}</div>
                  <div style={{ color: '#ef4444', fontSize: '0.9rem' }}>
                    {data.summary.topLoser.changePercent.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Gainers vs Losers */}
          <div style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '12px',
            padding: '1.25rem',
          }}>
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Market Breadth</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div>
                <span style={{ color: '#22c55e', fontWeight: 600, fontSize: '1.25rem' }}>{data.summary.gainers}</span>
                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}> ↑</span>
              </div>
              <div>
                <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '1.25rem' }}>{data.summary.losers}</span>
                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}> ↓</span>
              </div>
            </div>
          </div>

          {/* Average Change */}
          <div style={{
            background: 'rgba(148, 163, 184, 0.1)',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            borderRadius: '12px',
            padding: '1.25rem',
          }}>
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Avg Change</div>
            <div style={{ 
              fontWeight: 600, 
              fontSize: '1.25rem',
              color: data.summary.avgChange >= 0 ? '#22c55e' : '#ef4444'
            }}>
              {data.summary.avgChange >= 0 ? '+' : ''}{data.summary.avgChange.toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      {/* Category Filters */}
      <div style={{ 
        display: 'flex', 
        gap: '0.75rem', 
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <button
          onClick={() => setSelectedCategory('all')}
          style={{
            background: selectedCategory === 'all' ? '#3b82f6' : 'rgba(59, 130, 246, 0.1)',
            border: `1px solid ${selectedCategory === 'all' ? '#3b82f6' : 'rgba(59, 130, 246, 0.3)'}`,
            color: '#fff',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          📊 All ({data?.commodities.length || 0})
        </button>
        {(['Energy', 'Metals', 'Agriculture'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            style={{
              background: selectedCategory === cat ? CATEGORY_CONFIG[cat].color : CATEGORY_CONFIG[cat].bgColor,
              border: `1px solid ${CATEGORY_CONFIG[cat].color}`,
              color: '#fff',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            {CATEGORY_CONFIG[cat].icon} {cat} ({data?.byCategory[cat].length || 0})
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ marginRight: '0.5rem' }}
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchCommodities}
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#3b82f6',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            ⟳ Refresh
          </button>
        </div>
      </div>

      {/* Commodities Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
        gap: '1rem' 
      }}>
        {filteredCommodities.map((commodity) => {
          const isPositive = commodity.changePercent >= 0;
          const catConfig = CATEGORY_CONFIG[commodity.category as keyof typeof CATEGORY_CONFIG];
          
          return (
            <div
              key={commodity.symbol}
              style={{
                background: 'rgba(30, 41, 59, 0.5)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '12px',
                padding: '1.25rem',
                transition: 'all 0.2s',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '2rem' }}>{COMMODITY_ICONS[commodity.symbol] || '📊'}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{commodity.name}</div>
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: catConfig.color,
                      background: catConfig.bgColor,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      display: 'inline-block',
                    }}>
                      {catConfig.icon} {commodity.category}
                    </div>
                  </div>
                </div>
              </div>

              {/* Price */}
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>
                  {formatPrice(commodity.price, commodity.unit)}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{commodity.unit}</div>
              </div>

              {/* Change */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                background: isPositive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: isPositive ? '#22c55e' : '#ef4444',
                fontSize: '0.95rem',
                fontWeight: 500,
              }}>
                <span>{isPositive ? '▲' : '▼'}</span>
                <span>{formatChange(commodity.change, commodity.changePercent)}</span>
              </div>

              {/* Mini Sparkline (simple visual) */}
              {commodity.history && commodity.history.length > 5 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>
                    Last 7 days
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'flex-end', 
                    gap: '3px', 
                    height: '30px' 
                  }}>
                    {commodity.history.slice(0, 7).reverse().map((point, i) => {
                      const min = Math.min(...commodity.history.slice(0, 7).map(p => p.value));
                      const max = Math.max(...commodity.history.slice(0, 7).map(p => p.value));
                      const range = max - min || 1;
                      const height = ((point.value - min) / range) * 100;
                      
                      return (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            height: `${Math.max(10, height)}%`,
                            background: isPositive 
                              ? 'linear-gradient(180deg, #22c55e 0%, rgba(34, 197, 94, 0.3) 100%)'
                              : 'linear-gradient(180deg, #ef4444 0%, rgba(239, 68, 68, 0.3) 100%)',
                            borderRadius: '2px',
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Last Update */}
              <div style={{ 
                marginTop: '0.75rem', 
                fontSize: '0.75rem', 
                color: '#64748b',
                textAlign: 'right',
              }}>
                Updated: {commodity.date}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {data?.lastUpdate && (
        <div style={{ 
          marginTop: '2rem', 
          textAlign: 'center', 
          color: '#64748b', 
          fontSize: '0.85rem' 
        }}>
          Data from Alpha Vantage • Last update: {new Date(data.lastUpdate).toLocaleTimeString()}
          {autoRefresh && ' • Auto-refreshing every 15 minutes'}
        </div>
      )}
    </div>
  );
}
