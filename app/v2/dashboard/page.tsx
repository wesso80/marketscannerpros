'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 1: DASHBOARD — Command Center
   "What matters today" in 10 seconds.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useMemo } from 'react';
import { useV2 } from '../_lib/V2Context';
import { REGIME_COLORS, VERDICT_COLORS, LIFECYCLE_COLORS, CROSS_MARKET } from '../_lib/constants';
import { Card, SectionHeader, ScoreBar, Badge, ImpactDot } from '../_components/ui';

export default function DashboardPage() {
  const { data, news, calendar, navigateTo, selectSymbol } = useV2();

  const topSetups = useMemo(() => [...data].sort((a, b) => b.mspScore - a.mspScore).slice(0, 5), [data]);
  const alerts = useMemo(() => data.filter(d => d.lifecycleState === 'READY' || d.lifecycleState === 'TRIGGERED'), [data]);
  const highImpactEvents = calendar.filter(e => e.impact === 'high');

  return (
    <div className="space-y-4">
      <SectionHeader title="Command Center" subtitle="What matters today" />

      {/* Best Setups Now */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Best Setups Now</h3>
          <button onClick={() => navigateTo('scanner')} className="text-[10px] text-emerald-400 hover:underline">View Scanner →</button>
        </div>
        <div className="space-y-2">
          {topSetups.map(s => (
            <div
              key={s.symbol}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#0A101C]/50 hover:bg-slate-800/50 cursor-pointer transition-colors"
              onClick={() => { selectSymbol(s.symbol); navigateTo('golden-egg', s.symbol); }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-sm font-bold text-white w-14">{s.symbol}</div>
                <Badge label={s.regimePriority} color={REGIME_COLORS[s.regimePriority]} small />
                <Badge label={s.verdict} color={VERDICT_COLORS[s.verdict]} small />
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs text-slate-400">MSP Score</div>
                  <div className="text-sm font-bold" style={{ color: s.mspScore > 75 ? '#10B981' : s.mspScore > 55 ? '#F59E0B' : '#EF4444' }}>
                    {s.mspScore}
                  </div>
                </div>
                <div className="w-16">
                  <ScoreBar value={s.mspScore} color={s.mspScore > 75 ? '#10B981' : s.mspScore > 55 ? '#F59E0B' : '#EF4444'} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Watchlist Alerts */}
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Active Alerts</h3>
          {alerts.length === 0 ? (
            <div className="text-xs text-slate-500 py-4 text-center">No active alerts</div>
          ) : (
            <div className="space-y-2">
              {alerts.map(a => (
                <div key={a.symbol} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{a.symbol}</span>
                    <Badge label={a.lifecycleState} color={LIFECYCLE_COLORS[a.lifecycleState]} small />
                  </div>
                  <span className="text-slate-400">{a.triggerCondition}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Macro Events Today */}
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Upcoming Events</h3>
          <div className="space-y-2">
            {highImpactEvents.slice(0, 4).map(e => (
              <div key={e.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center">
                  <ImpactDot impact={e.impact} />
                  <span className="text-white">{e.title}</span>
                </div>
                <span className="text-slate-500">{e.time}</span>
              </div>
            ))}
            <button onClick={() => navigateTo('research')} className="text-[10px] text-emerald-400 hover:underline mt-1">Full Calendar →</button>
          </div>
        </Card>

        {/* Cross-Market */}
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Cross-Market Influence</h3>
          <div className="space-y-2">
            {CROSS_MARKET.slice(0, 4).map(cm => (
              <div key={cm.from} className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{cm.from} {cm.condition}</span>
                <span className="text-slate-500">{cm.effect}</span>
              </div>
            ))}
            <button onClick={() => navigateTo('explorer')} className="text-[10px] text-emerald-400 hover:underline mt-1">Market Explorer →</button>
          </div>
        </Card>
      </div>

      {/* Latest News */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Latest Headlines</h3>
          <button onClick={() => navigateTo('research')} className="text-[10px] text-emerald-400 hover:underline">All News →</button>
        </div>
        <div className="space-y-2">
          {news.slice(0, 4).map(n => (
            <div key={n.id} className="flex items-center justify-between text-xs py-1">
              <div className="flex items-center gap-2 min-w-0">
                <ImpactDot impact={n.impact} />
                <span className="text-white truncate">{n.title}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {n.symbols.slice(0, 2).map(sym => (
                  <span key={sym} className="text-emerald-400 cursor-pointer hover:underline" onClick={() => { selectSymbol(sym); navigateTo('golden-egg', sym); }}>{sym}</span>
                ))}
                <span className="text-slate-600">{n.time}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
