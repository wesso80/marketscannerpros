'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 2: SCANNER — Ranked Opportunity Engine
   Real API data: /api/scanner/run for equities + crypto
   ═══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from 'react';
import { useV2 } from '../_lib/V2Context';
import { useScannerResults, useRegime, type ScanResult, type ScanTimeframe, SCAN_TIMEFRAMES } from '../_lib/api';
import { Card, SectionHeader, Badge } from '../_components/ui';
import { REGIME_COLORS, REGIME_WEIGHTS } from '../_lib/constants';
import type { RegimePriority } from '../_lib/types';
import { useUserTier, FREE_DAILY_SCAN_LIMIT, canAccessUnlimitedScanning } from '@/lib/useUserTier';

const TABS = ['All', 'Equities', 'Crypto', 'Bullish', 'Bearish', 'High Score', 'DVE Signals', 'Regime Match'] as const;

function dirColor(d?: string) {
  if (d === 'bullish') return '#10B981';
  if (d === 'bearish') return '#EF4444';
  return '#94A3B8';
}

type SortKey = 'symbol' | 'score' | 'direction' | 'confidence' | 'rsi' | 'price' | 'dveBbwp';
type SortDir = 'asc' | 'desc';

export default function ScannerPage() {
  const { navigateTo, selectSymbol } = useV2();
  const { tier } = useUserTier();
  const [timeframe, setTimeframe] = useState<ScanTimeframe>('daily');
  const equity = useScannerResults('equity', timeframe);
  const crypto = useScannerResults('crypto', timeframe);
  const regime = useRegime();

  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('All');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const currentRegime = regime.data?.regime?.toLowerCase() || 'trend';

  // Regime-compatible setup types (Critical Upgrade #1)
  const regimeSetupMap: Record<string, string[]> = {
    trend: ['breakout', 'trend_continuation', 'pullback'],
    range: ['mean_reversion', 'range_fade', 'liquidity_sweep'],
    compression: ['volatility_expansion', 'squeeze', 'gamma_trap'],
    transition: ['breakout', 'gamma_squeeze', 'volatility_expansion'],
    expansion: ['breakout', 'trend_continuation', 'gamma_squeeze'],
    risk_off: ['mean_reversion', 'hedge', 'range_fade'],
    risk_on: ['breakout', 'trend_continuation', 'pullback'],
  };

  function isRegimeCompatible(r: ScanResult): boolean {
    const setupType = (r.setup || r.dveSignalType || '').toLowerCase().replace(/\s+/g, '_');
    const compatible = regimeSetupMap[currentRegime] || [];
    // If no setup type, check if direction aligns with regime
    if (!setupType || setupType === 'none') {
      if (currentRegime === 'risk_off') return r.direction === 'bearish';
      if (currentRegime === 'risk_on' || currentRegime === 'trend' || currentRegime === 'expansion') return r.direction === 'bullish';
      return true;
    }
    return compatible.some(c => setupType.includes(c));
  }

  const allResults: ScanResult[] = useMemo(() => {
    const eq = (equity.data?.results || []).map(r => ({ ...r, _assetClass: 'equity' as const }));
    const cr = (crypto.data?.results || []).map(r => ({ ...r, _assetClass: 'crypto' as const }));
    return [...eq, ...cr];
  }, [equity.data, crypto.data]);

  const filtered = useMemo(() => {
    let items = allResults;
    switch (activeTab) {
      case 'Equities': items = items.filter(r => (r as any)._assetClass === 'equity'); break;
      case 'Crypto': items = items.filter(r => (r as any)._assetClass === 'crypto'); break;
      case 'Bullish': items = items.filter(r => r.direction === 'bullish'); break;
      case 'Bearish': items = items.filter(r => r.direction === 'bearish'); break;
      case 'High Score': items = items.filter(r => Math.abs(r.score) >= 5); break;
      case 'DVE Signals': items = items.filter(r => (r.dveSignalType && r.dveSignalType !== 'none') || (r.dveFlags && r.dveFlags.length > 0)); break;
      case 'Regime Match': items = items.filter(r => isRegimeCompatible(r)); break;
    }
    items.sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'symbol': av = a.symbol; bv = b.symbol; break;
        case 'score': av = a.score ?? 0; bv = b.score ?? 0; break;
        case 'direction': av = a.direction ?? ''; bv = b.direction ?? ''; break;
        case 'confidence': av = a.confidence ?? 0; bv = b.confidence ?? 0; break;
        case 'rsi': av = a.rsi ?? 0; bv = b.rsi ?? 0; break;
        case 'price': av = a.price ?? 0; bv = b.price ?? 0; break;
        case 'dveBbwp': av = a.dveBbwp ?? 0; bv = b.dveBbwp ?? 0; break;
        default: av = 0; bv = 0;
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return items;
  }, [allResults, activeTab, sortKey, sortDir]);

  const loading = equity.loading || crypto.loading;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortHeader({ k, label, w }: { k: SortKey; label: string; w: string }) {
    return (
      <th
        className={`${w} text-left text-[10px] uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-300 py-2 px-2 select-none`}
        onClick={() => toggleSort(k)}
      >
        {label} {sortKey === k ? (sortDir === 'desc' ? '↓' : '↑') : ''}
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Scanner" subtitle="Ranked opportunity engine — live scan results" />

      {/* Active Regime Context */}
      {regime.data && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-700/50 bg-[#0D1422]">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Active Regime</span>
          <Badge label={regime.data.regime} color={REGIME_COLORS[currentRegime as RegimePriority] || '#64748B'} small />
          <span className="text-[10px] text-slate-500">Risk: <span className="text-white">{regime.data.riskLevel}</span></span>
          <span className="text-[10px] text-slate-500">Permission: <span className={regime.data.permission === 'full' ? 'text-emerald-400' : regime.data.permission === 'reduced' ? 'text-yellow-400' : 'text-red-400'}>{regime.data.permission}</span></span>
          <div className="h-3 w-px bg-slate-700 mx-1" />
          <span className="text-[9px] text-slate-600">Weights: {Object.entries(REGIME_WEIGHTS[currentRegime] || {}).map(([k, v]) => `${k}:${v}`).join(' · ')}</span>
        </div>
      )}

      {/* Timeframe selector */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-slate-500 mr-1 uppercase">Timeframe</span>
        {SCAN_TIMEFRAMES.map(tf => (
          <button
            key={tf.value}
            onClick={() => setTimeframe(tf.value)}
            className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${timeframe === tf.value ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-slate-700/50'}`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors ${activeTab === tab ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'}`}
          >
            {tab}
            <span className="ml-1 text-[10px] text-slate-600">
              {tab === 'All' ? allResults.length
                : tab === 'Equities' ? allResults.filter(r => (r as any)._assetClass === 'equity').length
                : tab === 'Crypto' ? allResults.filter(r => (r as any)._assetClass === 'crypto').length
                : tab === 'Bullish' ? allResults.filter(r => r.direction === 'bullish').length
                : tab === 'Bearish' ? allResults.filter(r => r.direction === 'bearish').length
                : tab === 'High Score' ? allResults.filter(r => Math.abs(r.score) >= 5).length
                : tab === 'DVE Signals' ? allResults.filter(r => (r.dveSignalType && r.dveSignalType !== 'none') || (r.dveFlags && r.dveFlags.length > 0)).length
                : tab === 'Regime Match' ? allResults.filter(r => isRegimeCompatible(r)).length
                : 0}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        {/* Free tier limit notice */}
        {!canAccessUnlimitedScanning(tier) && (
          <div className="mb-3 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center justify-between">
            <span className="text-xs text-amber-300">Free tier: {FREE_DAILY_SCAN_LIMIT} scans/day. Upgrade for unlimited scanning.</span>
            <a href="/v2/pricing" className="text-[10px] px-2 py-1 bg-amber-500/20 text-amber-400 rounded border border-amber-500/30 hover:bg-amber-500/30 transition-colors">Upgrade</a>
          </div>
        )}
        {loading ? (
          <div className="space-y-3 py-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-8 bg-slate-700/30 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-xs text-slate-500 py-12 text-center">No results match this filter. Try scanning more symbols or changing the tab.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <SortHeader k="symbol" label="Symbol" w="w-20" />
                  <SortHeader k="price" label="Price" w="w-20" />
                  <SortHeader k="direction" label="Direction" w="w-20" />
                  <SortHeader k="score" label="Score" w="w-16" />
                  <SortHeader k="confidence" label="Conf %" w="w-16" />
                  <SortHeader k="rsi" label="RSI" w="w-14" />
                  <SortHeader k="dveBbwp" label="BBWP" w="w-14" />
                  <th className="w-24 text-left text-[10px] uppercase tracking-wider text-slate-500 py-2 px-2">DVE</th>
                  <th className="w-16 text-left text-[10px] uppercase tracking-wider text-slate-500 py-2 px-2">Regime</th>
                  <th className="w-20 text-left text-[10px] uppercase tracking-wider text-slate-500 py-2 px-2">Setup</th>
                  <th className="w-16 text-[10px] uppercase tracking-wider text-slate-500 py-2 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const regimeLabel = r.scoreV2?.regime?.label || r.type || '';
                  return (
                    <tr
                      key={r.symbol}
                      className="border-b border-slate-800/40 hover:bg-slate-800/30 cursor-pointer transition-colors"
                      onClick={() => { selectSymbol(r.symbol); navigateTo('golden-egg', r.symbol); }}
                    >
                      <td className="py-2.5 px-2">
                        <div className="font-bold text-white">{r.symbol}</div>
                        <div className="text-[9px] text-slate-600">{regimeLabel}</div>
                      </td>
                      <td className="py-2.5 px-2 text-slate-300 font-mono">
                        {r.price != null ? `$${r.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="py-2.5 px-2">
                        <Badge label={r.direction || 'neutral'} color={dirColor(r.direction)} small />
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="font-bold" style={{ color: dirColor(r.direction) }}>{r.score}</span>
                      </td>
                      <td className="py-2.5 px-2 text-slate-300">
                        {r.confidence != null ? `${r.confidence}%` : '—'}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className={r.rsi != null ? (r.rsi > 70 ? 'text-red-400' : r.rsi < 30 ? 'text-emerald-400' : 'text-slate-300') : 'text-slate-600'}>
                          {r.rsi != null ? r.rsi.toFixed(0) : '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2">
                        <span className={r.dveBbwp != null ? (r.dveBbwp < 20 ? 'text-cyan-400' : r.dveBbwp > 80 ? 'text-orange-400' : 'text-slate-300') : 'text-slate-600'}>
                          {r.dveBbwp != null ? r.dveBbwp.toFixed(0) : '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-[10px] truncate max-w-[100px]">
                        {(() => {
                          if (r.dveSignalType && r.dveSignalType !== 'none') return <span className="text-yellow-400 font-semibold">{r.dveSignalType.replace(/_/g, ' ')}</span>;
                          if (r.dveFlags && r.dveFlags.length > 0) {
                            const fc: Record<string, string> = { SQUEEZE_FIRE: 'text-yellow-400', COMPRESSED: 'text-cyan-400', EXPANDING: 'text-amber-400', CLIMAX: 'text-red-400', BREAKOUT: 'text-emerald-400', HIGH_BREAKOUT: 'text-emerald-300', VOL_TRAP: 'text-red-300', EXHAUSTION_RISK: 'text-orange-400', DIR_BULL: 'text-emerald-400', DIR_BEAR: 'text-red-400', EXTENDED_PHASE: 'text-slate-400', CONTINUATION: 'text-amber-300' };
                            const top = r.dveFlags[0];
                            return <span className={fc[top] || 'text-slate-400'}>{top.replace(/_/g, ' ')}{r.dveFlags.length > 1 ? ` +${r.dveFlags.length - 1}` : ''}</span>;
                          }
                          return <span className="text-slate-600">—</span>;
                        })()}
                      </td>
                      <td className="py-2.5 px-2">
                        {isRegimeCompatible(r)
                          ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">✓ Match</span>
                          : r.scoreV2?.regimeScore?.gated
                            ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20">Gated</span>
                            : <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-500 border border-slate-500/20">Neutral</span>
                        }
                      </td>
                      <td className="py-2.5 px-2 text-[10px] text-slate-400 truncate max-w-[80px]">
                        {r.setup || '—'}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); selectSymbol(r.symbol); navigateTo('golden-egg', r.symbol); }}
                          className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded text-[10px] hover:bg-emerald-500/20 transition-colors"
                        >
                          Analyze
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/40">
          <span className="text-[10px] text-slate-600">{filtered.length} symbols</span>
          <div className="flex items-center gap-2">
            <button onClick={() => { equity.refetch(); crypto.refetch(); }} className="text-[10px] text-emerald-400 hover:underline">↻ Rescan</button>
          </div>
        </div>
      </Card>

      {/* Errors */}
      {(equity.error || crypto.error) && (
        <div className="text-[10px] text-red-400/60 border border-red-900/30 rounded-lg p-3">
          {equity.error && <div>Equity scan: {equity.error}</div>}
          {crypto.error && <div>Crypto scan: {crypto.error}</div>}
        </div>
      )}
    </div>
  );
}
