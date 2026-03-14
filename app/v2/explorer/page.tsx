'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 5: MARKET EXPLORER — Cross-Market Intelligence
   Bird's eye view: heatmaps, movers, flows, rotation, correlations.
   Replaces: v1 Markets + Equities/Crypto/Commodities Explorers + Heatmaps + Movers
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from 'react';
import { useV2 } from '../_lib/V2Context';
import { VOL_COLORS, CROSS_MARKET } from '../_lib/constants';
import { Card, SectionHeader, Badge, TabBar, EmptyState } from '../_components/ui';
import type { SymbolIntelligence } from '../_lib/types';

export default function ExplorerPage() {
  const { data, navigateTo, selectSymbol } = useV2();
  const [tab, setTab] = useState('Overview');
  const tabs = ['Overview', 'Equities', 'Crypto', 'Commodities', 'Indices', 'Sectors', 'Volatility'];

  const topMovers = useMemo(() => [...data].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 8), [data]);
  const volExpansions = useMemo(() => data.filter(d => d.volatilityState.regime === 'expansion' || d.volatilityState.regime === 'climax'), [data]);

  const renderHeatmap = (items: SymbolIntelligence[]) => (
    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
      {items.map(s => (
        <div
          key={s.symbol}
          className="p-3 rounded-lg cursor-pointer hover:ring-1 hover:ring-slate-600 transition-all"
          style={{
            backgroundColor: s.change >= 0
              ? `rgba(16, 185, 129, ${Math.min(0.4, Math.abs(s.change) / 10)})`
              : `rgba(239, 68, 68, ${Math.min(0.4, Math.abs(s.change) / 10)})`,
          }}
          onClick={() => { selectSymbol(s.symbol); navigateTo('golden-egg', s.symbol); }}
        >
          <div className="text-sm font-bold text-white">{s.symbol}</div>
          <div className={`text-xs font-semibold ${s.change >= 0 ? 'text-green-300' : 'text-red-300'}`}>
            {s.change >= 0 ? '+' : ''}{s.change}%
          </div>
          <div className="text-[10px] text-slate-400 mt-1">${s.price.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionHeader title="Market Explorer" subtitle="Cross-market intelligence" />
      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'Overview' && (
        <>
          {/* Heatmap */}
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3">Market Heatmap</h3>
            {renderHeatmap(data)}
          </Card>

          {/* Top Movers + Vol Expansions side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <h3 className="text-sm font-semibold text-white mb-3">Top Movers</h3>
              <div className="space-y-2">
                {topMovers.map(s => (
                  <div key={s.symbol} className="flex items-center justify-between text-xs py-1 cursor-pointer hover:bg-slate-800/30 px-2 rounded" onClick={() => { selectSymbol(s.symbol); navigateTo('golden-egg', s.symbol); }}>
                    <span className="font-semibold text-white w-12">{s.symbol}</span>
                    <span className="text-slate-400">${s.price.toLocaleString()}</span>
                    <span className={s.change >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {s.change >= 0 ? '+' : ''}{s.change}%
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-white mb-3">Volatility Expansions</h3>
              {volExpansions.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">No active expansions</div>
              ) : (
                <div className="space-y-2">
                  {volExpansions.map(s => (
                    <div key={s.symbol} className="flex items-center justify-between text-xs py-1 cursor-pointer hover:bg-slate-800/30 px-2 rounded" onClick={() => { selectSymbol(s.symbol); navigateTo('golden-egg', s.symbol); }}>
                      <span className="font-semibold text-white w-12">{s.symbol}</span>
                      <Badge label={s.volatilityState.regime} color={VOL_COLORS[s.volatilityState.regime]} small />
                      <span className="text-slate-400">BBWP: {s.volatilityState.bbwp}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Cross-Market Influence */}
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3">Cross-Market Influence Map</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {CROSS_MARKET.map(cm => (
                <div key={cm.from} className="p-3 rounded-lg bg-[#0A101C]/50 border border-slate-800/30">
                  <div className="text-sm font-semibold text-white">{cm.from} {cm.condition}</div>
                  <div className="text-xs text-slate-400 mt-1">{cm.effect}</div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Asset class tabs */}
      {['Equities', 'Crypto', 'Commodities', 'Indices'].includes(tab) && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">{tab}</h3>
          {renderHeatmap(
            data.filter(d =>
              tab === 'Equities' ? d.assetClass === 'equity' :
              tab === 'Crypto' ? d.assetClass === 'crypto' :
              tab === 'Commodities' ? d.assetClass === 'commodity' :
              d.assetClass === 'index'
            )
          )}
        </Card>
      )}

      {tab === 'Sectors' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Sector Rotation</h3>
          <div className="bg-[#0A101C] rounded-lg border border-slate-800/50 p-8 text-center text-slate-500">
            <div className="text-2xl mb-2">◐</div>
            <div className="text-sm">Sector rotation heatmap</div>
            <div className="text-xs text-slate-600 mt-1">Technology, Healthcare, Financials, Energy, etc.</div>
          </div>
        </Card>
      )}

      {tab === 'Volatility' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Volatility Dashboard</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {Object.entries(VOL_COLORS).map(([regime, color]) => {
              const count = data.filter(d => d.volatilityState.regime === regime).length;
              return (
                <div key={regime} className="text-center p-3 rounded-lg bg-[#0A101C]/50">
                  <div className="text-lg font-bold" style={{ color }}>{count}</div>
                  <div className="text-[10px] text-slate-500 uppercase">{regime}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
