'use client';

/* ---------------------------------------------------------------------------
   SURFACE 6: RESEARCH — Information Layer
   Real API data: /api/news-sentiment + /api/economic-calendar + /api/earnings
   --------------------------------------------------------------------------- */

import { useState, useMemo, useEffect, useCallback, type KeyboardEvent } from 'react';
import dynamic from 'next/dynamic';
import { useV2 } from '@/app/v2/_lib/V2Context';
import { useNews, useEconomicCalendar, useEarningsCalendar, type NewsArticle, type EconomicEvent, type EarningsEntry } from '@/app/v2/_lib/api';
import { Card, SectionHeader, Badge, ImpactDot, UpgradeGate } from '@/app/v2/_components/ui';
import { useUserTier } from '@/lib/useUserTier';
import { deleteSavedResearchCase, listSavedResearchCases, updateSavedResearchCaseOutcome, type SavedResearchCaseOutcome, type SavedResearchCaseSummary } from '@/lib/clientResearchCases';

/* ─── Dynamic imports: v1 rich components ─── */
const NewsIntelligence = dynamic(() => import('@/app/tools/news/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading News Intelligence…</div> });
const EconCalendarV1 = dynamic(() => import('@/app/tools/economic-calendar/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Economic Calendar Intelligence…</div> });

function Skel({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}
function SkeletonRows({ n = 6 }: { n?: number }) {
  return <div className="space-y-3">{Array.from({ length: n }).map((_, i) => <Skel key={i} h="h-6" />)}</div>;
}

const TABS = ['News', 'Economic Calendar', 'Earnings', 'Saved Cases', 'News Intelligence', 'Calendar Intelligence'] as const;

function readCaseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstString(values: unknown): string | null {
  return Array.isArray(values) ? values.find((item): item is string => typeof item === 'string' && item.trim().length > 0) ?? null : null;
}

function formatSavedDate(value: string | null | undefined): string {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
}

function savedCaseSummary(item: SavedResearchCaseSummary): string {
  const researchCase = item.researchCase || {};
  const truthLayer = researchCase.truthLayer as Record<string, unknown> | undefined;
  return firstString(truthLayer?.whatWeKnow)
    || readCaseString(researchCase.thesis)
    || readCaseString(researchCase.summary)
    || 'Saved educational research case.';
}

function savedCaseMissingCount(item: SavedResearchCaseSummary): number {
  const truthLayer = item.researchCase?.truthLayer as Record<string, unknown> | undefined;
  return Array.isArray(truthLayer?.whatWeDoNotKnow) ? truthLayer.whatWeDoNotKnow.length : 0;
}

function lifecycleColor(state: string | null | undefined): string {
  if (state === 'ARMED' || state === 'MANAGE') return '#10B981';
  if (state === 'STALK' || state === 'WATCH') return '#F59E0B';
  if (state === 'BLOCKED' || state === 'COOLDOWN') return '#EF4444';
  return '#64748B';
}

function outcomeColor(status: string | null | undefined): string {
  if (status === 'confirmed') return '#10B981';
  if (status === 'invalidated') return '#EF4444';
  if (status === 'expired') return '#94A3B8';
  if (status === 'reviewed') return '#3B82F6';
  return '#F59E0B';
}

const OUTCOME_ACTIONS: Array<{ label: string; status: SavedResearchCaseOutcome }> = [
  { label: 'Confirm', status: 'confirmed' },
  { label: 'Invalidate', status: 'invalidated' },
  { label: 'Expire', status: 'expired' },
  { label: 'Review', status: 'reviewed' },
];

export default function ResearchPage() {
  const { tier } = useUserTier();
  const { navigateTo, selectSymbol } = useV2();
  const [tab, setTab] = useState<typeof TABS[number]>('News');
  const [calFilter, setCalFilter] = useState<string>('all');
  const [savedCases, setSavedCases] = useState<SavedResearchCaseSummary[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [deletingCaseId, setDeletingCaseId] = useState<string | null>(null);
  const [updatingOutcomeId, setUpdatingOutcomeId] = useState<string | null>(null);

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

  const openGoldenEgg = useCallback((symbol: string) => {
    selectSymbol(symbol);
    navigateTo('golden-egg', symbol);
  }, [navigateTo, selectSymbol]);

  const onSymbolRowKey = useCallback((event: KeyboardEvent, symbol: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openGoldenEgg(symbol);
    }
  }, [openGoldenEgg]);

  const refreshSavedCases = useCallback(async () => {
    setSavedLoading(true);
    setSavedError(null);
    try {
      setSavedCases(await listSavedResearchCases({ limit: 50 }));
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : 'Unable to load saved research cases');
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'Saved Cases' && tier !== 'free' && tier !== 'anonymous') {
      refreshSavedCases();
    }
  }, [tab, tier, refreshSavedCases]);

  const handleDeleteSavedCase = useCallback(async (id: string) => {
    setDeletingCaseId(id);
    setSavedError(null);
    try {
      await deleteSavedResearchCase(id);
      setSavedCases((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : 'Unable to delete saved research case');
    } finally {
      setDeletingCaseId(null);
    }
  }, []);

  const handleOutcomeUpdate = useCallback(async (id: string, outcomeStatus: SavedResearchCaseOutcome) => {
    setUpdatingOutcomeId(id);
    setSavedError(null);
    try {
      const updated = await updateSavedResearchCaseOutcome({
        id,
        outcomeStatus,
        outcomeNote: `Marked ${outcomeStatus} from Research archive`,
        outcomeMetadata: { source: 'tools-research-archive' },
      });
      setSavedCases((current) => current.map((item) => item.id === id ? updated : item));
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : 'Unable to update saved research case outcome');
    } finally {
      setUpdatingOutcomeId(null);
    }
  }, []);

  const handleApplySuggestion = useCallback(async (item: SavedResearchCaseSummary) => {
    const suggestion = item.outcomeSuggestion;
    if (!suggestion || suggestion.status === 'pending') return;
    setUpdatingOutcomeId(item.id);
    setSavedError(null);
    try {
      const updated = await updateSavedResearchCaseOutcome({
        id: item.id,
        outcomeStatus: suggestion.status,
        outcomeNote: suggestion.reason,
        outcomeMetadata: {
          source: 'auto-outcome-suggestion',
          confidence: suggestion.confidence,
          currentLifecycleState: item.currentLifecycleState,
          currentLifecycleUpdatedAt: item.currentLifecycleUpdatedAt,
        },
      });
      setSavedCases((current) => current.map((candidate) => candidate.id === item.id ? updated : candidate));
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : 'Unable to apply outcome suggestion');
    } finally {
      setUpdatingOutcomeId(null);
    }
  }, []);

  return (
    <div className="space-y-6">
      <SectionHeader title="Research" subtitle="News, events & catalysts — live data" />

      {/* Tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {TABS.map(t => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap transition-colors ${tab === t ? 'bg-[rgba(16,185,129,0.1)] text-[var(--msp-accent)] border border-[rgba(16,185,129,0.4)]' : 'text-[var(--msp-text-muted)] hover:bg-slate-800/60 border border-transparent'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {(tier === 'free' || tier === 'anonymous') && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Market Research Intelligence">
          <div />
        </UpgradeGate>
      )}
      {(tier !== 'free' && tier !== 'anonymous') && <div>

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
                          <button key={ts.ticker} type="button" className="text-[10px] text-emerald-400 cursor-pointer hover:underline focus:outline-none focus:ring-1 focus:ring-emerald-400/60" onClick={() => openGoldenEgg(ts.ticker)} aria-label={`Open ${ts.ticker} in Golden Egg`}>
                            {ts.ticker}
                          </button>
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
              <button key={f} type="button" aria-pressed={calFilter === f} onClick={() => setCalFilter(f)} className={`px-2 py-1 text-[10px] rounded ${calFilter === f ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
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
                            <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-400/60" onClick={() => openGoldenEgg(e.symbol)} onKeyDown={(event) => onSymbolRowKey(event, e.symbol)} role="button" tabIndex={0} aria-label={`Open ${e.symbol} earnings in Golden Egg`}>
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

      {/* -- SAVED CASES --------------------------------------------- */}
      {tab === 'Saved Cases' && (
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-white">Saved Research Cases</div>
              <div className="text-[10px] text-slate-500">Educational scenario records saved from Scanner and Golden Egg.</div>
            </div>
            <button
              type="button"
              onClick={refreshSavedCases}
              disabled={savedLoading}
              className="rounded border border-slate-700 bg-slate-950/60 px-2.5 py-1 text-[10px] font-semibold text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 disabled:cursor-wait disabled:opacity-60"
            >
              {savedLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {savedError && <div className="mb-3 rounded border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-300">{savedError}</div>}

          {savedLoading && savedCases.length === 0 ? <SkeletonRows n={6} /> : savedCases.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">No saved research cases yet. Save a case from Scanner or Golden Egg to build a research archive.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {savedCases.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => openGoldenEgg(item.symbol)}
                        aria-label={`Open ${item.symbol} saved research case in Golden Egg`}
                        className="truncate text-left text-sm font-bold text-white hover:text-emerald-400"
                      >
                        {item.title || `${item.symbol} Research Case`}
                      </button>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                        <span className="font-semibold text-emerald-400">{item.symbol}</span>
                        <span>{item.assetClass}</span>
                        <span>{item.sourceType.replace(/-/g, ' ')}</span>
                        <span>{formatSavedDate(item.generatedAt || item.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        label={item.dataQuality}
                        color={item.dataQuality === 'GOOD' || item.dataQuality === 'LIVE' ? '#10B981' : item.dataQuality === 'DEGRADED' || item.dataQuality === 'STALE' ? '#F59E0B' : '#EF4444'}
                        small
                      />
                      {item.lifecycleState && <Badge label={item.lifecycleState} color={lifecycleColor(item.lifecycleState)} small />}
                      <Badge label={item.outcomeStatus || 'pending'} color={outcomeColor(item.outcomeStatus)} small />
                    </div>
                  </div>
                  <p className="mb-3 line-clamp-3 text-xs leading-relaxed text-slate-400">{savedCaseSummary(item)}</p>
                  {item.outcomeStatus === 'pending' && item.outcomeSuggestion && item.outcomeSuggestion.status !== 'pending' && (
                    <div className="mb-2 rounded border border-blue-500/25 bg-blue-500/10 px-2.5 py-2 text-[10px] text-blue-200">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-semibold uppercase tracking-[0.05em]">Suggested: {item.outcomeSuggestion.status}</span>
                        <button
                          type="button"
                          onClick={() => handleApplySuggestion(item)}
                          disabled={updatingOutcomeId === item.id}
                          className="rounded border border-blue-400/40 bg-blue-400/10 px-2 py-0.5 font-semibold text-blue-100 hover:bg-blue-400/20 disabled:cursor-wait disabled:opacity-60"
                        >
                          {updatingOutcomeId === item.id ? 'Applying...' : 'Apply'}
                        </button>
                      </div>
                      <div className="text-blue-200/80">{item.outcomeSuggestion.reason}</div>
                    </div>
                  )}
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {OUTCOME_ACTIONS.map((action) => (
                      <button
                        key={action.status}
                        type="button"
                        onClick={() => handleOutcomeUpdate(item.id, action.status)}
                        disabled={updatingOutcomeId === item.id || item.outcomeStatus === action.status}
                        className="rounded border border-slate-700/70 bg-slate-900/60 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {updatingOutcomeId === item.id ? 'Saving...' : action.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-slate-800/60 pt-2">
                    <div className="text-[10px] text-slate-500">
                      Missing evidence: <span className="text-slate-300">{savedCaseMissingCount(item)}</span>
                      {item.lifecycleUpdatedAt && <span className="ml-2">Lifecycle: <span className="text-slate-300">{formatSavedDate(item.lifecycleUpdatedAt)}</span></span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteSavedCase(item.id)}
                      disabled={deletingCaseId === item.id}
                      className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-300 hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-60"
                    >
                      {deletingCaseId === item.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ─── Deep-dive Tabs (v1 rich components) ─── */}
      {tab === 'News Intelligence' && (
        <NewsIntelligence />
      )}
      {tab === 'Calendar Intelligence' && (
        <EconCalendarV1 />
      )}

      </div>}
    </div>
  );
}
