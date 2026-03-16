'use client';

/* ---------------------------------------------------------------------------
   SURFACE 6: RESEARCH — Information Layer
   Real API data: /api/news-sentiment + /api/economic-calendar + /api/earnings
   --------------------------------------------------------------------------- */

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useV2 } from '@/app/v2/_lib/V2Context';
import { useNews, useEconomicCalendar, useEarningsCalendar, type NewsArticle, type EconomicEvent, type EarningsEntry } from '@/app/v2/_lib/api';
import { Card, SectionHeader, Badge, ImpactDot, UpgradeGate } from '@/app/v2/_components/ui';
import { useUserTier } from '@/lib/useUserTier';

/* ─── Dynamic imports: v1 rich components ─── */
const NewsIntelligence = dynamic(() => import('@/app/tools/news/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading News Intelligence…</div> });
const EconCalendarV1 = dynamic(() => import('@/app/tools/economic-calendar/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Economic Calendar Intelligence…</div> });

function Skel({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}
function SkeletonRows({ n = 6 }: { n?: number }) {
  return <div className="space-y-3">{Array.from({ length: n }).map((_, i) => <Skel key={i} h="h-6" />)}</div>;
}

const TABS = ['News', 'Economic Calendar', 'Earnings', 'News Intelligence', 'Calendar Intelligence'] as const;

export default function ResearchPage() {
  const { tier } = useUserTier();
  const { navigateTo, selectSymbol } = useV2();
  const [tab, setTab] = useState<typeof TABS[number]>('News');
  const [calFilter, setCalFilter] = useState<string>('all');

  const news = useNews();
  const calendar = useEconomicCalendar();
  const earnings = useEarningsCalendar();

  const articles = news.data?.articles || [];
  const events = useMemo(() => {
    const all = calendar.data?.events || [];
    if (calFilter === 'all') return all;
    return all.filter(e => e.impact === calFilter);
  }, [calendar.data, calFilter]);

  const thisWeek = earnings.data?.thisWeek || [];
  const nextWeek = earnings.data?.nextWeek || [];
  const majorEarnings = earnings.data?.majorEarnings || [];

  return (
    <div className="space-y-6">
      <SectionHeader title="Research" subtitle="News, events & catalysts — live data" />

      {/* Tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap transition-colors ${tab === t ? 'bg-[rgba(16,185,129,0.1)] text-[var(--msp-accent)] border border-[rgba(16,185,129,0.4)]' : 'text-[var(--msp-text-muted)] hover:bg-slate-800/60 border border-transparent'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <UpgradeGate requiredTier="pro" currentTier={tier} feature="Market Research">

      {/* -- NEWS ----------------------------------------------------- */}
      {tab === 'News' && (
        <Card>
          {news.loading ? <SkeletonRows n={8} /> : articles.length === 0 ? (
            <div className="text-xs text-slate-500 py-8 text-center">No news available</div>
          ) : (
            <div className="space-y-3">
              {articles.map((n: NewsArticle, i: number) => (
                <div key={i} className="py-2 border-b border-slate-800/30 last:border-0">
                  <div className="flex items-start gap-2">
                    <ImpactDot impact={n.sentiment.score > 0.2 ? 'high' : n.sentiment.score > 0 ? 'medium' : 'low'} />
                    <div className="flex-1 min-w-0">
                      <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-sm text-white hover:text-emerald-400 transition-colors leading-snug">
                        {n.title}
                      </a>
                      <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">{n.summary}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-slate-600">{n.source}</span>
                        <span className={`text-[10px] ${n.sentiment.score > 0 ? 'text-emerald-400' : n.sentiment.score < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                          {n.sentiment.label}
                        </span>
                        {n.tickerSentiments?.slice(0, 4).map(ts => (
                          <span key={ts.ticker} className="text-[10px] text-emerald-400 cursor-pointer hover:underline" onClick={() => { selectSymbol(ts.ticker); navigateTo('golden-egg', ts.ticker); }}>
                            {ts.ticker}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {news.error && <div className="text-[10px] text-red-400/60 mt-2">Error: {news.error}</div>}
        </Card>
      )}

      {/* -- ECONOMIC CALENDAR ---------------------------------------- */}
      {tab === 'Economic Calendar' && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            {['all', 'high', 'medium', 'low'].map(f => (
              <button key={f} onClick={() => setCalFilter(f)} className={`px-2 py-1 text-[10px] rounded ${calFilter === f ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} Impact
                {f === 'all' ? ` (${(calendar.data?.events || []).length})` : ` (${(calendar.data?.events || []).filter(e => e.impact === f).length})`}
              </button>
            ))}
          </div>

          {calendar.loading ? <SkeletonRows n={8} /> : events.length === 0 ? (
            <div className="text-xs text-slate-500 py-8 text-center">No events found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--msp-border)]">
                    <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Date</th>
                    <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Time</th>
                    <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Impact</th>
                    <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Event</th>
                    <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Forecast</th>
                    <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Previous</th>
                    <th className="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e: EconomicEvent, i: number) => (
                    <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                      <td className="py-2 px-2 text-slate-300">{e.date}</td>
                      <td className="py-2 px-2 text-slate-400">{e.time || '—'}</td>
                      <td className="py-2 px-2"><ImpactDot impact={e.impact as 'high' | 'medium' | 'low'} />{e.impact}</td>
                      <td className="py-2 px-2 text-white font-medium">{e.event}</td>
                      <td className="py-2 px-2 text-slate-400">{e.forecast || '—'}</td>
                      <td className="py-2 px-2 text-slate-400">{e.previous || '—'}</td>
                      <td className="py-2 px-2 text-white font-semibold">{e.actual || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {calendar.data?.nextMajorEvent && (
            <div className="mt-3 pt-2 border-t border-slate-800/40 text-xs text-slate-500">
              Next major event: <span className="text-white">{calendar.data.nextMajorEvent.event}</span> in {calendar.data.daysUntilMajor} day(s)
            </div>
          )}
          {calendar.error && <div className="text-[10px] text-red-400/60 mt-2">Error: {calendar.error}</div>}
        </Card>
      )}

      {/* -- EARNINGS ------------------------------------------------- */}
      {tab === 'Earnings' && (
        <Card>
          {earnings.loading ? <SkeletonRows n={8} /> : (
            <div className="space-y-4">
              {[
                { label: 'This Week', items: thisWeek },
                { label: 'Next Week', items: nextWeek },
                { label: 'Major Earnings', items: majorEarnings },
              ].map(group => (
                <div key={group.label}>
                  <div className="text-[10px] text-slate-500 uppercase mb-2">{group.label} ({group.items.length})</div>
                  {group.items.length === 0 ? (
                    <div className="text-[10px] text-slate-600 py-2">None</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[var(--msp-border)]">
                            <th className="text-left py-1.5 px-2 text-[10px] uppercase text-slate-500">Symbol</th>
                            <th className="text-left py-1.5 px-2 text-[10px] uppercase text-slate-500">Company</th>
                            <th className="text-left py-1.5 px-2 text-[10px] uppercase text-slate-500">Report Date</th>
                            <th className="text-left py-1.5 px-2 text-[10px] uppercase text-slate-500">Estimate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((e: EarningsEntry, i: number) => (
                            <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20 cursor-pointer" onClick={() => { selectSymbol(e.symbol); navigateTo('golden-egg', e.symbol); }}>
                              <td className="py-1.5 px-2 text-emerald-400 font-semibold">{e.symbol}</td>
                              <td className="py-1.5 px-2 text-white">{e.name}</td>
                              <td className="py-1.5 px-2 text-slate-400">{e.reportDate}</td>
                              <td className="py-1.5 px-2 text-slate-300">{e.estimate != null ? `$${e.estimate.toFixed(2)}` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {earnings.error && <div className="text-[10px] text-red-400/60 mt-2">Error: {earnings.error}</div>}
        </Card>
      )}

      {/* ─── Deep-dive Tabs (v1 rich components) ─── */}
      {tab === 'News Intelligence' && (
        <NewsIntelligence />
      )}
      {tab === 'Calendar Intelligence' && (
        <EconCalendarV1 />
      )}

      </UpgradeGate>
    </div>
  );
}
