'use client';

import { savedCaseLabel } from '@/lib/savedCasePresentation';
import EarningsView from '@/components/research/EarningsView';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import TabBar from '@/components/visual/TabBar';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import { marketText } from '@/lib/marketsPresentation';
import { formatMarketTime } from '@/lib/market/priceStamp';
import PaidPreviewGate from '@/components/free/PaidPreviewGate';

/* ---------------------------------------------------------------------------
   SURFACE 6: RESEARCH — Information Layer
   Real API data: /api/news-sentiment + /api/economic-calendar + /api/earnings
   --------------------------------------------------------------------------- */

import { useState, useMemo, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useV2 } from '@/app/v2/_lib/V2Context';
import { useNews, useEconomicCalendar, useEarningsCalendar, type NewsArticle, type EconomicEvent } from '@/app/v2/_lib/api';
import { Card, ImpactDot, UpgradeGate } from '@/app/v2/_components/ui';
import LockedPreview from '@/components/free/LockedPreview';
import FreeLoading from '@/components/free/Loading';
import { useUserTier } from '@/lib/useUserTier';
import { deleteSavedResearchCase, listSavedResearchCases, updateSavedResearchCaseOutcome, type SavedResearchCaseOutcome, type SavedResearchCaseSummary } from '@/lib/clientResearchCases';
import { quickAddToWatchlist } from '@/lib/clientWatchlistQuickAdd';
import { upcomingConfirmedEvents } from '@/lib/calendarPresentation';
import { formatEventTime } from '@/lib/eventTimeDisplay';

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
type ResearchTab = typeof TABS[number];

const RESEARCH_TAB_META: Record<ResearchTab, { eyebrow: string }> = {
  News: { eyebrow: '1. Catalyst feed' },
  'Economic Calendar': { eyebrow: '2. Macro calendar' },
  Earnings: { eyebrow: '3. Earnings risk' },
  'Saved Cases': { eyebrow: '4. Saved research' },
  'News Intelligence': { eyebrow: '5. News intelligence' },
  'Calendar Intelligence': { eyebrow: '6. Calendar intelligence' },
};

function ResearchMetric({ label, value, tone = 'var(--msp-text)', detail }: { label: string; value: string; tone?: string; detail: string }) {
  return (
    <div className="min-h-[3.05rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
      <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-black" style={{ color: tone }} title={value}>{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-slate-500" title={detail}>{detail}</div>
    </div>
  );
}

const TAB_PARAM_MAP: Record<string, ResearchTab> = {
  news: 'News',
  calendar: 'Economic Calendar',
  economic: 'Economic Calendar',
  earnings: 'Earnings',
  saved: 'Saved Cases',
  cases: 'Saved Cases',
  intelligence: 'News Intelligence',
};

function readCaseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstString(values: unknown): string | null {
  return Array.isArray(values) ? values.find((item): item is string => typeof item === 'string' && item.trim().length > 0) ?? null : null;
}

function formatSavedDate(value: string | null | undefined): string {
  if (!value) return 'Date not supplied';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date not supplied';
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

function savedCaseMissingCount(item: SavedResearchCaseSummary): number | null {
  const truthLayer = item.researchCase?.truthLayer as Record<string, unknown> | undefined;
  return Array.isArray(truthLayer?.whatWeDoNotKnow) ? truthLayer.whatWeDoNotKnow.length : null;
}

const OUTCOME_ACTIONS: Array<{ label: string; status: SavedResearchCaseOutcome }> = [
  { label: 'Confirm', status: 'confirmed' },
  { label: 'Invalidate', status: 'invalidated' },
  { label: 'Expire', status: 'expired' },
  { label: 'Review', status: 'reviewed' },
];

export default function ResearchPage() { return <PaidPreviewGate tool="Research"><ResearchPagePaid /></PaidPreviewGate>; }

function ResearchPagePaid() {
  const { tier, isLoading: tierLoading } = useUserTier();
  const { navigateTo, selectSymbol } = useV2();
  const searchParams = useSearchParams();
  const initialTab = TAB_PARAM_MAP[(searchParams.get('tab') || '').toLowerCase()] || 'News';
  const [tab, setTab] = useState<ResearchTab>(initialTab);
  const [calFilter, setCalFilter] = useState<string>('high');
  const [showNews, setShowNews] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [viewerZone, setViewerZone] = useState('UTC');
  useEffect(() => { setViewerZone(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);
  const [showAllSavedCases, setShowAllSavedCases] = useState(false);
  const [savedCases, setSavedCases] = useState<SavedResearchCaseSummary[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [deletingCaseId, setDeletingCaseId] = useState<string | null>(null);
  const [updatingOutcomeId, setUpdatingOutcomeId] = useState<string | null>(null);

  const candidateSymbol = (searchParams.get('symbol') || '').toUpperCase().replace(/^CRYPTO:/, '').replace(/[-/]?USDT?$/, '');
  const candidateType = searchParams.get('type') === 'crypto' ? 'crypto' : 'equity';
  const candidateTimeframe = searchParams.get('timeframe') || 'daily';
  const candidateHref = `/tools/golden-egg?symbol=${encodeURIComponent(candidateSymbol)}&type=${candidateType}&timeframe=${encodeURIComponent(candidateTimeframe)}`;
  const news = useNews(candidateSymbol || undefined);
  const calendar = useEconomicCalendar();
  const earnings = useEarningsCalendar();

  useEffect(() => {
    const requestedTab = TAB_PARAM_MAP[(searchParams.get('tab') || '').toLowerCase()];
    if (requestedTab) setTab(requestedTab);
    // Only re-sync when the URL tab param changes; including `tab` here would force
    // user clicks back to the URL value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const articles = (news.data?.articles || []).filter(article => !candidateSymbol || (article.relevantTickers ?? []).includes(candidateSymbol));
  const events = useMemo(() => {
    const all = calendar.data?.events || [];
    if (calFilter === 'all') return all;
    return all.filter(e => e.impact === calFilter);
  }, [calendar.data, calFilter]);

  const upcomingEvents = upcomingConfirmedEvents(events);
  const visibleEvents = showCalendar ? events : upcomingEvents.slice(0, 5);
  const publicationTime = (raw?: string) => raw?.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3T$4:$5:$6Z');
  const displayValue = (value: unknown) => {
    if (value == null || value === '--' || value === '—') return 'Not collected';
    if (typeof value === 'number') return marketText(value);
    const text = marketText(value);
    return text.replace(/-?\d+\.\d{3,}%?/g, n => `${Number.parseFloat(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}${n.endsWith('%') ? '%' : ''}`);
  };

  const thisWeek = earnings.data?.thisWeek || [];
  const nextWeek = earnings.data?.nextWeek || [];
  const majorEarnings = earnings.data?.majorEarnings || [];

  const openGoldenEgg = useCallback((symbol: string) => {
    const clean = symbol.replace(/^CRYPTO:/, '');
    const type = symbol.startsWith('CRYPTO:') || clean === candidateSymbol && candidateType === 'crypto' ? 'crypto' : 'equity';
    selectSymbol(clean, { assetType: type });
    navigateTo('golden-egg', clean);
  }, [navigateTo, selectSymbol, candidateSymbol, candidateType]);

  // Research → Workspace: one-click add of an earnings symbol to the watchlist.
  const [watchlistStatus, setWatchlistStatus] = useState<Record<string, 'adding' | 'added' | 'exists' | 'signin' | 'error'>>({});
  const handleAddToWatchlist = useCallback(async (symbol: string) => {
    setWatchlistStatus(prev => ({ ...prev, [symbol]: 'adding' }));
    const result = await quickAddToWatchlist(symbol, { assetType: 'equity', note: 'Saved from Earnings research' });
    setWatchlistStatus(prev => ({
      ...prev,
      [symbol]: result.ok
        ? (result.alreadyPresent ? 'exists' : 'added')
        : (result.status === 401 ? 'signin' : 'error'),
    }));
  }, []);

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

  if (tierLoading) return <FreeLoading />;

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Research</h1>
      <TabBar label="Research views" activeId={tab} items={TABS.map(t => ({id:t,label:t}))} onChange={id => setTab(id as ResearchTab)} />
      {(tab === 'News' || tab === 'Economic Calendar') && <p data-research-verdict className="text-lg font-semibold">{tab === 'News' ? news.loading ? 'Loading published news…' : news.error ? 'News could not be loaded' : `${articles.length} published articles collected` : calendar.loading ? 'Loading calendar…' : calendar.error ? 'Calendar could not be loaded' : `${upcomingEvents.length} upcoming ${calFilter === 'all' ? '' : calFilter + '-impact '}events with confirmed times`}</p>}

      {(tier === 'free' || tier === 'anonymous') && (
        <LockedPreview tool="Market Research Intelligence" />
      )}
      {(tier !== 'free' && tier !== 'anonymous') && <div>

      {/* -- NEWS ----------------------------------------------------- */}
      {tab === 'News' && (
        <Card>
          <p className="mb-3 text-sm font-semibold text-emerald-300">{candidateSymbol ? `${candidateSymbol} · symbol-relevant news` : 'Market news'} · source publication times shown below</p>
          {news.loading ? <SkeletonRows n={8} /> : news.error ? <p className="py-4 text-xs text-amber-300">News could not be loaded.</p> : articles.length === 0 ? (
            <div className="text-xs text-slate-500 py-8 text-center">No news available</div>
          ) : (
            <div className="space-y-3">
              {(showNews ? articles : articles.slice(0, 5)).map((n: NewsArticle, i: number) => (
                <div key={i} className="py-2 border-b border-slate-800/30 last:border-0">
                  <div className="flex items-start gap-2">

                    <div className="flex-1 min-w-0">
                      <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-sm text-white hover:text-emerald-400 transition-colors leading-snug">
                        {n.title}
                      </a>
                      <CollapsibleSection title="Article context" summary={marketText(n.sentiment.label)}><p className="text-xs text-slate-400">{n.summary}</p></CollapsibleSection>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span data-news-source className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-slate-400">{marketText(n.source)} · {formatMarketTime(publicationTime(n.timePublished), viewerZone) || 'Publication time not supplied'}</span>
                        <span className={`text-[10px] ${n.sentiment.score > 0 ? 'text-emerald-400' : n.sentiment.score < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                          {marketText(n.sentiment.label)}
                        </span>
                        {n.tickerSentiments?.slice(0, 4).map(ts => (
                          <button key={ts.ticker} type="button" className="text-[10px] text-emerald-400 cursor-pointer hover:underline focus:outline-none focus:ring-1 focus:ring-emerald-400/60" onClick={() => openGoldenEgg(ts.ticker)} aria-label={`Open ${ts.ticker} in Symbol`}>
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
          {articles.length > 5 && <button type="button" className="min-h-10 underline" onClick={() => setShowNews(!showNews)}>{showNews ? 'Show fewer' : `More · ${articles.length} articles`}</button>}
          <SourceLine source="Alpha Vantage news · publications attributed above" asOf={publicationTime(articles[0]?.timePublished)} basis="Latest listed publication · independent article times" />
        </Card>
      )}

      {/* -- ECONOMIC CALENDAR ---------------------------------------- */}
      {tab === 'Economic Calendar' && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {['all', 'high', 'medium', 'low'].map(f => (
              <button key={f} type="button" aria-pressed={calFilter === f} onClick={() => { setCalFilter(f); setShowCalendar(false); }} className={`min-h-10 px-2 py-1 text-[10px] rounded ${calFilter === f ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} Impact
                {f === 'all' ? ` (${(calendar.data?.events || []).length})` : ` (${(calendar.data?.events || []).filter(e => e.impact === f).length})`}
              </button>
            ))}
          </div>

          {calendar.loading ? <SkeletonRows n={5} /> : calendar.error ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">Calendar could not be loaded.</p> : visibleEvents.length === 0 ? <p className="py-4 text-sm text-slate-400">No upcoming confirmed events in this filter. Show all to inspect undated or earlier entries.</p> : <ul className="divide-y divide-white/10">
            {visibleEvents.map((e: EconomicEvent, i: number) => {
              const shown = formatEventTime(e);
              return <li data-calendar-event key={`${e.event}-${i}`} className="py-3">
                <div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold">{marketText(e.event)}</p><span className="text-xs text-amber-200">{marketText(e.impact)} impact</span></div>
                <p className="text-xs text-slate-400" title={shown.title.replace(/T(?=\d{2}:)/g, ' ').replace(/Z(?= UTC)/g, '')}>Time (your zone): {shown.date} · {shown.time || 'Time not supplied'}</p>
                <CollapsibleSection title="Release values" summary={displayValue(e.display?.actual || e.actual)}><dl className="grid grid-cols-3 gap-2 text-xs">{[['Forecast',e.display?.consensus || e.forecast],['Previous',e.display?.previous || e.previous],['Actual',e.display?.actual || e.actual]].map(([label,value]) => <div key={String(label)}><dt className="text-slate-500">{label}</dt><dd>{displayValue(value)}</dd></div>)}</dl></CollapsibleSection>
              </li>;
            })}
          </ul>}
          {events.length > 0 && <button type="button" className="min-h-10 underline" onClick={() => setShowCalendar(!showCalendar)}>{showCalendar ? 'Next five' : `Show all ${events.length}`}</button>}
          <SourceLine source="Economic calendar" tradingDay={calendar.data?.dateRange ? `${calendar.data.dateRange.from} to ${calendar.data.dateRange.to}` : undefined} basis="Scheduled releases · observation timestamp not supplied" />

        </Card>
      )}

      {/* -- EARNINGS ------------------------------------------------- */}
      {tab === 'Earnings' && (
        <Card><EarningsView thisWeek={thisWeek} nextWeek={nextWeek} majorEarnings={majorEarnings}
          loading={earnings.loading} error={earnings.error} watchlistStatus={watchlistStatus}
          onOpenSymbol={openGoldenEgg} onAddToWatchlist={handleAddToWatchlist} /></Card>
      )}

      {/* -- SAVED CASES --------------------------------------------- */}
      {tab === 'Saved Cases' && (
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p data-research-verdict role="status" className="text-lg font-semibold">{savedLoading ? 'Loading saved research…' : savedError ? 'The last request did not complete.' : savedCases.length ? `${savedCases.length} saved research cases loaded` : 'No saved research cases yet.'}</p>
              <div className="text-[10px] text-slate-500">Educational scenario records saved from Scanner and Symbol.</div>
            </div>
            <button
              type="button"
              onClick={refreshSavedCases}
              disabled={savedLoading}
              className="min-h-10 rounded border border-slate-700 bg-slate-950/60 px-2.5 py-1 text-[10px] font-semibold text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 disabled:cursor-wait disabled:opacity-60"
            >
              {savedLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {savedError && <div className="mb-3 rounded border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-300">The request could not be completed. {savedCases.length > 0 ? 'Previously loaded cases remain below.' : 'Use Refresh to try again.'}</div>}

          {savedLoading && savedCases.length === 0 ? <SkeletonRows n={6} /> : savedCases.length === 0 && !savedError ? (
            <div className="py-8 text-center text-xs text-slate-500">No saved research cases yet. Save a case from Scanner or Symbol to build a research archive.</div>
          ) : (
            <div className="space-y-2">
              {(showAllSavedCases ? savedCases : savedCases.slice(0, 5)).map((item) => (
                <div key={item.id} data-saved-case className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => openGoldenEgg(item.symbol)}
                        aria-label={`Open ${item.symbol} saved research case in Symbol`}
                        className="min-h-10 line-clamp-2 break-words text-left text-sm font-bold text-white hover:text-emerald-400"
                      >
                        {marketText(item.title || `${item.symbol} Research Case`)}
                      </button>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                        <span className="font-semibold text-emerald-400">{item.symbol}</span>
                        <span>{marketText(item.assetClass)}</span>
                        <span>Saved {formatSavedDate(item.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <CollapsibleSection title="Case details and actions" summary={savedCaseLabel(item.outcomeStatus)}>
                    <p className="mb-2 text-xs text-slate-400">Data: {savedCaseLabel(item.dataQuality)} · Stage: {savedCaseLabel(item.lifecycleState)}</p>
                    <p className="mb-2 text-xs text-slate-400">Saved from {marketText(item.sourceType).replaceAll('-', ' ')} · snapshot generated {formatSavedDate(item.generatedAt)} · record saved {formatSavedDate(item.createdAt)}</p>
                  <p className="mb-3 line-clamp-3 text-xs leading-relaxed text-slate-400">{marketText(savedCaseSummary(item))}</p>
                  {item.outcomeStatus === 'pending' && item.outcomeSuggestion && item.outcomeSuggestion.status !== 'pending' && (
                    <div className="mb-2 rounded border border-blue-500/25 bg-blue-500/10 px-2.5 py-2 text-[10px] text-blue-200">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-semibold uppercase tracking-[0.05em]">Suggested: {savedCaseLabel(item.outcomeSuggestion.status)}</span>
                        <button
                          type="button"
                          onClick={() => handleApplySuggestion(item)}
                          disabled={updatingOutcomeId === item.id}
                          className="min-h-10 rounded border border-blue-400/40 bg-blue-400/10 px-2 py-0.5 font-semibold text-blue-100 hover:bg-blue-400/20 disabled:cursor-wait disabled:opacity-60"
                        >
                          {updatingOutcomeId === item.id ? 'Applying...' : 'Apply'}
                        </button>
                      </div>
                      <div className="text-blue-200/80">{marketText(item.outcomeSuggestion.reason)}</div>
                    </div>
                  )}
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {OUTCOME_ACTIONS.map((action) => (
                      <button
                        key={action.status}
                        type="button"
                        onClick={() => handleOutcomeUpdate(item.id, action.status)}
                        disabled={updatingOutcomeId === item.id || item.outcomeStatus === action.status}
                        className="min-h-10 rounded border border-slate-700/70 bg-slate-900/60 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {updatingOutcomeId === item.id ? 'Saving...' : action.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-slate-800/60 pt-2">
                    <div className="text-[10px] text-slate-500">
                      Recorded evidence gaps: <span className="text-slate-300">{savedCaseMissingCount(item) ?? 'Not supplied'}</span>
                      {item.lifecycleUpdatedAt && <span className="ml-2">Stage updated: <span className="text-slate-300">{formatSavedDate(item.lifecycleUpdatedAt)}</span></span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteSavedCase(item.id)}
                      disabled={deletingCaseId === item.id}
                      className="min-h-10 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-300 hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-60"
                    >
                      {deletingCaseId === item.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                  </CollapsibleSection>
                </div>
              ))}
            </div>
          )}
          {savedCases.length > 5 && <button type="button" className="mt-3 min-h-10 rounded-lg border border-slate-700 px-3 text-sm" onClick={() => setShowAllSavedCases(!showAllSavedCases)}>{showAllSavedCases ? 'Show five' : `Show all ${savedCases.length}`}</button>}
          {!savedLoading && (savedCases.length > 0 || !savedError) && <SourceLine source="Saved research cases" basis="Stored snapshots · up to 50 records loaded · individual saved/generated dates in case details; not current market observations" />}
        </Card>
      )}

      {/* ─── Deep-dive Tabs (v1 rich components) ─── */}
      {tab === 'News Intelligence' && (
        <NewsIntelligence embeddedInResearch />
      )}
      {tab === 'Calendar Intelligence' && (
        <EconCalendarV1 embeddedInResearch />
      )}

      </div>}
      <ComplianceDisclaimer compact />
    </div>
  );
}
