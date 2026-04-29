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
import { Card, SectionHeader, Badge, UpgradeGate } from '@/app/v2/_components/ui';
import { useUserTier } from '@/lib/useUserTier';

/* ─── Dynamic imports: v1 deep-dive components ─── */
const EquityExplorer = dynamic(() => import('@/app/tools/equity-explorer/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Equity Explorer…</div> });
const CryptoExplorer = dynamic(() => import('@/app/tools/crypto-explorer/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Crypto Explorer…</div> });
const CryptoCommand = dynamic(() => import('@/app/tools/crypto/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Crypto Command…</div> });
const MacroDashboard = dynamic(() => import('@/app/tools/macro/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Macro Dashboard…</div> });
const MarketMoversV1 = dynamic(() => import('@/app/tools/market-movers/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Market Movers…</div> });
const CommoditiesV1 = dynamic(() => import('@/app/tools/commodities/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Commodities Intelligence…</div> });

function Skel({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}

const TABS = ['Overview', 'Sectors', 'Commodities', 'Cross-Market', 'Equity Search', 'Crypto Search', 'Crypto Command', 'Movers Intelligence', 'Commodities Deep', 'Macro'] as const;
type ExplorerTab = typeof TABS[number];

const EXPLORER_TAB_PARAM_MAP: Record<string, ExplorerTab> = {
  overview: 'Overview',
  sectors: 'Sectors',
  heatmap: 'Sectors',
  commodities: 'Commodities Deep',
  commodity: 'Commodities Deep',
  cross: 'Cross-Market',
  equity: 'Equity Search',
  'equity-explorer': 'Equity Search',
  crypto: 'Crypto Search',
  'crypto-explorer': 'Crypto Search',
  'crypto-command': 'Crypto Command',
  movers: 'Movers Intelligence',
  'market-movers': 'Movers Intelligence',
  macro: 'Macro',
};

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
    if (requestedTab && requestedTab !== tab) setTab(requestedTab);
  }, [searchParams, tab]);

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
  const allGainers = movers.data?.topGainers || [];
  const allLosers = movers.data?.topLosers || [];
  const eqGainers = allGainers.filter((m: Mover) => m.asset_class === 'equity').slice(0, 10);
  const eqLosers = allLosers.filter((m: Mover) => m.asset_class === 'equity').slice(0, 10);
  const cryptoGainers = allGainers.filter((m: Mover) => m.asset_class === 'crypto').slice(0, 10);
  const cryptoLosers = allLosers.filter((m: Mover) => m.asset_class === 'crypto').slice(0, 10);
  const commodList = commodities.data?.commodities || [];
  const cryptoSectors = cryptoCats.data?.highlighted || [];

  return (
    <div className="space-y-6">
      <SectionHeader title="Market Explorer" subtitle="Cross-market intelligence — live data" />

      {/* Tabs */}
      <div className="flex items-center gap-1 flex-wrap pb-1">
        {TABS.map(t => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={`px-2.5 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap transition-colors ${tab === t ? 'bg-[rgba(16,185,129,0.1)] text-[var(--msp-accent)] border border-[rgba(16,185,129,0.4)]' : 'text-[var(--msp-text-muted)] hover:bg-slate-800/60 border border-transparent'}`}>
            {t}
          </button>
        ))}
      </div>

      {(tier === 'free' || tier === 'anonymous') && (
        <div className="text-xs text-center text-slate-400 bg-slate-800/50 border border-slate-700/30 rounded-lg px-3 py-2">
          \uD83D\uDD12 <span className="text-emerald-400 font-semibold">Upgrade to Pro</span> to interact with the Market Explorer
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
                    <th className="text-left py-2 px-2 text-[11px] uppercase text-slate-500">Sector</th>
                    <th className="text-left py-2 px-2 text-[11px] uppercase text-slate-500">ETF</th>
                    <th className="text-right py-2 px-2 text-[11px] uppercase text-slate-500">Change %</th>
                    <th className="text-right py-2 px-2 text-[11px] uppercase text-slate-500">Weekly</th>
                    <th className="text-right py-2 px-2 text-[11px] uppercase text-slate-500">Monthly</th>
                    <th className="text-right py-2 px-2 text-[11px] uppercase text-slate-500">YTD</th>
                    <th className="text-right py-2 px-2 text-[11px] uppercase text-slate-500">Weight</th>
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

      {/* -- CRYPTO --------------------------------------------------- */}
      {/* -- COMMODITIES ---------------------------------------------- */}
      {tab === 'Commodities' && (
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
                    <Badge label={c.changePercent > 0 ? 'UP' : c.changePercent < 0 ? 'DOWN' : 'FLAT'} color={c.changePercent > 0 ? '#10B981' : c.changePercent < 0 ? '#EF4444' : '#94A3B8'} small />
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
        </Card>
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
                  const color = isHeadwind ? '#EF4444' : isTailwind ? '#10B981' : '#94A3B8';
                  return (
                    <div key={i} className="bg-[var(--msp-panel-2)] rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">{sig.source}</span>
                        <div className="flex items-center gap-1">
                          <Badge label={sig.regime} color={REGIME_COLORS[r as RegimePriority] || '#64748B'} small />
                          {sig.stale && <span className="text-[11px] text-yellow-500 border border-yellow-500/30 px-1 rounded">stale</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden">
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
      {tab === 'Equity Search' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Equity Deep-Dive Explorer">
          <EquityExplorer />
        </UpgradeGate>
      )}
      {tab === 'Crypto Search' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Crypto Deep-Dive Explorer">
          <CryptoExplorer />
        </UpgradeGate>
      )}
      {tab === 'Crypto Command' && (
        <CryptoCommand />
      )}
      {tab === 'Movers Intelligence' && (
        <MarketMoversV1 />
      )}
      {tab === 'Commodities Deep' && (
        <CommoditiesV1 />
      )}
      {tab === 'Macro' && (
        <MacroDashboard />
      )}

      </div>
    </div>
  );
}
