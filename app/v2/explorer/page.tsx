'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 5: EXPLORER — Cross-Market Intelligence
   Real APIs: /api/sectors/heatmap + /api/crypto/market-overview +
              /api/market-movers + /api/commodities + /api/economic-indicators
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from 'react';
import { useV2 } from '../_lib/V2Context';
import { useSectorsHeatmap, useCryptoOverview, useMarketMovers, useCommodities, type SectorData, type Mover, type CommodityData } from '../_lib/api';
import { CROSS_MARKET } from '../_lib/constants';
import { Card, SectionHeader, Badge } from '../_components/ui';

function Skel({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}

const TABS = ['Overview', 'Sectors', 'Crypto', 'Commodities', 'Cross-Market'] as const;

function pctColor(v: number) {
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-red-400';
  return 'text-slate-400';
}

export default function ExplorerPage() {
  const { navigateTo, selectSymbol } = useV2();
  const [tab, setTab] = useState<typeof TABS[number]>('Overview');

  const sectors = useSectorsHeatmap();
  const cryptoOverview = useCryptoOverview();
  const movers = useMarketMovers();
  const commodities = useCommodities();

  const sectorData = sectors.data?.sectors || [];
  const cryptoData = cryptoOverview.data?.data;
  const topGainers = (movers.data?.topGainers || []).slice(0, 10);
  const topLosers = (movers.data?.topLosers || []).slice(0, 10);
  const commodList = commodities.data?.commodities || [];

  return (
    <div className="space-y-4">
      <SectionHeader title="Market Explorer" subtitle="Cross-market intelligence — live data" />

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors ${tab === t ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ───────────────────────────────────────────────── */}
      {tab === 'Overview' && (
        <div className="space-y-4">
          {/* Crypto Market Summary */}
          {cryptoData && (
            <Card>
              <h3 className="text-sm font-semibold text-white mb-3">Crypto Market</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-[#0A101C]/50 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 uppercase">Total Market Cap</div>
                  <div className="text-sm font-bold text-white">{cryptoData.totalMarketCapFormatted}</div>
                  <div className={`text-[10px] ${pctColor(cryptoData.marketCapChange24h)}`}>{cryptoData.marketCapChange24h > 0 ? '+' : ''}{cryptoData.marketCapChange24h.toFixed(2)}%</div>
                </div>
                <div className="bg-[#0A101C]/50 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 uppercase">24h Volume</div>
                  <div className="text-sm font-bold text-white">{cryptoData.totalVolumeFormatted}</div>
                </div>
                <div className="bg-[#0A101C]/50 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 uppercase">BTC Dominance</div>
                  <div className="text-sm font-bold text-white">{cryptoData.btcDominance.toFixed(1)}%</div>
                </div>
                <div className="bg-[#0A101C]/50 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 uppercase">ETH Dominance</div>
                  <div className="text-sm font-bold text-white">{cryptoData.ethDominance.toFixed(1)}%</div>
                </div>
              </div>
            </Card>
          )}
          {cryptoOverview.loading && <Card><div className="space-y-3"><Skel h="h-6" /><div className="grid grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skel key={i} h="h-16" />)}</div></div></Card>}

          {/* Sector Heatmap */}
          {sectorData.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-white mb-3">Sector Heatmap</h3>
              <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
                {sectorData.map((s: SectorData) => {
                  const pct = s.changePercent ?? s.daily ?? 0;
                  return (
                    <div
                      key={s.symbol}
                      className="rounded-lg p-2.5 text-center cursor-pointer hover:ring-1 hover:ring-white/20 transition-all"
                      style={{
                        backgroundColor: pct > 0 ? `rgba(16, 185, 129, ${Math.min(Math.abs(pct) / 3, 0.6)})` : pct < 0 ? `rgba(239, 68, 68, ${Math.min(Math.abs(pct) / 3, 0.6)})` : 'rgba(148, 163, 184, 0.1)',
                      }}
                    >
                      <div className="text-[10px] text-white font-semibold">{s.symbol}</div>
                      <div className="text-[9px] text-slate-300 truncate">{s.name}</div>
                      <div className={`text-xs font-bold ${pctColor(pct)}`}>
                        {pct > 0 ? '+' : ''}{pct.toFixed(2)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
          {sectors.loading && <Card><Skel h="h-40" /></Card>}

          {/* Top Movers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <h3 className="text-sm font-semibold text-emerald-400 mb-3">Top Gainers</h3>
              {movers.loading ? <div className="space-y-2">{[1,2,3,4,5].map(i => <Skel key={i} h="h-6" />)}</div> : (
                <div className="space-y-1">
                  {topGainers.map((m: Mover) => (
                    <div key={m.ticker} className="flex items-center justify-between text-xs py-1 px-1 rounded hover:bg-slate-800/40 cursor-pointer" onClick={() => { selectSymbol(m.ticker); navigateTo('golden-egg', m.ticker); }}>
                      <span className="font-semibold text-white w-16">{m.ticker}</span>
                      <span className="text-slate-300 font-mono">${parseFloat(m.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span className="text-emerald-400 font-mono w-16 text-right">+{m.change_percentage}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-red-400 mb-3">Top Losers</h3>
              {movers.loading ? <div className="space-y-2">{[1,2,3,4,5].map(i => <Skel key={i} h="h-6" />)}</div> : (
                <div className="space-y-1">
                  {topLosers.map((m: Mover) => (
                    <div key={m.ticker} className="flex items-center justify-between text-xs py-1 px-1 rounded hover:bg-slate-800/40 cursor-pointer" onClick={() => { selectSymbol(m.ticker); navigateTo('golden-egg', m.ticker); }}>
                      <span className="font-semibold text-white w-16">{m.ticker}</span>
                      <span className="text-slate-300 font-mono">${parseFloat(m.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span className="text-red-400 font-mono w-16 text-right">{m.change_percentage}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ── SECTORS ────────────────────────────────────────────────── */}
      {tab === 'Sectors' && (
        <Card>
          {sectors.loading ? <div className="space-y-3">{[1,2,3,4].map(i => <Skel key={i} h="h-8" />)}</div> : sectorData.length === 0 ? (
            <div className="text-xs text-slate-500 py-8 text-center">No sector data available</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Sector</th>
                    <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">ETF</th>
                    <th className="text-right py-2 px-2 text-[10px] uppercase text-slate-500">Change %</th>
                    <th className="text-right py-2 px-2 text-[10px] uppercase text-slate-500">Weekly</th>
                    <th className="text-right py-2 px-2 text-[10px] uppercase text-slate-500">Monthly</th>
                    <th className="text-right py-2 px-2 text-[10px] uppercase text-slate-500">YTD</th>
                    <th className="text-right py-2 px-2 text-[10px] uppercase text-slate-500">Weight</th>
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
                      <td className="py-2.5 px-2 text-right text-slate-400">{(s.weight * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── CRYPTO ─────────────────────────────────────────────────── */}
      {tab === 'Crypto' && (
        <div className="space-y-4">
          {cryptoData && (
            <Card>
              <h3 className="text-sm font-semibold text-white mb-3">Global Crypto Market</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-[#0A101C]/50 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 uppercase">Market Cap</div>
                  <div className="text-lg font-bold text-white">{cryptoData.totalMarketCapFormatted}</div>
                  <div className={`text-xs ${pctColor(cryptoData.marketCapChange24h)}`}>{cryptoData.marketCapChange24h > 0 ? '+' : ''}{cryptoData.marketCapChange24h.toFixed(2)}% (24h)</div>
                </div>
                <div className="bg-[#0A101C]/50 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 uppercase">24h Volume</div>
                  <div className="text-lg font-bold text-white">{cryptoData.totalVolumeFormatted}</div>
                </div>
                <div className="bg-[#0A101C]/50 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 uppercase">BTC Dominance</div>
                  <div className="text-lg font-bold text-orange-400">{cryptoData.btcDominance.toFixed(1)}%</div>
                </div>
                <div className="bg-[#0A101C]/50 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 uppercase">ETH Dominance</div>
                  <div className="text-lg font-bold text-blue-400">{cryptoData.ethDominance.toFixed(1)}%</div>
                </div>
              </div>
              {cryptoData.dominance && cryptoData.dominance.length > 0 && (
                <div className="mt-3 pt-2 border-t border-slate-800/40">
                  <div className="text-[10px] text-slate-500 mb-1">Top Dominance</div>
                  <div className="flex gap-2">
                    {cryptoData.dominance.map(d => (
                      <Badge key={d.symbol} label={`${d.symbol.toUpperCase()}: ${d.dominance.toFixed(1)}%`} color="#94A3B8" small />
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
          {/* Crypto movers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <h3 className="text-sm font-semibold text-emerald-400 mb-3">Top Crypto Gainers</h3>
              <div className="space-y-1">
                {topGainers.map((m: Mover) => (
                  <div key={m.ticker} className="flex items-center justify-between text-xs py-1 cursor-pointer hover:bg-slate-800/40 px-1 rounded" onClick={() => { selectSymbol(m.ticker); navigateTo('golden-egg', m.ticker); }}>
                    <span className="font-semibold text-white w-16">{m.ticker}</span>
                    <span className="text-slate-300 font-mono">${parseFloat(m.price).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                    <span className="text-emerald-400 font-mono">+{m.change_percentage}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-red-400 mb-3">Top Crypto Losers</h3>
              <div className="space-y-1">
                {topLosers.map((m: Mover) => (
                  <div key={m.ticker} className="flex items-center justify-between text-xs py-1 cursor-pointer hover:bg-slate-800/40 px-1 rounded" onClick={() => { selectSymbol(m.ticker); navigateTo('golden-egg', m.ticker); }}>
                    <span className="font-semibold text-white w-16">{m.ticker}</span>
                    <span className="text-slate-300 font-mono">${parseFloat(m.price).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                    <span className="text-red-400 font-mono">{m.change_percentage}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── COMMODITIES ────────────────────────────────────────────── */}
      {tab === 'Commodities' && (
        <Card>
          {commodities.loading ? <div className="space-y-3">{[1,2,3].map(i => <Skel key={i} h="h-12" />)}</div> : commodList.length === 0 ? (
            <div className="text-xs text-slate-500 py-8 text-center">No commodity data available</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {commodList.map((c: CommodityData) => (
                <div key={c.symbol} className="bg-[#0A101C]/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <div className="text-sm font-bold text-white">{c.name}</div>
                      <div className="text-[9px] text-slate-500">{c.category} · {c.unit}</div>
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
          {commodities.error && <div className="text-[10px] text-red-400/60 mt-2">Error: {commodities.error}</div>}
        </Card>
      )}

      {/* ── CROSS-MARKET ───────────────────────────────────────────── */}
      {tab === 'Cross-Market' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Cross-Market Influence Map</h3>
          <div className="space-y-3">
            {CROSS_MARKET.map(cm => (
              <div key={cm.from} className="bg-[#0A101C]/50 rounded-lg p-3">
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
          <div className="mt-3 pt-2 border-t border-slate-800/40 text-[10px] text-slate-600">
            Note: Cross-market influence data will be real-time in a future update. Currently showing known relationships.
          </div>
        </Card>
      )}

      {/* Errors */}
      {(sectors.error || cryptoOverview.error || movers.error || commodities.error) && (
        <div className="text-[10px] text-red-400/60 border border-red-900/30 rounded-lg p-3 space-y-1">
          {sectors.error && <div>Sectors: {sectors.error}</div>}
          {cryptoOverview.error && <div>Crypto: {cryptoOverview.error}</div>}
          {movers.error && <div>Movers: {movers.error}</div>}
          {commodities.error && <div>Commodities: {commodities.error}</div>}
        </div>
      )}
    </div>
  );
}
