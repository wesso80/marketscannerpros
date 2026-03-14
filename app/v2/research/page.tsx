'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE 6: RESEARCH — Actionable Information Layer
   News, Economic Calendar, Earnings, Themes.
   Replaces: v1 News + Economic Calendar pages
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { useV2 } from '../_lib/V2Context';
import { Card, SectionHeader, TabBar, ImpactDot, EmptyState } from '../_components/ui';

export default function ResearchPage() {
  const { news, calendar, navigateTo, selectSymbol } = useV2();
  const [tab, setTab] = useState('News');
  const tabs = ['News', 'Economic Calendar', 'Earnings', 'Themes'];

  return (
    <div className="space-y-4">
      <SectionHeader title="Research" subtitle="Actionable information layer" />
      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'News' && (
        <div className="space-y-2">
          {news.map(n => (
            <Card key={n.id} className="!p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <ImpactDot impact={n.impact} />
                    <span className="text-[10px] text-slate-500 uppercase">{n.category}</span>
                    <span className="text-[10px] text-slate-600">{n.source}</span>
                  </div>
                  <div className="text-sm text-white font-medium">{n.title}</div>
                  <div className="flex gap-2 mt-2">
                    {n.symbols.map(sym => (
                      <button
                        key={sym}
                        onClick={() => { selectSymbol(sym); navigateTo('golden-egg', sym); }}
                        className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="text-[10px] text-slate-600 whitespace-nowrap flex-shrink-0">{n.time}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'Economic Calendar' && (
        <Card className="!p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-[10px] uppercase text-slate-500">Event</th>
                <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Date</th>
                <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Time</th>
                <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Impact</th>
                <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Forecast</th>
                <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Previous</th>
              </tr>
            </thead>
            <tbody>
              {calendar.map(e => (
                <tr key={e.id} className="border-b border-slate-800/30">
                  <td className="px-4 py-3">
                    <div className="text-white">{e.title}</div>
                    <div className="text-[10px] text-slate-500">{e.category}</div>
                  </td>
                  <td className="text-center px-2 text-slate-400">{e.date}</td>
                  <td className="text-center px-2 text-slate-400">{e.time}</td>
                  <td className="text-center px-2"><ImpactDot impact={e.impact} /><span className="text-slate-400 capitalize">{e.impact}</span></td>
                  <td className="text-center px-2 text-white font-medium">{e.forecast}</td>
                  <td className="text-center px-2 text-slate-500">{e.previous}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'Earnings' && (
        <Card>
          <EmptyState message="Earnings calendar — coming in v3" icon="📅" />
        </Card>
      )}

      {tab === 'Themes' && (
        <Card>
          <EmptyState message="Market themes & AI summaries — coming in v3" icon="🎯" />
        </Card>
      )}
    </div>
  );
}
