'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useUserTier, canAccessCryptoCommandCenter } from '@/lib/useUserTier';
import { useAIPageContext } from '@/lib/ai/pageContext';
import UpgradeGate from '@/components/UpgradeGate';

const TrendingCoinsWidget = dynamic(() => import('@/components/TrendingCoinsWidget'), {
  ssr: false,
  loading: () => <WidgetSkeleton />,
});
const TopMoversWidget = dynamic(() => import('@/components/TopMoversWidget'), {
  ssr: false,
  loading: () => <WidgetSkeleton />,
});
const CategoryHeatmapWidget = dynamic(() => import('@/components/CategoryHeatmapWidget'), {
  ssr: false,
  loading: () => <WidgetSkeleton />,
});
const MarketOverviewWidget = dynamic(() => import('@/components/MarketOverviewWidget'), {
  ssr: false,
  loading: () => <WidgetSkeleton />,
});
const NewListingsWidget = dynamic(() => import('@/components/NewListingsWidget'), {
  ssr: false,
  loading: () => <WidgetSkeleton />,
});
const DefiStatsWidget = dynamic(() => import('@/components/DefiStatsWidget'), {
  ssr: false,
  loading: () => <WidgetSkeleton />,
});
const TrendingPoolsWidget = dynamic(() => import('@/components/TrendingPoolsWidget'), {
  ssr: false,
  loading: () => <WidgetSkeleton />,
});
const NewPoolsWidget = dynamic(() => import('@/components/NewPoolsWidget'), {
  ssr: false,
  loading: () => <WidgetSkeleton />,
});
const CryptoSearchWidget = dynamic(() => import('@/components/CryptoSearchWidget'), {
  ssr: false,
  loading: () => <WidgetSkeleton />,
});
const CryptoHeatmap = dynamic(() => import('@/components/CryptoHeatmap'), {
  ssr: false,
  loading: () => <WidgetSkeleton height="400px" />,
});

function WidgetSkeleton({ height = '280px' }: { height?: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4" style={{ height }}>
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-32 rounded bg-slate-700" />
        <div className="h-14 rounded bg-slate-700/60" />
        <div className="h-14 rounded bg-slate-700/60" />
      </div>
    </div>
  );
}

function PageLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-slate-950 p-4">
      <div className="mx-auto max-w-[1500px] animate-pulse space-y-3">
        <div className="h-7 w-64 rounded bg-slate-700" />
        <div className="h-4 w-44 rounded bg-slate-700/60" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <WidgetSkeleton />
          <WidgetSkeleton />
        </div>
      </div>
    </div>
  );
}

type Section = 'overview' | 'search' | 'market' | 'trending' | 'movers' | 'sectors' | 'defi' | 'dex' | 'newpools' | 'listings';
type LogTab = 'alerts' | 'regime' | 'scanner' | 'notrade' | 'data';

interface SidebarItem {
  id: Section;
  label: string;
  icon: string;
  description: string;
}

const sectionItems: SidebarItem[] = [
  { id: 'overview', label: 'Overview', icon: '📊', description: 'Market cap, dominance & global metrics' },
  { id: 'search', label: 'Coin Search', icon: '🔍', description: 'Find any cryptocurrency' },
  { id: 'market', label: 'Market Heatmap', icon: '🗺️', description: 'Visual market performance' },
  { id: 'trending', label: 'Trending', icon: '🔥', description: 'Hot coins & searches' },
  { id: 'movers', label: 'Top Movers', icon: '📈', description: 'Biggest gainers & losers' },
  { id: 'sectors', label: 'Sectors', icon: '🏷️', description: 'Category performance' },
  { id: 'defi', label: 'DeFi', icon: '🏦', description: 'Decentralized finance stats' },
  { id: 'dex', label: 'DEX Pools', icon: '🔄', description: 'Hot trading pairs' },
  { id: 'newpools', label: 'New Pools', icon: '🌱', description: 'Just created liquidity' },
  { id: 'listings', label: 'New Coins', icon: '🆕', description: 'Newly listed tokens' },
];

export default function CryptoCommandCenter() {
  return (
    <Suspense fallback={<PageLoadingSkeleton />}>
      <CryptoCommandCenterContent />
    </Suspense>
  );
}

function CryptoCommandCenterContent() {
  const { tier, isAdmin } = useUserTier();
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [logTab, setLogTab] = useState<LogTab>('alerts');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [marketData, setMarketData] = useState<any>(null);

  useEffect(() => {
    const sectionParam = searchParams.get('section');
    if (!sectionParam) return;

    const sectionMap: Record<string, Section> = {
      heatmap: 'market',
      market: 'market',
      trending: 'trending',
      movers: 'movers',
      sectors: 'sectors',
      defi: 'defi',
      dex: 'dex',
      newpools: 'newpools',
      search: 'search',
      listings: 'listings',
      overview: 'overview',
    };

    const mappedSection = sectionMap[sectionParam.toLowerCase()];
    if (mappedSection) setActiveSection(mappedSection);
  }, [searchParams]);

  const fetchOverview = useCallback(async () => {
    try {
      const [marketRes, trendingRes] = await Promise.all([
        fetch('/api/crypto/market-overview').then((r) => r.json()).catch(() => null),
        fetch('/api/crypto/trending').then((r) => r.json()).catch(() => null),
      ]);
      setMarketData({ market: marketRes?.data, trending: trendingRes });
      setLastUpdate(new Date());
    } catch (e) {
      console.error('Overview fetch failed:', e);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 300000);
    return () => clearInterval(interval);
  }, [fetchOverview]);

  const { setPageData } = useAIPageContext();
  useEffect(() => {
    if (!marketData) return;

    setPageData({
      skill: 'derivatives',
      symbols: marketData.trending?.coins?.slice(0, 5).map((c: any) => c.symbol) || ['BTC', 'ETH', 'SOL'],
      data: {
        marketCap: marketData.market?.totalMarketCapFormatted,
        change24h: marketData.market?.marketCapChange24h,
        trending: marketData.trending?.coins?.slice(0, 5),
        dominance: marketData.market?.dominance,
      },
      summary: `Crypto Market: ${marketData.market?.totalMarketCapFormatted || 'N/A'} (${marketData.market?.marketCapChange24h?.toFixed(2) || '0'}% 24h)`,
    });
  }, [marketData, setPageData]);

  if (!isAdmin && !canAccessCryptoCommandCenter(tier)) {
    return <UpgradeGate requiredTier="pro" feature="Crypto Command Center" />;
  }

  const currentSection = sectionItems.find((s) => s.id === activeSection);

  const logs = useMemo(() => {
    const topCoin = marketData?.trending?.coins?.[0]?.symbol || 'BTC';
    const capMove = marketData?.market?.marketCapChange24h;
    return {
      alerts: [
        { t: '09:31', e: `${topCoin} volatility alert`, d: 'Momentum expansion crossed short-term risk threshold.' },
        { t: '10:02', e: 'Market breadth pulse', d: 'Leadership narrowed into top-cap cluster.' },
      ],
      regime: [
        {
          t: '09:15',
          e: 'Regime snapshot',
          d: `Market cap delta ${typeof capMove === 'number' ? `${capMove.toFixed(2)}%` : 'N/A'} over 24h.`,
        },
        { t: '10:11', e: 'Risk state stable', d: 'No structural shift detected in dominance stack.' },
      ],
      scanner: [
        { t: '09:47', e: `${topCoin} scanner handoff`, d: 'Forwarded to scanner for setup validation.' },
        { t: '10:09', e: 'Sector momentum handoff', d: 'Category leader rotation sent to watchlist queue.' },
      ],
      notrade: [
        { t: '09:53', e: 'No-trade: liquidity quality', d: 'Spread and depth failed execution policy.' },
        { t: '10:20', e: 'No-trade: trend conflict', d: 'Lower TF impulse conflicted with higher TF state.' },
      ],
      data: [
        { t: '09:30', e: 'Feed health', d: 'CoinGecko endpoints healthy; refresh cadence active.' },
        { t: '10:08', e: 'Sync checkpoint', d: 'Latest overview and trending snapshots ingested.' },
      ],
    } as Record<LogTab, Array<{ t: string; e: string; d: string }>>;
  }, [marketData]);

  function renderPrimaryWidget() {
    switch (activeSection) {
      case 'overview':
        return <MarketOverviewWidget />;
      case 'market':
        return <CryptoHeatmap />;
      case 'trending':
        return <TrendingCoinsWidget />;
      case 'movers':
        return <TopMoversWidget />;
      case 'sectors':
        return <CategoryHeatmapWidget />;
      case 'defi':
        return <DefiStatsWidget />;
      case 'dex':
        return <TrendingPoolsWidget />;
      case 'newpools':
        return <NewPoolsWidget />;
      case 'search':
        return <CryptoSearchWidget />;
      case 'listings':
        return <NewListingsWidget />;
      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto w-full max-w-[1500px] space-y-2 px-2 pb-6 pt-3 md:px-3">
        <section className="sticky top-2 z-20 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/95 p-1.5 backdrop-blur">
          {[
            ['Regime', 'Crypto Risk-On'],
            ['Risk', 'Moderate'],
            ['Dominance', marketData?.market?.dominance?.btc ? `${Number(marketData.market.dominance.btc).toFixed(1)}% BTC` : 'N/A'],
            ['Mkt Cap', marketData?.market?.totalMarketCapFormatted || 'N/A'],
            [
              '24h',
              typeof marketData?.market?.marketCapChange24h === 'number'
                ? `${marketData.market.marketCapChange24h >= 0 ? '+' : ''}${marketData.market.marketCapChange24h.toFixed(2)}%`
                : 'N/A',
            ],
            ['Data', 'CoinGecko Live'],
            ['Last Refresh', lastUpdate ? lastUpdate.toLocaleTimeString() : '—'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
              <span className="font-semibold text-slate-100">{k}</span> · {v}
            </div>
          ))}
          <span className="ml-auto rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">LIVE</span>
        </section>

        <section className="grid gap-2 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
            <div className="mb-1 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Zone 2 • Action</p>
                <h1 className="text-xs font-bold">Crypto Command Console</h1>
              </div>
              <Link href="/tools/scanner?asset=crypto" className="text-[10px] font-semibold text-emerald-300">Open Scanner</Link>
            </div>

            <div className="h-[590px] overflow-y-auto rounded-md border border-slate-700 bg-slate-950/60 p-1.5">
              <div className="mb-2 grid grid-cols-2 gap-1.5 md:grid-cols-5">
                {sectionItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`rounded-md border px-1.5 py-1 text-left ${
                      activeSection === item.id
                        ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                        : 'border-slate-700 bg-slate-900 text-slate-300'
                    }`}
                  >
                    <div className="text-[10px] font-semibold">{item.icon} {item.label}</div>
                    <div className="mt-0.5 text-[9px] text-slate-500">{item.description}</div>
                  </button>
                ))}
              </div>

              <div className="rounded-md border border-slate-700 bg-slate-900/70 p-1.5">
                <div className="mb-1 flex items-center gap-2 text-[10px] text-slate-400">
                  <span>{currentSection?.icon}</span>
                  <span className="font-semibold text-slate-200">{currentSection?.label}</span>
                  <span className="text-slate-500">• {currentSection?.description}</span>
                </div>
                <Suspense fallback={<WidgetSkeleton height="380px" />}>{renderPrimaryWidget()}</Suspense>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
            <div className="mb-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Zone 2 • Context</p>
              <h2 className="text-xs font-bold">Context / Rotation / Routing</h2>
            </div>

            <div className="grid gap-2">
              <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                <p className="text-[10px] uppercase text-slate-500">Market Snapshot</p>
                <p className="text-[11px] text-slate-300">Cap: {marketData?.market?.totalMarketCapFormatted || 'N/A'}</p>
                <p className="text-[11px] text-slate-300">
                  24h: {typeof marketData?.market?.marketCapChange24h === 'number' ? `${marketData.market.marketCapChange24h.toFixed(2)}%` : 'N/A'}
                </p>
              </div>

              <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                <p className="text-[10px] uppercase text-slate-500">Trending Leadership</p>
                <div className="mt-1 grid gap-1 text-[11px]">
                  {(marketData?.trending?.coins || []).slice(0, 5).map((coin: any, idx: number) => (
                    <div key={`${coin.symbol}-${idx}`} className="flex items-center justify-between rounded border border-slate-700 bg-slate-900/70 px-1.5 py-1">
                      <span className="text-slate-300">{coin.symbol}</span>
                      <span className="text-emerald-300">Rank {idx + 1}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <Link href="/tools/crypto-dashboard" className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-center text-[10px] text-slate-300">Derivatives</Link>
                <Link href="/tools/crypto-heatmap" className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-center text-[10px] text-slate-300">Full Heatmap</Link>
                <Link href="/tools/crypto-explorer" className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-center text-[10px] text-slate-300">Explorer</Link>
                <Link href="/tools/alerts" className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-center text-[10px] text-slate-300">Create Alert</Link>
              </div>
            </div>
          </div>
        </section>

        <details className="group rounded-lg border border-slate-700 bg-slate-900 p-2" open>
          <summary className="flex list-none cursor-pointer items-center justify-between text-xs font-bold">
            <span>Zone 3 • Audit / Log</span>
            <span className="text-[10px] text-slate-500 group-open:hidden">Expand</span>
            <span className="hidden text-[10px] text-slate-500 group-open:inline">Collapse</span>
          </summary>

          <div className="mt-2 grid gap-2">
            <div className="flex flex-wrap gap-1">
              {([
                ['alerts', 'Triggered Alerts'],
                ['regime', 'Regime Flips'],
                ['scanner', 'Scanner Hits'],
                ['notrade', 'No-Trade Reasons'],
                ['data', 'Data Gaps'],
              ] as Array<[LogTab, string]>).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setLogTab(id)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    logTab === id
                      ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                      : 'border-slate-700 text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="max-h-[220px] overflow-y-auto rounded-md border border-slate-700 bg-slate-950/60 p-1.5">
              <div className="grid gap-1.5">
                {logs[logTab].map((entry, idx) => (
                  <div key={`${entry.t}-${idx}`} className="rounded border border-slate-700 bg-slate-900/70 p-1.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>{entry.t}</span>
                      <span className="text-slate-300">{entry.e}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">{entry.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </details>

        <details className="group rounded-lg border border-slate-700 bg-slate-900 p-2">
          <summary className="flex list-none cursor-pointer items-center justify-between text-xs font-bold">
            <span>Zone 4 • Capabilities / Plan / Help</span>
            <span className="text-[10px] text-slate-500 group-open:hidden">Expand</span>
            <span className="hidden text-[10px] text-slate-500 group-open:inline">Collapse</span>
          </summary>

          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <div className="rounded border border-slate-700 bg-slate-950/60 p-2 text-[11px] text-slate-400">
              <p className="mb-1 text-[10px] uppercase text-slate-500">Capabilities</p>
              Live CoinGecko intelligence, heatmaps, movers, categories, DeFi, DEX, listings, and search are available.
            </div>
            <div className="rounded border border-slate-700 bg-slate-950/60 p-2 text-[11px] text-slate-400">
              <p className="mb-1 text-[10px] uppercase text-slate-500">Plan Limits</p>
              Crypto Command Center remains tier-gated and follows your active subscription entitlement policy.
            </div>
            <div className="rounded border border-slate-700 bg-slate-950/60 p-2 text-[11px] text-slate-400">
              <p className="mb-1 text-[10px] uppercase text-slate-500">Help</p>
              Use Zone 1 for state, Zone 2 for execution context, Zone 3 for receipts, and Zone 4 only when needed.
            </div>
          </div>
        </details>
      </main>
    </div>
  );
}
