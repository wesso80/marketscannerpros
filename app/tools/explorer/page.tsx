'use client';

/* ---------------------------------------------------------------------------
   SURFACE 5: EXPLORER — Cross-Market Intelligence
   Real APIs: /api/sectors/heatmap + /api/crypto/market-overview +
              /api/market-movers + /api/commodities + /api/economic-indicators
   --------------------------------------------------------------------------- */

import { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useV2 } from '@/app/v2/_lib/V2Context';
import { useSectorsHeatmap, useCryptoOverview, useCryptoCategories, useMarketMovers, useCommodities, useRegime, type SectorData, type Mover, type CommodityData, type CryptoCategory } from '@/app/v2/_lib/api';
import { CROSS_MARKET, REGIME_COLORS } from '@/app/v2/_lib/constants';
import type { RegimePriority } from '@/app/v2/_lib/types';
import { Card, Badge, UpgradeGate } from '@/app/v2/_components/ui';
import { PageHero } from '@/components/ui';
import { useUserTier } from '@/lib/useUserTier';
import { filterMoversByFloor } from '@/lib/analysis';

/* ─── Dynamic imports: v1 deep-dive components ─── */
const EquityExplorer = dynamic(() => import('@/app/tools/equity-explorer/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Equity Explorer…</div> });
const CryptoExplorer = dynamic(() => import('@/app/tools/crypto-explorer/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Crypto Explorer…</div> });
const CryptoCommand = dynamic(() => import('@/app/tools/crypto/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Crypto Command…</div> });
const MarketMoversV1 = dynamic(() => import('@/app/tools/market-movers/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Market Movers…</div> });
const CommoditiesV1 = dynamic(() => import('@/app/tools/commodities/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Commodities Intelligence…</div> });
const CryptoNewsWidget = dynamic(() => import('@/components/CryptoNewsWidget'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Crypto News…</div> });
const PublicTreasuryWidget = dynamic(() => import('@/components/PublicTreasuryWidget'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Treasury Holdings…</div> });

function Skel({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}

const TABS = ['Overview', 'Sectors', 'Commodities', 'Cross-Market', 'Equity Deep-Dive', 'Crypto Deep-Dive', 'Crypto Command', 'Crypto Intel', 'Movers'] as const;
type ExplorerTab = typeof TABS[number];

const EXPLORER_TAB_PARAM_MAP: Record<string, ExplorerTab> = {
  overview: 'Overview',
  sectors: 'Sectors',
  heatmap: 'Sectors',
  commodities: 'Commodities',
  commodity: 'Commodities',
  'commodities-deep': 'Commodities',
  cross: 'Cross-Market',
  equity: 'Equity Deep-Dive',
  'equity-explorer': 'Equity Deep-Dive',
  'equity-search': 'Equity Deep-Dive',
  crypto: 'Crypto Deep-Dive',
  'crypto-explorer': 'Crypto Deep-Dive',
  'crypto-search': 'Crypto Deep-Dive',
  'crypto-command': 'Crypto Command',
  'crypto-intel': 'Crypto Intel',
  intel: 'Crypto Intel',
  news: 'Crypto Intel',
  treasury: 'Crypto Intel',
  movers: 'Movers',
  'market-movers': 'Movers',
  'movers-intelligence': 'Movers',
  // Macro is owned by Dashboard -> Macro lens to avoid duplication.
};

function MarketsMetric({ label, value, tone = 'var(--msp-text)', detail }: { label: string; value: string; tone?: string; detail: string }) {
  return (
    <div className="min-h-[3.1rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
      <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-black" style={{ color: tone }}>{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-slate-500" title={detail}>{detail}</div>
    </div>
  );
}

function pctColor(v: number) {
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-red-400';
  return 'text-slate-400';
}

export default function ExplorerPage() {
  const { tier } = useUserTier();
  const { navigateTo, selectSymbol } = useV2();
  const searchParams = useSearchParams();
  const requestedInitialTab = EXPLORER_TAB_PARAM_MAP[(searchParams.get('tab') || '').toLowerCase()] || 'Overview';
  const [tab, setTab] = useState<ExplorerTab>(requestedInitialTab);

  useEffect(() => {
    const requestedTab = EXPLORER_TAB_PARAM_MAP[(searchParams.get('tab') || '').toLowerCase()];
    if (requestedTab) setTab(requestedTab);
    // Only re-sync when the URL tab param changes; including `tab` here would force
    // user clicks back to the URL value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const openGoldenEgg = (symbol: string) => {
    selectSymbol(symbol);
    navigateTo('golden-egg', symbol);
  };

  const sectors = useSectorsHeatmap();
  const cryptoOverview = useCryptoOverview();
  const cryptoCats = useCryptoCategories();
  const movers = useMarketMovers();
  const commodities = useCommodities();
  const regime = useRegime();

  const sectorData = sectors.data?.sectors || [];
  const cryptoData = cryptoOverview.data?.data;
  // Universe-quality floor (§M9): drop $0 / sub-dollar / nano-cap noise from the
  // headline surfaces (falls back to the raw list if the floor empties it).
  const allGainers = filterMoversByFloor(movers.data?.topGainers || []);
  const allLosers = filterMoversByFloor(movers.data?.topLosers || []);
  const eqGainers = allGainers.filter((m: Mover) => m.asset_class === 'equity').slice(0, 10);
  const eqLosers = allLosers.filter((m: Mover) => m.asset_class === 'equity').slice(0, 10);
  const cryptoGainers = allGainers.filter((m: Mover) => m.asset_class === 'crypto').slice(0, 10);
  const cryptoLosers = allLosers.filter((m: Mover) => m.asset_class === 'crypto').slice(0, 10);
  const commodList = commodities.data?.commodities || [];
  const cryptoSectors = cryptoCats.data?.highlighted || [];

  return (
    <div className="space-y-3">
      <PageHero
        ariaLabel="Markets command header"
        eyebrow="Cross-market map"
        badges={[
          { label: `${TABS.length} lenses` },
          { label: `Tier ${tier === 'pro_trader' ? 'Pro Trader' : tier === 'pro' ? 'Pro' : 'Free'}` },
          ...(regime.data?.regime ? [{ label: `Regime ${String(regime.data.regime).toUpperCase()}` }] : []),
        ]}
        title="Markets."
        subtitle="Scan sector heat, crypto breadth, commodity context, and mover evidence before selecting one symbol. Macro context lives in the Dashboard Macro lens."
        actions={[
          { label: 'Open Scanner', variant: 'primary', href: '/tools/scanner' },
          { label: 'Open Golden Egg', variant: 'secondary', href: '/tools/golden-egg' },
          { label: 'Open Macro Lens', variant: 'ghost', href: '/tools/dashboard?tab=macro' },
        ]}
        metrics={[
          { label: 'Sectors leading', value: sectorData.length ? `${sectorData.filter((s: SectorData) => (s.changePercent ?? 0) > 0).length}/${sectorData.length} green` : '—', tone: 'bull', detail: sectorData.length ? `Top: ${[...sectorData].sort((a: SectorData, b: SectorData) => (b.changePercent ?? 0) - (a.changePercent ?? 0))[0]?.name}` : 'Sector data loading' },
          { label: 'Crypto cap', value: cryptoData?.totalMarketCapFormatted || '—', tone: 'info', detail: cryptoData ? `BTC ${cryptoData.btcDominance.toFixed(1)}% · ETH ${cryptoData.ethDominance.toFixed(1)}%` : 'Crypto market loading' },
          { label: 'Top gainer', value: allGainers[0]?.ticker || '—', tone: 'warn', detail: allGainers[0] ? `+${allGainers[0].change_percentage} (${allGainers[0].asset_class})` : 'Movers loading' },
          { label: 'Next check', value: tab, tone: 'warn', detail: 'Pick one lens, then drop into Scanner or Golden Egg' },
        ]}
      />

      {/* Tabs */}
      <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={`shrink-0 rounded-md border px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors ${tab === t ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' : 'border-slate-800 bg-slate-950/35 text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {(tier === 'free' || tier === 'anonymous') && (
        <div className="text-xs text-center text-slate-400 bg-slate-800/50 border border-slate-700/30 rounded-lg px-3 py-2">
          <span className="text-emerald-400 font-semibold">Upgrade to Pro</span> to interact with the Market Explorer
        </div>
      )}
      <div className={(tier === 'free' || tier === 'anonymous') ? 'pointer-events-none select-none' : undefined}>

      {/* -- OVERVIEW ------------------------------------------------- */}
      {tab === 'Overview' && (
        <div className="space-y-4">
          {/* --- Equities Section --------------- */}
          <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Equities</div>

          {/* Sector Heatmap */}
          {sectorData.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-white mb-3">Sector Heatmap</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
                {sectorData.map((s: SectorData) => {
                  const pct = s.changePercent ?? s.daily ?? 0;
                  return (
                    <button
                      type="button"
                      key={s.symbol}
                      className="rounded-lg p-2.5 text-center cursor-pointer hover:ring-1 hover:ring-white/20 transition-all focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
                      style={{
                        backgroundColor: pct > 0 ? `rgba(16, 185, 129, ${Math.min(Math.abs(pct) / 3, 0.6)})` : pct < 0 ? `rgba(239, 68, 68, ${Math.min(Math.abs(pct) / 3, 0.6)})` : 'rgba(148, 163, 184, 0.1)',
                      }}
                      onClick={() => openGoldenEgg(s.symbol)}
                      aria-label={`Open ${s.symbol} in Golden Egg`}
                    >
                      <div className="text-[11px] text-white font-semibold">{s.symbol}</div>
                      <div className="text-[11px] text-slate-300 truncate">{s.name}</div>
                      <div className={`text-xs font-bold ${pctColor(pct)}`}>
                        {pct > 0 ? '+' : ''}{pct.toFixed(2)}%
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
          {sectors.loading && <Card><Skel h="h-40" /></Card>}

          {/* Equity Top Movers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <h3 className="text-sm font-semibold text-emerald-400 mb-3">Top Equity Gainers</h3>
              {movers.loading ? <div className="space-y-2">{[1,2,3,4,5].map(i => <Skel key={i} h="h-6" />)}</div> : eqGainers.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">No equity gainers data</div>
              ) : (
                <div className="space-y-1">
                  {eqGainers.map((m: Mover) => (
                    <button key={m.ticker} type="button" className="flex w-full items-center justify-between text-xs py-1 px-1 rounded hover:bg-slate-800/40 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-400/60" onClick={() => openGoldenEgg(m.ticker)} aria-label={`Open ${m.ticker} in Golden Egg`}>
                      <span className="font-semibold text-white w-16">{m.ticker}</span>
                      <span className="text-slate-300 font-mono">${parseFloat(m.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span className="text-emerald-400 font-mono w-20 text-right">+{m.change_percentage}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-red-400 mb-3">Top Equity Losers</h3>
              {movers.loading ? <div className="space-y-2">{[1,2,3,4,5].map(i => <Skel key={i} h="h-6" />)}</div> : eqLosers.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">No equity losers data</div>
              ) : (
                <div className="space-y-1">
                  {eqLosers.map((m: Mover) => (
                    <button key={m.ticker} type="button" className="flex w-full items-center justify-between text-xs py-1 px-1 rounded hover:bg-slate-800/40 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-400/60" onClick={() => openGoldenEgg(m.ticker)} aria-label={`Open ${m.ticker} in Golden Egg`}>
                      <span className="font-semibold text-white w-16">{m.ticker}</span>
                      <span className="text-slate-300 font-mono">${parseFloat(m.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span className="text-red-400 font-mono w-20 text-right">{m.change_percentage}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* --- Crypto Section --------------- */}
          <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold mt-2">Crypto</div>

          {/* Crypto Sector Performance */}
          {cryptoSectors.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-white mb-3">Sector Performance</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {cryptoSectors.map((cat: CryptoCategory) => {
                  const pct = cat.change24h ?? 0;
                  return (
                    <div
                      key={cat.id}
                      className="rounded-lg p-3"
                      style={{
                        backgroundColor: pct > 0 ? `rgba(16, 185, 129, ${Math.min(Math.abs(pct) / 8, 0.35)})` : pct < 0 ? `rgba(239, 68, 68, ${Math.min(Math.abs(pct) / 8, 0.35)})` : 'rgba(148, 163, 184, 0.1)',
                      }}
                    >
                      <div className="text-xs font-semibold text-white truncate">{cat.name}</div>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-[11px] text-slate-400">${cat.marketCap >= 1e12 ? (cat.marketCap / 1e12).toFixed(2) + 'T' : cat.marketCap >= 1e9 ? (cat.marketCap / 1e9).toFixed(0) + 'B' : (cat.marketCap / 1e6).toFixed(0) + 'M'}</span>
                        <span className={`text-xs font-bold ${pctColor(pct)}`}>{pct > 0 ? '+' : ''}{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
          {cryptoCats.loading && <Card><Skel h="h-28" /></Card>}

          {/* Crypto Market Summary */}
          {cryptoData && (
            <Card>
              <h3 className="text-sm font-semibold text-white mb-3">Crypto Market</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                  <div className="text-[11px] text-slate-500 uppercase">Total Market Cap</div>
                  <div className="text-sm font-bold text-white">{cryptoData.totalMarketCapFormatted}</div>
                  <div className={`text-[11px] ${pctColor(cryptoData.marketCapChange24h)}`}>{cryptoData.marketCapChange24h > 0 ? '+' : ''}{cryptoData.marketCapChange24h.toFixed(2)}%</div>
                </div>
                <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                  <div className="text-[11px] text-slate-500 uppercase">24h Volume</div>
                  <div className="text-sm font-bold text-white">{cryptoData.totalVolumeFormatted}</div>
                </div>
                <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                  <div className="text-[11px] text-slate-500 uppercase">BTC Dominance</div>
                  <div className="text-sm font-bold text-white">{cryptoData.btcDominance.toFixed(1)}%</div>
                </div>
                <div className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                  <div className="text-[11px] text-slate-500 uppercase">ETH Dominance</div>
                  <div className="text-sm font-bold text-white">{cryptoData.ethDominance.toFixed(1)}%</div>
                </div>
              </div>
            </Card>
          )}
          {cryptoOverview.loading && <Card><div className="space-y-3"><Skel h="h-6" /><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skel key={i} h="h-16" />)}</div></div></Card>}

          {/* Crypto Top Movers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <h3 className="text-sm font-semibold text-emerald-400 mb-3">Top Crypto Gainers</h3>
              {movers.loading ? <div className="space-y-2">{[1,2,3,4,5].map(i => <Skel key={i} h="h-6" />)}</div> : cryptoGainers.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">No crypto gainers data</div>
              ) : (
                <div className="space-y-1">
                  {cryptoGainers.map((m: Mover) => (
                    <button key={m.ticker} type="button" className="flex w-full items-center justify-between text-xs py-1 px-1 rounded hover:bg-slate-800/40 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-400/60" onClick={() => openGoldenEgg(m.ticker)} aria-label={`Open ${m.ticker} in Golden Egg`}>
                      <span className="font-semibold text-white w-16">{m.ticker}</span>
                      <span className="text-slate-300 font-mono">${parseFloat(m.price).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                      <span className="text-emerald-400 font-mono w-20 text-right">+{m.change_percentage}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-red-400 mb-3">Top Crypto Losers</h3>
              {movers.loading ? <div className="space-y-2">{[1,2,3,4,5].map(i => <Skel key={i} h="h-6" />)}</div> : cryptoLosers.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">No crypto losers data</div>
              ) : (
                <div className="space-y-1">
                  {cryptoLosers.map((m: Mover) => (
                    <button key={m.ticker} type="button" className="flex w-full items-center justify-between text-xs py-1 px-1 rounded hover:bg-slate-800/40 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-400/60" onClick={() => openGoldenEgg(m.ticker)} aria-label={`Open ${m.ticker} in Golden Egg`}>
                      <span className="font-semibold text-white w-16">{m.ticker}</span>
                      <span className="text-slate-300 font-mono">${parseFloat(m.price).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                      <span className="text-red-400 font-mono w-20 text-right">{m.change_percentage}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* -- SECTORS -------------------------------------------------- */}
      {tab === 'Sectors' && (
        <Card>
          {sectors.loading ? <div className="space-y-3">{[1,2,3,4].map(i => <Skel key={i} h="h-8" />)}</div> : sectorData.length === 0 ? (
            <div className="text-xs text-slate-500 py-8 text-center">No sector data available</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--msp-border)]">
                    <th scope="col" className="text-left py-2 px-2 text-[11px] uppercase text-slate-500">Sector</th>
                    <th scope="col" className="text-left py-2 px-2 text-[11px] uppercase text-slate-500">ETF</th>
                    <th scope="col" className="text-right py-2 px-2 text-[11px] uppercase text-slate-500">Change %</th>
                    <th scope="col" className="text-right py-2 px-2 text-[11px] uppercase text-slate-500">Weekly</th>
                    <th scope="col" className="text-right py-2 px-2 text-[11px] uppercase text-slate-500">Monthly</th>
                    <th scope="col" className="text-right py-2 px-2 text-[11px] uppercase text-slate-500">YTD</th>
                    <th scope="col" className="text-right py-2 px-2 text-[11px] uppercase text-slate-500">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {sectorData.map((s: SectorData) => (
                    <tr key={s.symbol} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                      <td className="py-2.5 px-2 text-white">{s.name}</td>
                      <td className="py-2.5 px-2 text-emerald-400">{s.symbol}</td>
                      <td className={`py-2.5 px-2 text-right font-mono ${pctColor(s.changePercent)}`}>{s.changePercent > 0 ? '+' : ''}{s.changePercent.toFixed(2)}%</td>
                      <td className={`py-2.5 px-2 text-right font-mono ${pctColor(s.weekly || 0)}`}>{s.weekly != null ? `${s.weekly > 0 ? '+' : ''}${s.weekly.toFixed(2)}%` : '—'}</td>
                      <td className={`py-2.5 px-2 text-right font-mono ${pctColor(s.monthly || 0)}`}>{s.monthly != null ? `${s.monthly > 0 ? '+' : ''}${s.monthly.toFixed(2)}%` : '—'}</td>
                      <td className={`py-2.5 px-2 text-right font-mono text-slate-400`}>{(s as any).ytd != null ? `${(s as any).ytd > 0 ? '+' : ''}${(s as any).ytd.toFixed(2)}%` : '—'}</td>
                      <td className="py-2.5 px-2 text-right text-slate-400">{s.weight.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* -- COMMODITIES (merged: simple grid for free, deep view for Pro) ------ */}
      {tab === 'Commodities' && (
        tier === 'pro' || tier === 'pro_trader' ? (
          <CommoditiesV1 embedded />
        ) : (
          <Card>
            {commodities.loading ? <div className="space-y-3">{[1,2,3].map(i => <Skel key={i} h="h-12" />)}</div> : commodList.length === 0 ? (
              <div className="text-xs text-slate-500 py-8 text-center">No commodity data available</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {commodList.map((c: CommodityData) => (
                  <div key={c.symbol} className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <div className="text-sm font-bold text-white">{c.name}</div>
                        <div className="text-[11px] text-slate-500">{c.category} — {c.unit}</div>
                      </div>
                      <Badge label={c.changePercent > 0 ? 'UP' : c.changePercent < 0 ? 'DOWN' : 'FLAT'} color={c.changePercent > 0 ? 'var(--msp-bull)' : c.changePercent < 0 ? 'var(--msp-bear)' : 'var(--msp-flat)'} small />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-white">${c.price.toFixed(2)}</span>
                      <span className={`text-xs ${pctColor(c.changePercent)}`}>{c.changePercent > 0 ? '+' : ''}{c.changePercent.toFixed(2)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {commodities.error && <div className="text-[11px] text-red-400/60 mt-2">Error: {commodities.error}</div>}
            <div className="mt-3 rounded-md border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
              <strong>Pro unlocks the deep commodities view</strong> with rotation leaders, breadth scoring, and scenario implications.
            </div>
          </Card>
        )
      )}

      {/* -- CROSS-MARKET (Phase 5 — Dynamic + Static) -------------- */}
      {tab === 'Cross-Market' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Cross-Market Influence Map</h3>

          {/* Dynamic regime signals */}
          {regime.data?.signals && regime.data.signals.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] text-slate-500 uppercase mb-2">Live Market Regime Signals</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {regime.data.signals.map((sig: any, i: number) => {
                  const r = sig.regime?.toLowerCase() || '';
                  const isHeadwind = r === 'risk_off' || r === 'compression';
                  const isTailwind = r === 'trend' || r === 'expansion' || r === 'risk_on';
                  const color = isHeadwind ? 'var(--msp-bear)' : isTailwind ? 'var(--msp-bull)' : 'var(--msp-flat)';
                  return (
                    <div key={i} className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">{sig.source}</span>
                        <div className="flex items-center gap-1">
                          <Badge label={sig.regime} color={REGIME_COLORS[r as RegimePriority] || 'var(--msp-text-muted)'} small />
                          {sig.stale && <span role="status" className="text-[11px] text-yellow-500 border border-yellow-500/30 px-1 rounded">stale</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div
                          role="progressbar"
                          aria-valuenow={Math.round(Math.min(sig.weight * 100, 100))}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${sig.source} signal weight`}
                          className="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden"
                        >
                          <div className="h-full rounded-full" style={{ width: `${Math.min(sig.weight * 100, 100)}%`, backgroundColor: color }} />
                        </div>
                        <span className="text-[11px] font-semibold" style={{ color }}>{isHeadwind ? 'Headwind' : isTailwind ? 'Tailwind' : 'Neutral'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Static known relationships */}
          <div className="text-[11px] text-slate-500 uppercase mb-2">Known Relationships</div>
          <div className="space-y-3">
            {CROSS_MARKET.map(cm => (
              <div key={cm.from} className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-white">{cm.from}</span>
                    <span className="text-xs text-slate-400 ml-2">{cm.condition}</span>
                  </div>
                  <Badge label={cm.effect.length > 30 ? cm.effect.slice(0, 30) + '...' : cm.effect} color="#6366F1" small />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-600">Static heuristics — not live readings. Educational context only.</p>
        </Card>
      )}

      {/* Errors */}
      {(sectors.error || cryptoOverview.error || movers.error || commodities.error) && (
        <div className="text-[11px] text-red-400/60 border border-red-900/30 rounded-lg p-3 space-y-1">
          {sectors.error && <div>Sectors: {sectors.error}</div>}
          {cryptoOverview.error && <div>Crypto: {cryptoOverview.error}</div>}
          {movers.error && <div>Movers: {movers.error}</div>}
          {commodities.error && <div>Commodities: {commodities.error}</div>}
        </div>
      )}

      {/* ─── Deep-dive Tabs (v1 components) ─── */}
      {tab === 'Equity Deep-Dive' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Equity Deep-Dive Explorer">
          <EquityExplorer />
        </UpgradeGate>
      )}
      {tab === 'Crypto Deep-Dive' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Crypto Deep-Dive Explorer">
          <CryptoExplorer />
        </UpgradeGate>
      )}
      {tab === 'Crypto Command' && (
        <CryptoCommand />
      )}
      {tab === 'Crypto Intel' && (
        <div className="space-y-2">
          <header className="rounded-lg border border-slate-700 bg-slate-900 p-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-800 text-base" aria-hidden="true">📰</div>
              <div>
                <h1 className="text-lg font-bold text-teal-300">Crypto Intel</h1>
                <p className="text-xs text-slate-400">Live news, guides, and institutional treasury holdings for crypto markets.</p>
              </div>
            </div>
          </header>

          <section className="rounded-lg border border-slate-700 bg-slate-900 p-2">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Zone 2 • News &amp; Guides</p>
            <CryptoNewsWidget title="Crypto News &amp; Guides" />
          </section>

          <details className="group rounded-lg border border-slate-700 bg-slate-900 p-2" open>
            <summary className="flex list-none cursor-pointer items-center justify-between text-xs font-bold">
              <span>Zone 3 • Institutional Treasury Holdings</span>
              <span className="text-[11px] text-slate-500 group-open:hidden">Expand</span>
              <span className="hidden text-[11px] text-slate-500 group-open:inline">Collapse</span>
            </summary>
            <div className="mt-2">
              <PublicTreasuryWidget />
            </div>
          </details>
        </div>
      )}
      {tab === 'Movers' && (
        <MarketMoversV1 />
      )}

      </div>
    </div>
  );
}
