'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 2: SCANNER — Regime-Aware Ranked Opportunity Engine
   Replaces: v1 Scanner + Confluence Scanner + Time Scanner + Market Movers
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from 'react';
import { useV2 } from '../_lib/V2Context';
import { REGIME_COLORS, VERDICT_COLORS, LIFECYCLE_COLORS, VOL_COLORS, REGIME_WEIGHTS } from '../_lib/constants';
import { Card, SectionHeader, Badge, TabBar, EmptyState } from '../_components/ui';

export default function ScannerPage() {
  const { data, navigateTo, selectSymbol } = useV2();
  const [tab, setTab] = useState('All Markets');
  const [sortField, setSortField] = useState<'mspScore' | 'confluenceScore' | 'confidence' | 'timeAlignment'>('mspScore');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const tabs = ['All Markets', 'Equities', 'Crypto', 'Commodities', 'Indices', 'Highest Confluence', 'Vol Expansions', 'Trade Ready'];

  const filtered = useMemo(() => {
    let items = [...data];
    switch (tab) {
      case 'Equities': items = items.filter(i => i.assetClass === 'equity'); break;
      case 'Crypto': items = items.filter(i => i.assetClass === 'crypto'); break;
      case 'Commodities': items = items.filter(i => i.assetClass === 'commodity'); break;
      case 'Indices': items = items.filter(i => i.assetClass === 'index'); break;
      case 'Highest Confluence': items = items.filter(i => i.confluenceScore > 75); break;
      case 'Vol Expansions': items = items.filter(i => i.volatilityState.regime === 'expansion' || i.volatilityState.regime === 'climax'); break;
      case 'Trade Ready': items = items.filter(i => i.verdict === 'TRADE'); break;
    }
    items.sort((a, b) => sortDir === 'desc' ? b[sortField] - a[sortField] : a[sortField] - b[sortField]);
    return items;
  }, [data, tab, sortField, sortDir]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortHeader = ({ field, label }: { field: typeof sortField; label: string }) => (
    <button
      onClick={() => toggleSort(field)}
      className={`text-[10px] uppercase tracking-wider ${sortField === field ? 'text-emerald-400' : 'text-slate-500'} hover:text-slate-300 transition-colors`}
    >
      {label} {sortField === field && (sortDir === 'desc' ? '↓' : '↑')}
    </button>
  );

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Scanner"
        subtitle="Regime-aware ranked opportunity engine"
        action={<Badge label={`${filtered.length} results`} color="#64748B" small />}
      />

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {/* Regime Weight Indicator */}
      <Card className="!p-3">
        <div className="flex items-center gap-4 text-[10px] overflow-x-auto">
          <span className="text-slate-500 uppercase tracking-wider whitespace-nowrap">Regime Weights →</span>
          {Object.entries(REGIME_WEIGHTS.trend).map(([k]) => (
            <span key={k} className="text-slate-400 capitalize whitespace-nowrap">{k}</span>
          ))}
        </div>
      </Card>

      {/* Scanner Table */}
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500">Symbol</th>
              <th className="text-center px-2 py-3 text-[10px] uppercase tracking-wider text-slate-500">Regime</th>
              <th className="text-center px-2 py-3 text-[10px] uppercase tracking-wider text-slate-500">Bias</th>
              <th className="text-center px-2 py-3"><SortHeader field="mspScore" label="MSP Score" /></th>
              <th className="text-center px-2 py-3"><SortHeader field="confluenceScore" label="Confluence" /></th>
              <th className="text-center px-2 py-3"><SortHeader field="confidence" label="Confidence" /></th>
              <th className="text-center px-2 py-3"><SortHeader field="timeAlignment" label="Time" /></th>
              <th className="text-center px-2 py-3 text-[10px] uppercase tracking-wider text-slate-500">DVE</th>
              <th className="text-center px-2 py-3 text-[10px] uppercase tracking-wider text-slate-500">Options</th>
              <th className="text-center px-2 py-3 text-[10px] uppercase tracking-wider text-slate-500">Lifecycle</th>
              <th className="text-center px-2 py-3 text-[10px] uppercase tracking-wider text-slate-500">Verdict</th>
              <th className="text-center px-2 py-3 text-[10px] uppercase tracking-wider text-slate-500">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.symbol} className="border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-semibold text-white">{s.symbol}</div>
                  <div className="text-[10px] text-slate-500">{s.name}</div>
                </td>
                <td className="text-center px-2"><Badge label={s.regimePriority} color={REGIME_COLORS[s.regimePriority]} small /></td>
                <td className="text-center px-2">
                  <span style={{ color: s.directionalBias === 'bullish' ? '#2FB36E' : s.directionalBias === 'bearish' ? '#E46767' : '#64748B' }}>
                    {s.directionalBias === 'bullish' ? '▲' : s.directionalBias === 'bearish' ? '▼' : '—'} {s.directionalBias}
                  </span>
                </td>
                <td className="text-center px-2">
                  <span className="font-bold" style={{ color: s.mspScore > 75 ? '#10B981' : s.mspScore > 55 ? '#F59E0B' : '#EF4444' }}>
                    {s.mspScore}
                  </span>
                </td>
                <td className="text-center px-2 text-slate-300">{s.confluenceScore}</td>
                <td className="text-center px-2 text-slate-300">{s.confidence}%</td>
                <td className="text-center px-2 text-slate-300">{s.timeAlignment}</td>
                <td className="text-center px-2"><Badge label={s.volatilityState.regime} color={VOL_COLORS[s.volatilityState.regime]} small /></td>
                <td className="text-center px-2">
                  <span style={{ color: s.optionsInfluence.flowBias === 'bullish' ? '#2FB36E' : s.optionsInfluence.flowBias === 'bearish' ? '#E46767' : '#64748B' }}>
                    {s.optionsInfluence.flowBias}
                  </span>
                </td>
                <td className="text-center px-2"><Badge label={s.lifecycleState} color={LIFECYCLE_COLORS[s.lifecycleState]} small /></td>
                <td className="text-center px-2"><Badge label={s.verdict} color={VERDICT_COLORS[s.verdict]} small /></td>
                <td className="text-center px-2">
                  <button
                    onClick={() => { selectSymbol(s.symbol); navigateTo('golden-egg', s.symbol); }}
                    className="px-2 py-1 rounded text-[10px] bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                  >
                    Analyze
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState message="No symbols match current filter" icon="⊘" />}
      </Card>
    </div>
  );
}
