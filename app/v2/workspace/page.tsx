'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 7: WORKSPACE — Personal Management & Learning
   Watchlist, Journal, Portfolio, Alerts, Backtest, Learning, Settings.
   Replaces: v1 Watchlists + Alerts + Portfolio + Journal + Backtest + Settings
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from 'react';
import { useV2 } from '../_lib/V2Context';
import { REGIME_COLORS, LIFECYCLE_COLORS } from '../_lib/constants';
import { Card, SectionHeader, Badge, TabBar, StatBox, EmptyState } from '../_components/ui';
import type { LifecycleState } from '../_lib/types';

export default function WorkspacePage() {
  const { data, journal, watchlist, navigateTo, selectSymbol } = useV2();
  const [tab, setTab] = useState('Watchlist');
  const tabs = ['Watchlist', 'Journal', 'Portfolio', 'Backtest', 'Learning', 'Settings'];

  // Journal stats
  const journalStats = useMemo(() => {
    const closed = journal.filter(j => j.outcome !== 'open');
    const wins = closed.filter(j => j.outcome === 'win').length;
    const total = closed.length;
    const avgRR = closed.filter(j => j.rr !== null).reduce((sum, j) => sum + (j.rr || 0), 0) / (total || 1);
    return { wins, total, winRate: total > 0 ? Math.round((wins / total) * 100) : 0, avgRR: avgRR.toFixed(1) };
  }, [journal]);

  return (
    <div className="space-y-4">
      <SectionHeader title="Workspace" subtitle="Personal management & learning" />
      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'Watchlist' && (
        <>
          {/* Lifecycle Pipeline */}
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3">Trade Pipeline</h3>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {(['DISCOVERED', 'WATCHING', 'SETTING_UP', 'READY', 'TRIGGERED', 'ACTIVE'] as LifecycleState[]).map(state => {
                const count = watchlist.filter(w => w.lifecycleState === state).length;
                return (
                  <div key={state} className="flex-shrink-0 text-center px-4 py-2 rounded-lg bg-[#0A101C]/50 min-w-[100px]">
                    <div className="text-lg font-bold" style={{ color: LIFECYCLE_COLORS[state] }}>{count}</div>
                    <div className="text-[10px] text-slate-500 uppercase">{state.replace('_', ' ')}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Watchlist */}
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3">Active Watchlist</h3>
            <div className="space-y-2">
              {watchlist.map(w => (
                <div key={w.symbol} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#0A101C]/50 hover:bg-slate-800/30 cursor-pointer"
                     onClick={() => { selectSymbol(w.symbol); navigateTo('golden-egg', w.symbol); }}>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-white text-sm">{w.symbol}</span>
                    <Badge label={w.lifecycleState} color={LIFECYCLE_COLORS[w.lifecycleState]} small />
                  </div>
                  <div className="text-xs text-slate-400">{w.alertCondition}</div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {tab === 'Journal' && (
        <>
          {/* Stats Bar */}
          <Card className="!p-3">
            <div className="flex items-center justify-around">
              <StatBox label="Win Rate" value={`${journalStats.winRate}%`} color={journalStats.winRate > 50 ? '#10B981' : '#EF4444'} />
              <StatBox label="Wins/Total" value={`${journalStats.wins}/${journalStats.total}`} />
              <StatBox label="Avg RR" value={`${journalStats.avgRR}x`} color="#F59E0B" />
              <StatBox label="Open" value={journal.filter(j => j.outcome === 'open').length} color="#6366F1" />
            </div>
          </Card>

          {/* Journal Entries */}
          <Card className="!p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-[10px] uppercase text-slate-500">Symbol</th>
                  <th className="text-left px-2 py-3 text-[10px] uppercase text-slate-500">Date</th>
                  <th className="text-left px-2 py-3 text-[10px] uppercase text-slate-500">Setup</th>
                  <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Regime</th>
                  <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Entry</th>
                  <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Exit</th>
                  <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">RR</th>
                  <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {journal.map(j => (
                  <tr key={j.id} className="border-b border-slate-800/30">
                    <td className="px-4 py-3 font-semibold text-white">{j.symbol}</td>
                    <td className="px-2 py-3 text-slate-400">{j.date}</td>
                    <td className="px-2 py-3 text-slate-300">{j.setupType}</td>
                    <td className="text-center px-2"><Badge label={j.regime} color={REGIME_COLORS[j.regime]} small /></td>
                    <td className="text-center px-2 text-white">${j.entry.toLocaleString()}</td>
                    <td className="text-center px-2 text-slate-400">{j.exit ? `$${j.exit.toLocaleString()}` : '—'}</td>
                    <td className="text-center px-2" style={{ color: j.rr && j.rr > 0 ? '#10B981' : j.rr && j.rr < 0 ? '#EF4444' : '#64748B' }}>
                      {j.rr ? `${j.rr > 0 ? '+' : ''}${j.rr}x` : '—'}
                    </td>
                    <td className="text-center px-2">
                      <Badge
                        label={j.outcome}
                        color={j.outcome === 'win' ? '#10B981' : j.outcome === 'loss' ? '#EF4444' : j.outcome === 'open' ? '#6366F1' : '#64748B'}
                        small
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'Portfolio' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Portfolio</h3>
          <div className="text-xs text-slate-500 text-center py-4">
            Connects to existing portfolio tracker at <span className="text-emerald-400">/tools/portfolio</span>
          </div>
          <div className="space-y-2">
            {data.filter(d => d.lifecycleState === 'ACTIVE').map(d => (
              <div key={d.symbol} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#0A101C]/50">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-white">{d.symbol}</span>
                  <Badge label="ACTIVE" color="#22C55E" small />
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-slate-300">${d.price.toLocaleString()}</span>
                  <span className={d.change >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {d.change >= 0 ? '+' : ''}{d.change}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'Backtest' && (
        <Card>
          <EmptyState message="Backtesting engine — connects to existing /tools/backtest" icon="⟳" />
        </Card>
      )}

      {tab === 'Learning' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Learning Engine (v3 Preview)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-[#0A101C]/50 border border-slate-800/30">
              <div className="text-xs font-semibold text-white mb-2">Best Setup Types</div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><span className="text-slate-300">Compression Breakout</span><span className="text-emerald-400">68% win rate</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-300">Trend Continuation</span><span className="text-emerald-400">63% win rate</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-300">Volatility Expansion</span><span className="text-amber-400">55% win rate</span></div>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-[#0A101C]/50 border border-slate-800/30">
              <div className="text-xs font-semibold text-white mb-2">Regime Performance</div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><span className="text-slate-300">Trend</span><span className="text-emerald-400">71% win rate</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-300">Compression</span><span className="text-emerald-400">65% win rate</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-300">Range</span><span className="text-red-400">38% win rate</span></div>
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500 text-center">
            Full personal learning engine with doctrine scoring coming in v3
          </div>
        </Card>
      )}

      {tab === 'Settings' && (
        <Card>
          <EmptyState message="Settings — connects to existing /tools/settings" icon="⚙" />
        </Card>
      )}
    </div>
  );
}
