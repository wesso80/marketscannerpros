'use client';

/* ---------------------------------------------------------------------------
   SURFACE 1: DASHBOARD — Command Center
   Real API data from v1 endpoints.
   --------------------------------------------------------------------------- */

import { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useV2 } from '@/app/v2/_lib/V2Context';
import { useRegime, useMarketMovers, useNews, useEconomicCalendar, type Mover, type NewsArticle, type EconomicEvent } from '@/app/v2/_lib/api';
import { REGIME_COLORS, CROSS_MARKET } from '@/app/v2/_lib/constants';
import { Card, Badge, ImpactDot, AuthPrompt, UpgradeGate } from '@/app/v2/_components/ui';
import { useUserTier } from '@/lib/useUserTier';
import { useCachedTopSymbols, type CachedSymbol } from '@/hooks/useCachedTopSymbols';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';

/* ─── Dynamic imports: v1 deep-dive components ─── */
const CryptoDashboard = dynamic(() => import('@/app/tools/crypto-dashboard/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Crypto Derivatives…</div> });
const MacroDashboard = dynamic(() => import('@/app/tools/macro/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Macro Dashboard…</div> });
const EdgeInsightCards = dynamic(() => import('@/components/intelligence/EdgeInsightCards'), { ssr: false, loading: () => <div className="h-32 bg-slate-800/30 rounded-xl animate-pulse" /> });
const FavoritesPanel = dynamic(() => import('@/components/FavoritesPanel'), { ssr: false, loading: () => <div className="h-48 bg-slate-800/30 rounded-xl animate-pulse" /> });

const DASH_TABS = ['My Pages', 'Command Center', 'Crypto Derivatives', 'Macro'] as const;
type DashTab = typeof DASH_TABS[number];

const DASH_TAB_PARAM_MAP: Record<string, DashTab> = {
  pages: 'My Pages',
  saved: 'My Pages',
  command: 'Command Center',
  crypto: 'Crypto Derivatives',
  derivatives: 'Crypto Derivatives',
  macro: 'Macro',
};

/* -- helpers -------------------------------------------------------------- */
function directionColor(d?: string) {
  if (d === 'bullish') return '#10B981';
  if (d === 'bearish') return '#EF4444';
  return '#F59E0B';
}
function pctColor(v: number) {
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-red-400';
  return 'text-slate-400';
}
function fmtPrice(p: number) {
  const abs = Math.abs(p);
  const dec = abs >= 100 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return '$' + p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: dec });
}
function parseChangePct(raw: string) {
  return parseFloat((raw || '0').replace('%', ''));
}

/* -- Loading skeleton ----------------------------------------------------- */
function Skeleton({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}
function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card>
      <Skeleton h="h-4" w="w-32" />
      <div className="mt-3 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} h="h-6" />
        ))}
      </div>
    </Card>
  );
}

function DashboardMetric({ label, value, tone = '#CBD5E1', detail }: { label: string; value: string; tone?: string; detail: string }) {
  return (
    <div className="min-h-[3.1rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
      <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-black" style={{ color: tone }}>{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-slate-500" title={detail}>{detail}</div>
    </div>
  );
}

function PanelHeader({ title, eyebrow, action }: { title: string; eyebrow?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-start justify-between gap-3">
      <div>
        {eyebrow ? <div className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-slate-500">{eyebrow}</div> : null}
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function MoverRow({ mover, tone, onOpen, onKeyOpen }: { mover: Mover; tone: 'up' | 'down'; onOpen: () => void; onKeyOpen: (event: React.KeyboardEvent) => void }) {
  return (
    <div role="button" tabIndex={0} aria-label={`Open Golden Egg for ${mover.ticker}`} className="grid grid-cols-[4.5rem_1fr_5.5rem] items-center rounded-md px-2 py-1 text-xs hover:bg-slate-800/40 focus:bg-slate-800/40 focus:outline-none" onClick={onOpen} onKeyDown={onKeyOpen}>
      <span className="font-semibold text-white">{mover.ticker}</span>
      <span className="text-right font-mono tabular-nums text-slate-300">{fmtPrice(parseFloat(mover.price))}</span>
      <span className={`${tone === 'up' ? 'text-emerald-400' : 'text-red-400'} text-right font-mono tabular-nums`}>{tone === 'up' ? '+' : ''}{mover.change_percentage}</span>
    </div>
  );
}

export default function DashboardPage() {
  const { navigateTo, selectSymbol } = useV2();
  const searchParams = useSearchParams();
  const requestedInitialTab = DASH_TAB_PARAM_MAP[(searchParams.get('tab') || '').toLowerCase()] || 'Command Center';
  const [dashTab, setDashTab] = useState<DashTab>(requestedInitialTab);
  const { tier } = useUserTier();
  const isPro = tier === 'pro' || tier === 'pro_trader';

  useEffect(() => {
    const requestedTab = DASH_TAB_PARAM_MAP[(searchParams.get('tab') || '').toLowerCase()];
    if (requestedTab && requestedTab !== dashTab) setDashTab(requestedTab);
  }, [searchParams, dashTab]);

  /* -- Real API calls --------------------------------------------------- */
  const regime = useRegime();
  const movers = useMarketMovers();
  const news = useNews();
  const calendar = useEconomicCalendar();
  const cached = useCachedTopSymbols(5);

  /* -- Derived data ----------------------------------------------------- */
  const highImpactEvents = useMemo(
    () => (calendar.data?.events || []).filter((e: EconomicEvent) => e.impact === 'high').slice(0, 5),
    [calendar.data]
  );
  const allGainers = movers.data?.topGainers || [];
  const allLosers = movers.data?.topLosers || [];
  const eqGainers = allGainers.filter((m: Mover) => m.asset_class === 'equity').slice(0, 5);
  const eqLosers = allLosers.filter((m: Mover) => m.asset_class === 'equity').slice(0, 5);
  const crGainers = allGainers.filter((m: Mover) => m.asset_class === 'crypto').slice(0, 5);
  const crLosers = allLosers.filter((m: Mover) => m.asset_class === 'crypto').slice(0, 5);
  const articles = (news.data?.articles || []).slice(0, 6);
  const scannerQueue = [...cached.equity.slice(0, 3), ...cached.crypto.slice(0, 2)];
  const moverQueue = [...eqGainers.slice(0, 2), ...crGainers.slice(0, 2)];
  const degradedFeeds = [
    cached.error ? 'Scanner cache' : null,
    movers.error ? 'Movers' : null,
    news.error ? 'News' : null,
    calendar.error ? 'Calendar' : null,
  ].filter(Boolean);
  const loadingFeeds = [cached.loading, movers.loading, news.loading, calendar.loading].filter(Boolean).length;
  const researchQueueCount = scannerQueue.length + moverQueue.length;
  const highImpactEventCount = highImpactEvents.length;
  const headlineCount = articles.length;
  const dataHealthLabel = degradedFeeds.length ? `${degradedFeeds.length} issue${degradedFeeds.length === 1 ? '' : 's'}` : loadingFeeds ? `${loadingFeeds} loading` : 'Ready';
  const dataHealthTone = degradedFeeds.length ? '#F59E0B' : loadingFeeds ? '#38BDF8' : '#10B981';
  const topQueueSymbol = scannerQueue[0]?.symbol || moverQueue[0]?.ticker || 'None';

  // Show sign-in prompt if all data hooks report auth errors
  const allAuthError = movers.isAuthError && news.isAuthError;
  if (allAuthError) {
    return <Card><AuthPrompt /></Card>;
  }

  function openGoldenEgg(symbol: string) {
    selectSymbol(symbol);
    navigateTo('golden-egg', symbol);
  }

  function onSymbolRowKey(event: React.KeyboardEvent, symbol: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openGoldenEgg(symbol);
    }
  }

  return (
    <div className="space-y-4">
      {/* -- Regime Banner ---------------------------------------------- */}
      {regime.data && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Market Regime</span>
          <Badge
            label={regime.data.regime.replace(/_/g, ' ')}
            color={
              regime.data.regime.includes('UP') ? '#10B981'
              : regime.data.regime.includes('DOWN') || regime.data.regime.includes('STRESS') ? '#EF4444'
              : regime.data.regime.includes('EXPANSION') ? '#F59E0B'
              : '#6366F1'
            }
          />
          <Badge label={`Risk: ${regime.data.riskLevel}`} color={regime.data.riskLevel === 'low' ? '#10B981' : regime.data.riskLevel === 'moderate' ? '#F59E0B' : '#EF4444'} small />
          <Badge label={`Sizing: ${regime.data.sizing}`} color="#94A3B8" small />
        </div>
      )}

      <section className="rounded-lg border border-emerald-400/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,13,24,0.98))] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.18)]" aria-label="Dashboard command header">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,0.9fr)]">
          <div>
            <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-emerald-300">Morning command dashboard</div>
            <h1 className="mt-1 text-xl font-black tracking-normal text-white md:text-2xl">Open the research queue, then validate one symbol.</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
              Scanner cache, movers, calendar risk, and headlines are compressed into a morning review path.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/tools/scanner" className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-200 no-underline transition-colors hover:bg-emerald-400/15">Start Scanner</a>
              <a href="/tools/golden-egg" className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-amber-200 no-underline transition-colors hover:bg-amber-400/15">Validate Symbol</a>
              <a href="/tools/workspace?tab=journal" className="rounded-md border border-sky-400/35 bg-sky-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-sky-200 no-underline transition-colors hover:bg-sky-400/15">Open Journal</a>
            </div>
          </div>

          <div className="grid self-start gap-1.5 sm:grid-cols-2">
            <DashboardMetric label="Queue" value={researchQueueCount ? `${researchQueueCount} items` : 'Empty'} tone={researchQueueCount ? '#10B981' : '#94A3B8'} detail={`Top focus: ${topQueueSymbol}`} />
            <DashboardMetric label="Data Health" value={dataHealthLabel} tone={dataHealthTone} detail={degradedFeeds.length ? degradedFeeds.join(', ') : 'No feed errors reported'} />
            <DashboardMetric label="High Impact" value={String(highImpactEventCount)} tone={highImpactEventCount ? '#F59E0B' : '#94A3B8'} detail="Calendar events in queue" />
            <DashboardMetric label="Headlines" value={String(headlineCount)} tone={headlineCount ? '#38BDF8' : '#94A3B8'} detail="Latest news items loaded" />
          </div>
        </div>
      </section>

      <ComplianceDisclaimer compact />

      {/* ─── Morning Research Start ----------------------------------- */}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.72fr)]" aria-label="Morning research start">
        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-emerald-300">Today&apos;s Research Queue</div>
              <h2 className="mt-1 text-lg font-black text-white">Highest-evidence symbols first.</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">Click a symbol to open Golden Egg. Review context only; no trade instructions.</p>
            </div>
            <button type="button" onClick={() => navigateTo('scanner')} className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-400/15">
              Open Scanner
            </button>
          </div>

          {scannerQueue.length === 0 && moverQueue.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/35 px-4 py-5 text-center text-xs text-slate-500">
              No queue yet. Run Scanner or review movers to create a research list.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
              {scannerQueue.map((row: CachedSymbol) => (
                <button key={`queue-${row.symbol}`} type="button" onClick={() => openGoldenEgg(row.symbol)} className="rounded-lg border border-white/10 bg-white/[0.035] p-3 text-left hover:border-emerald-400/30 hover:bg-emerald-400/[0.05]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-black text-white">{row.symbol}</span>
                    <span className="text-xs font-bold" style={{ color: directionColor(row.direction) }}>{row.direction === 'bullish' ? 'Bullish bias' : row.direction === 'bearish' ? 'Bearish bias' : 'Neutral bias'}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-500">
                    <span>Score <strong className="text-slate-200">{row.score}</strong></span>
                    <span>Price <strong className="text-slate-200">{fmtPrice(row.price)}</strong></span>
                    <span className={pctColor(row.changePct)}>Move {row.changePct >= 0 ? '+' : ''}{row.changePct.toFixed(2)}%</span>
                  </div>
                  <div className="mt-2 text-[11px] font-semibold text-emerald-300">Next: review in Golden Egg</div>
                </button>
              ))}
              {moverQueue.map((m: Mover) => (
                <button key={`mover-queue-${m.ticker}`} type="button" onClick={() => openGoldenEgg(m.ticker)} className="rounded-lg border border-white/10 bg-white/[0.035] p-3 text-left hover:border-sky-400/30 hover:bg-sky-400/[0.05]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-black text-white">{m.ticker}</span>
                    <span className="text-xs font-bold text-sky-300">Mover evidence</span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">{m.asset_class} · {m.change_percentage} · price {fmtPrice(parseFloat(m.price))}</div>
                  <div className="mt-2 text-[11px] font-semibold text-emerald-300">Next: validate movement context</div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <div className="grid gap-3">
          <Card>
            <div className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-sky-300">Data Health Strip</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-white/10 bg-slate-950/35 p-3">
                <div className="text-slate-500">Loading feeds</div>
                <div className="mt-1 text-lg font-black text-white">{loadingFeeds}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-950/35 p-3">
                <div className="text-slate-500">Degraded feeds</div>
                <div className={`mt-1 text-lg font-black ${degradedFeeds.length ? 'text-amber-300' : 'text-emerald-300'}`}>{degradedFeeds.length}</div>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">{degradedFeeds.length ? `Review feed issues: ${degradedFeeds.join(', ')}.` : 'Scanner, movers, news, and calendar feeds have no reported errors.'}</p>
          </Card>

          <Card>
            <div className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-amber-300">Continue Workflow</div>
            <div className="mt-3 grid gap-2 text-xs">
              <button type="button" onClick={() => navigateTo('scanner')} className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-left text-slate-200 hover:border-emerald-400/30">1. Find scenarios in Scanner</button>
              <button type="button" onClick={() => navigateTo('golden-egg')} className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-left text-slate-200 hover:border-emerald-400/30">2. Validate one symbol in Golden Egg</button>
              <a href="/tools/workspace?tab=backtest" className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-left text-slate-200 no-underline hover:border-emerald-400/30">3. Test history in Backtest</a>
              <a href="/tools/workspace?tab=journal" className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-left text-slate-200 no-underline hover:border-emerald-400/30">4. Save notes in Journal</a>
            </div>
          </Card>
        </div>
      </section>

      {/* ─── Dashboard Lens Rail ─── */}
      <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-emerald-300">Dashboard lens</div>
            <div className="text-[0.72rem] text-slate-500">Switch between saved pages, live market desk, derivatives, and macro context.</div>
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        {DASH_TABS.map(t => (
          <button
            key={t}
            type="button"
            aria-pressed={dashTab === t}
            onClick={() => setDashTab(t)}
            className={`shrink-0 rounded-md border px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors ${
              dashTab === t
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-slate-800 bg-slate-950/35 text-slate-400 hover:border-slate-600 hover:text-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
        </div>
      </div>

      {/* ─── My Pages Tab ─── */}
      {dashTab === 'My Pages' && <FavoritesPanel embeddedInDashboard />}

      {/* ─── Crypto Derivatives Tab ─── */}
      {dashTab === 'Crypto Derivatives' && <UpgradeGate requiredTier="pro" currentTier={tier} feature="Crypto Derivatives"><CryptoDashboard embeddedInDashboard /></UpgradeGate>}

      {/* ─── Macro Tab ─── */}
      {dashTab === 'Macro' && (!isPro ? (
        <div>
          <div className="text-xs text-center text-slate-400 bg-slate-800/50 border border-slate-700/30 rounded-lg px-3 py-2 mb-3">
            <span className="text-emerald-400 font-semibold">Pro required:</span> upgrade to interact with the Macro Dashboard
          </div>
          <div className="pointer-events-none select-none"><MacroDashboard embeddedInDashboard /></div>
        </div>
      ) : <MacroDashboard embeddedInDashboard />)}

      {/* ─── Command Center Tab (default) ─── */}
      {dashTab === 'Command Center' && <>
      {!isPro && (
        <div className="text-xs text-center text-slate-400 bg-slate-800/50 border border-slate-700/30 rounded-lg px-3 py-2">
          <span className="text-emerald-400 font-semibold">Pro required:</span> upgrade to interact with the Command Center
        </div>
      )}
      <div className={!isPro ? 'pointer-events-none select-none' : undefined}>

      {/* -- Edge Intelligence (v3.1) ----------------------------------- */}
      <div className={isPro ? 'grid items-start gap-3 xl:grid-cols-[minmax(16rem,0.55fr)_minmax(0,1.45fr)]' : ''}>
      {isPro && <EdgeInsightCards compact />}

      {/* -- Best Setups (from worker cache) ------------------------------ */}
      {cached.loading ? <CardSkeleton rows={5} /> : (
      <Card>
        <PanelHeader title="Top Confluence Now" eyebrow="Validated queue" action={<button type="button" onClick={() => navigateTo('scanner')} className="text-[11px] text-emerald-400 hover:underline">Full Scanner &#x203A;</button>} />
        {[...cached.equity, ...cached.crypto].length === 0 ? (
          <div className="text-xs text-slate-500 py-4 text-center">
            No cached data yet — <button type="button" onClick={() => navigateTo('scanner')} className="text-emerald-400 hover:underline">run the Scanner</button>
          </div>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {[...cached.equity.slice(0, 3), ...cached.crypto.slice(0, 2)].map((r: CachedSymbol) => (
              <div key={r.symbol} role="button" tabIndex={0} aria-label={`Open Golden Egg for ${r.symbol}`} className="rounded-md border border-white/10 bg-slate-950/30 px-2 py-1.5 text-xs cursor-pointer hover:border-emerald-400/25 hover:bg-emerald-400/[0.04] focus:bg-slate-800/40 focus:outline-none" onClick={() => openGoldenEgg(r.symbol)} onKeyDown={(e) => onSymbolRowKey(e, r.symbol)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">{r.symbol}</span>
                  <span className={`font-mono tabular-nums ${r.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span style={{ color: directionColor(r.direction) }}>{r.direction === 'bullish' ? 'Bullish' : r.direction === 'bearish' ? 'Bearish' : 'Neutral'} · {r.score}</span>
                  <span className="font-mono tabular-nums text-slate-300">{fmtPrice(r.price)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* -- Equity Movers -------------------------------------------- */}
        {movers.loading ? <CardSkeleton rows={5} /> : (
          <Card>
            <PanelHeader title="Equity Movers" eyebrow="Live movement" />
            <div className="space-y-1">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-emerald-500">Gainers</div>
              {eqGainers.length === 0 ? (
                <div className="text-xs text-slate-500 py-1">No equity data</div>
              ) : eqGainers.slice(0, 4).map((m: Mover) => <MoverRow key={`eg-${m.ticker}`} mover={m} tone="up" onOpen={() => openGoldenEgg(m.ticker)} onKeyOpen={(e) => onSymbolRowKey(e, m.ticker)} />)}
              <div className="mb-1 mt-2 text-[11px] uppercase tracking-wider text-red-500">Losers</div>
              {eqLosers.length === 0 ? (
                <div className="text-xs text-slate-500 py-1">No equity data</div>
              ) : eqLosers.slice(0, 4).map((m: Mover) => <MoverRow key={`el-${m.ticker}`} mover={m} tone="down" onOpen={() => openGoldenEgg(m.ticker)} onKeyOpen={(e) => onSymbolRowKey(e, m.ticker)} />)}
            </div>
          </Card>
        )}

        {/* -- Crypto Movers -------------------------------------------- */}
        {movers.loading ? <CardSkeleton rows={5} /> : (
          <Card>
            <PanelHeader title="Crypto Movers" eyebrow="Live movement" />
            <div className="space-y-1">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-emerald-500">Gainers</div>
              {crGainers.length === 0 ? (
                <div className="text-xs text-slate-500 py-1">No crypto data</div>
              ) : crGainers.slice(0, 4).map((m: Mover) => <MoverRow key={`cg-${m.ticker}`} mover={m} tone="up" onOpen={() => openGoldenEgg(m.ticker)} onKeyOpen={(e) => onSymbolRowKey(e, m.ticker)} />)}
              <div className="mb-1 mt-2 text-[11px] uppercase tracking-wider text-red-500">Losers</div>
              {crLosers.length === 0 ? (
                <div className="text-xs text-slate-500 py-1">No crypto data</div>
              ) : crLosers.slice(0, 4).map((m: Mover) => <MoverRow key={`cl-${m.ticker}`} mover={m} tone="down" onOpen={() => openGoldenEgg(m.ticker)} onKeyOpen={(e) => onSymbolRowKey(e, m.ticker)} />)}
            </div>
          </Card>
        )}

        {/* -- Economic Calendar ---------------------------------------- */}
        {calendar.loading ? <CardSkeleton rows={4} /> : (
          <Card>
            <PanelHeader title="Upcoming Events" eyebrow="Calendar risk" />
            {highImpactEvents.length === 0 ? (
              <div className="text-xs text-slate-500 py-4 text-center">No high-impact events this period</div>
            ) : (
              <div className="space-y-2">
                {highImpactEvents.map((e: EconomicEvent, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 min-w-0">
                      <ImpactDot impact={e.impact as 'high' | 'medium' | 'low'} />
                      <span className="text-white truncate">{e.event}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 text-slate-500">
                      <span>{e.date}</span>
                      <span>{e.time || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => navigateTo('research')} className="mt-2 block text-[11px] text-emerald-400 hover:underline">Full Calendar &#x203A;</button>
          </Card>
        )}

        {/* -- Cross-Market --------------------------------------------- */}
        <Card>
          <PanelHeader title="Cross-Market Influence" eyebrow="Context map" />
          <div className="space-y-2">
            {CROSS_MARKET.slice(0, 5).map(cm => (
              <div key={cm.from} className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{cm.from} {cm.condition}</span>
                <span className="text-slate-500 text-right">{cm.effect}</span>
              </div>
            ))}
            <button type="button" onClick={() => navigateTo('explorer')} className="mt-1 block text-[11px] text-emerald-400 hover:underline">Market Explorer &#x203A;</button>
          </div>
        </Card>
      </div>

      {/* -- Latest News ------------------------------------------------ */}
      {news.loading ? <CardSkeleton rows={4} /> : (
        <Card>
          <PanelHeader title="Latest Headlines" eyebrow="News context" action={<button type="button" onClick={() => navigateTo('research')} className="text-[11px] text-emerald-400 hover:underline">All News &#x203A;</button>} />
          {articles.length === 0 ? (
            <div className="text-xs text-slate-500 py-4 text-center">No recent news</div>
          ) : (
            <div className="grid gap-x-4 gap-y-1 xl:grid-cols-2">
              {articles.map((n: NewsArticle, i: number) => (
                <div key={i} className="flex min-w-0 items-start gap-2 rounded-md px-1 py-1 text-xs hover:bg-slate-800/35">
                  <ImpactDot impact={n.sentiment.score > 0.2 ? 'high' : n.sentiment.score > 0 ? 'medium' : 'low'} />
                  <div className="flex-1 min-w-0">
                    <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-white hover:text-emerald-400 transition-colors line-clamp-1">
                      {n.title}
                    </a>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-slate-600">{n.source}</span>
                      {n.tickerSentiments?.slice(0, 3).map(ts => (
                        <button key={ts.ticker} type="button" className="text-emerald-400 cursor-pointer hover:underline" onClick={() => openGoldenEgg(ts.ticker)}>{ts.ticker}</button>
                      ))}
                    </div>
                  </div>
                  <span className={`flex-shrink-0 ${n.sentiment.score > 0 ? 'text-emerald-400' : n.sentiment.score < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                    {n.sentiment.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* -- Error / debug (collapsed) -------------------------------- */}
      {(() => {
        const errs = [
          cached.error && `Scanner cache: ${cached.error}`,
          movers.error && `Movers: ${movers.error}`,
          news.error && `News: ${news.error}`,
          calendar.error && `Calendar: ${calendar.error}`,
        ].filter(Boolean) as string[];
        if (!errs.length) return null;
        return (
          <details className="rounded-lg border border-red-900/20 p-2 text-[11px] text-red-400/40">
            <summary className="cursor-pointer hover:text-red-400/60">{errs.length} API issue{errs.length > 1 ? 's' : ''} — click to expand</summary>
            <div className="mt-1 space-y-0.5 pl-3">{errs.map((e, i) => <div key={i}>{e}</div>)}</div>
          </details>
        );
      })()}
      </div>
      </>}
    </div>
  );
}
