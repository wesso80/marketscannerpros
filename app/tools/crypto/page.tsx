'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useUserTier } from '@/lib/useUserTier';
import { useAIPageContext } from '@/lib/ai/pageContext';

// Dynamic imports for code splitting
const TrendingCoinsWidget = dynamic(() => import('@/components/TrendingCoinsWidget'), { 
  ssr: false,
  loading: () => <WidgetSkeleton />
});
const TopMoversWidget = dynamic(() => import('@/components/TopMoversWidget'), { 
  ssr: false,
  loading: () => <WidgetSkeleton />
});
const CategoryHeatmapWidget = dynamic(() => import('@/components/CategoryHeatmapWidget'), { 
  ssr: false,
  loading: () => <WidgetSkeleton />
});
const MarketOverviewWidget = dynamic(() => import('@/components/MarketOverviewWidget'), { 
  ssr: false,
  loading: () => <WidgetSkeleton />
});
const NewListingsWidget = dynamic(() => import('@/components/NewListingsWidget'), { 
  ssr: false,
  loading: () => <WidgetSkeleton />
});
const DefiStatsWidget = dynamic(() => import('@/components/DefiStatsWidget'), { 
  ssr: false,
  loading: () => <WidgetSkeleton />
});
const TrendingPoolsWidget = dynamic(() => import('@/components/TrendingPoolsWidget'), { 
  ssr: false,
  loading: () => <WidgetSkeleton />
});
const CryptoHeatmap = dynamic(() => import('@/components/CryptoHeatmap'), { 
  ssr: false,
  loading: () => <WidgetSkeleton height="400px" />
});

function WidgetSkeleton({ height = '280px' }: { height?: string }) {
  return (
    <div 
      style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #334155',
        height,
      }}
    >
      <div className="animate-pulse space-y-4">
        <div className="h-5 bg-slate-700 rounded w-32"></div>
        <div className="h-16 bg-slate-700/50 rounded"></div>
        <div className="h-16 bg-slate-700/50 rounded"></div>
      </div>
    </div>
  );
}

type Section = 'overview' | 'market' | 'trending' | 'movers' | 'sectors' | 'defi' | 'dex' | 'listings';

interface SidebarItem {
  id: Section;
  label: string;
  icon: string;
  description: string;
}

const sidebarItems: SidebarItem[] = [
  { id: 'overview', label: 'Overview', icon: '📊', description: 'Market cap, dominance & global metrics' },
  { id: 'market', label: 'Market Heatmap', icon: '🗺️', description: 'Visual market performance' },
  { id: 'trending', label: 'Trending', icon: '🔥', description: 'Hot coins & searches' },
  { id: 'movers', label: 'Top Movers', icon: '📈', description: 'Biggest gainers & losers' },
  { id: 'sectors', label: 'Sectors', icon: '🏷️', description: 'Category performance' },
  { id: 'defi', label: 'DeFi', icon: '🏦', description: 'Decentralized finance stats' },
  { id: 'dex', label: 'DEX Pools', icon: '🔄', description: 'Hot trading pairs' },
  { id: 'listings', label: 'New Listings', icon: '🆕', description: 'Newly listed coins' },
];

export default function CryptoCommandCenter() {
  const { tier, isAdmin } = useUserTier();
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [marketData, setMarketData] = useState<any>(null);

  // Fetch overview data for AI context
  const fetchOverview = useCallback(async () => {
    try {
      const [marketRes, trendingRes] = await Promise.all([
        fetch('/api/crypto/market-overview').then(r => r.json()).catch(() => null),
        fetch('/api/crypto/trending').then(r => r.json()).catch(() => null),
      ]);
      setMarketData({ market: marketRes?.data, trending: trendingRes });
      setLastUpdate(new Date());
    } catch (e) {
      console.error('Overview fetch failed:', e);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 300000); // 5 min
    return () => clearInterval(interval);
  }, [fetchOverview]);

  // AI Page Context
  const { setPageData } = useAIPageContext();
  useEffect(() => {
    if (marketData) {
      setPageData({
        skill: 'derivatives', // Use derivatives skill for crypto context
        symbols: marketData.trending?.coins?.slice(0, 5).map((c: any) => c.symbol) || ['BTC', 'ETH', 'SOL'],
        data: {
          marketCap: marketData.market?.totalMarketCapFormatted,
          change24h: marketData.market?.marketCapChange24h,
          trending: marketData.trending?.coins?.slice(0, 5),
          dominance: marketData.market?.dominance,
        },
        summary: `Crypto Market: ${marketData.market?.totalMarketCapFormatted || 'N/A'} (${marketData.market?.marketCapChange24h?.toFixed(2) || '0'}% 24h)`,
      });
    }
  }, [marketData, setPageData]);

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:col-span-2">
              <MarketOverviewWidget />
            </div>
            <DefiStatsWidget />
            <NewListingsWidget />
          </div>
        );
      case 'market':
        return (
          <div>
            <CryptoHeatmap />
          </div>
        );
      case 'trending':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:col-span-2">
              <TrendingCoinsWidget />
            </div>
          </div>
        );
      case 'movers':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:col-span-2">
              <TopMoversWidget />
            </div>
          </div>
        );
      case 'sectors':
        return (
          <div>
            <CategoryHeatmapWidget />
          </div>
        );
      case 'defi':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:col-span-2">
              <DefiStatsWidget />
            </div>
          </div>
        );
      case 'dex':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:col-span-2">
              <TrendingPoolsWidget />
            </div>
          </div>
        );
      case 'listings':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:col-span-2">
              <NewListingsWidget />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen" style={{ background: '#0f172a' }}>
      {/* Header */}
      <div 
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          borderBottom: '1px solid #334155',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div className="max-w-[1600px] mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors lg:hidden"
                style={{ color: '#94a3b8' }}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h1 style={{ 
                  color: '#f1f5f9', 
                  fontSize: '24px', 
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  ₿ Crypto Command Center
                </h1>
                <p style={{ color: '#64748b', fontSize: '13px' }}>
                  Real-time market intelligence powered by CoinGecko
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {marketData?.market && (
                <div className="hidden md:flex items-center gap-3">
                  <span style={{ 
                    color: '#f1f5f9', 
                    fontSize: '14px',
                    fontWeight: 600
                  }}>
                    {marketData.market.totalMarketCapFormatted}
                  </span>
                  <span style={{ 
                    color: marketData.market.marketCapChange24h >= 0 ? '#10b981' : '#ef4444',
                    fontSize: '12px',
                    fontWeight: 600
                  }}>
                    {marketData.market.marketCapChange24h >= 0 ? '↗' : '↘'} 
                    {Math.abs(marketData.market.marketCapChange24h).toFixed(2)}%
                  </span>
                </div>
              )}
              <span style={{
                fontSize: '11px',
                color: '#10b981',
                background: 'rgba(16, 185, 129, 0.15)',
                padding: '6px 12px',
                borderRadius: '20px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ 
                  width: '6px', 
                  height: '6px', 
                  borderRadius: '50%', 
                  background: '#10b981',
                  animation: 'pulse 2s infinite'
                }}></span>
                LIVE
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto flex">
        {/* Sidebar */}
        <aside 
          style={{
            width: sidebarOpen ? '240px' : '0px',
            minWidth: sidebarOpen ? '240px' : '0px',
            background: '#1e293b',
            borderRight: '1px solid #334155',
            transition: 'all 0.3s ease',
            overflow: 'hidden',
            height: 'calc(100vh - 81px)',
            position: 'sticky',
            top: '81px',
          }}
          className="hidden lg:block"
        >
          <nav style={{ padding: '16px 12px' }}>
            <div style={{ 
              color: '#64748b', 
              fontSize: '10px', 
              fontWeight: 600, 
              letterSpacing: '0.1em',
              marginBottom: '12px',
              padding: '0 8px'
            }}>
              NAVIGATION
            </div>
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '4px',
                  background: activeSection === item.id 
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.05))'
                    : 'transparent',
                  border: activeSection === item.id 
                    ? '1px solid rgba(16, 185, 129, 0.3)'
                    : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                className="hover:bg-slate-700/30"
              >
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px' 
                }}>
                  <span style={{ fontSize: '18px' }}>{item.icon}</span>
                  <div>
                    <div style={{ 
                      color: activeSection === item.id ? '#10b981' : '#f1f5f9',
                      fontSize: '13px',
                      fontWeight: 600
                    }}>
                      {item.label}
                    </div>
                    <div style={{ 
                      color: '#64748b', 
                      fontSize: '10px',
                      marginTop: '2px'
                    }}>
                      {item.description}
                    </div>
                  </div>
                </div>
              </button>
            ))}

            {/* Quick Links */}
            <div style={{ 
              marginTop: '24px',
              padding: '16px 8px',
              borderTop: '1px solid #334155'
            }}>
              <div style={{ 
                color: '#64748b', 
                fontSize: '10px', 
                fontWeight: 600, 
                letterSpacing: '0.1em',
                marginBottom: '12px'
              }}>
                QUICK LINKS
              </div>
              <a
                href="/tools/crypto-dashboard"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  fontSize: '12px',
                  textDecoration: 'none',
                }}
                className="hover:bg-slate-700/30"
              >
                📊 Derivatives Dashboard
              </a>
              <a
                href="/tools/crypto-heatmap"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  fontSize: '12px',
                  textDecoration: 'none',
                }}
                className="hover:bg-slate-700/30"
              >
                🗺️ Full Heatmap
              </a>
              <a
                href="/tools/crypto-explorer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  fontSize: '12px',
                  textDecoration: 'none',
                }}
                className="hover:bg-slate-700/30"
              >
                🔍 Coin Explorer
              </a>
            </div>

            {/* Data Source Badge */}
            <div style={{
              marginTop: '24px',
              padding: '12px',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '4px' }}>
                Data by
              </div>
              <div style={{ 
                color: '#8dc647', 
                fontSize: '12px', 
                fontWeight: 600 
              }}>
                🦎 CoinGecko Analyst
              </div>
            </div>
          </nav>
        </aside>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Mobile Sidebar */}
        <aside 
          className={`fixed left-0 top-[81px] h-[calc(100vh-81px)] z-50 lg:hidden transition-transform duration-300 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{
            width: '280px',
            background: '#1e293b',
            borderRight: '1px solid #334155',
          }}
        >
          <nav style={{ padding: '16px' }}>
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveSection(item.id);
                  setSidebarOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '14px',
                  borderRadius: '8px',
                  marginBottom: '4px',
                  background: activeSection === item.id 
                    ? 'rgba(16, 185, 129, 0.15)'
                    : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px' }}>{item.icon}</span>
                  <div>
                    <div style={{ 
                      color: activeSection === item.id ? '#10b981' : '#f1f5f9',
                      fontSize: '14px',
                      fontWeight: 600
                    }}>
                      {item.label}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '11px' }}>
                      {item.description}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main style={{ flex: 1, padding: '24px' }}>
          {/* Section Header */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '28px' }}>
                {sidebarItems.find(i => i.id === activeSection)?.icon}
              </span>
              <div>
                <h2 style={{ 
                  color: '#f1f5f9', 
                  fontSize: '20px', 
                  fontWeight: 700,
                  margin: 0
                }}>
                  {sidebarItems.find(i => i.id === activeSection)?.label}
                </h2>
                <p style={{ 
                  color: '#64748b', 
                  fontSize: '13px',
                  margin: 0
                }}>
                  {sidebarItems.find(i => i.id === activeSection)?.description}
                </p>
              </div>
            </div>
            {lastUpdate && (
              <p style={{ 
                color: '#475569', 
                fontSize: '11px', 
                marginTop: '8px' 
              }}>
                Last updated: {lastUpdate.toLocaleTimeString()}
              </p>
            )}
          </div>

          {/* Dynamic Content */}
          <Suspense fallback={<WidgetSkeleton height="400px" />}>
            {renderContent()}
          </Suspense>

          {/* Mobile Tab Bar (visible only on mobile when sidebar closed) */}
          <div 
            className="fixed bottom-0 left-0 right-0 lg:hidden"
            style={{
              background: '#1e293b',
              borderTop: '1px solid #334155',
              padding: '8px',
              display: sidebarOpen ? 'none' : 'flex',
              justifyContent: 'space-around',
            }}
          >
            {sidebarItems.slice(0, 5).map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: activeSection === item.id 
                    ? 'rgba(16, 185, 129, 0.15)' 
                    : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span style={{ fontSize: '18px' }}>{item.icon}</span>
                <span style={{ 
                  fontSize: '9px', 
                  color: activeSection === item.id ? '#10b981' : '#64748b' 
                }}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </main>
      </div>

      {/* Keyframe animation for pulse */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
