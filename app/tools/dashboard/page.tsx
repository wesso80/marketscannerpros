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
import { Card, ImpactDot, AuthPrompt, UpgradeGate } from '@/app/v2/_components/ui';
import { Card as DSCard, Badge as DSBadge, Button as DSButton, StatCard } from '@/components/ui';
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

/* ─── Magnificent 7 ─── */
const MAG7_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'] as const;
interface Mag7Quote {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  error?: string;
}

/* ─── Major Indices ─── */
// Tradable ETF proxies for realtime index levels (Alpha Vantage GLOBAL_QUOTE realtime).
// Alpha Vantage's INDEX_DATA endpoint is EOD-only, so we use liquid ETFs for live tiles.
const INDEX_PROXIES = [
  { etf: 'SPY', label: 'S&P 500', index: 'SPX' },
  { etf: 'DIA', label: 'Dow Jones', index: 'DJI' },
  { etf: 'QQQ', label: 'Nasdaq 100', index: 'NDX' },
  { etf: 'IWM', label: 'Russell 2000', index: 'RUT' },
  { etf: 'VIXY', label: 'Volatility', index: 'VIX' },
] as const;
const INDEX_SYMBOLS = INDEX_PROXIES.map((i) => i.etf);
interface IndexQuote {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  error?: string;
}

// TradingView-style heat color: intensity scales with magnitude of move (caps at ±5%).
function heatColor(changePercent: number | null): string {
  if (changePercent == null) return 'rgb(44, 49, 58)';
  const intensity = Math.min(Math.abs(changePercent) / 5, 1);
  if (changePercent > 0) {
    const base = Math.round(30 + intensity * 25);
    const green = Math.round(120 + intensity * 110);
    return `rgb(${base}, ${green}, ${Math.round(base * 1.4)})`;
  }
  if (changePercent < 0) {
    const base = Math.round(30 + intensity * 25);
    const red = Math.round(120 + intensity * 110);
    return `rgb(${red}, ${base}, ${Math.round(base * 1.4)})`;
  }
  return 'rgb(44, 49, 58)';
}

/* -- helpers -------------------------------------------------------------- */
function directionColor(d?: string) {
  if (d === 'bullish') return 'var(--msp-bull)';
  if (d === 'bearish') return 'var(--msp-bear)';
  return 'var(--msp-warn)';
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

// Design-system helpers: sentence-case labels, tabular numbers, magnitude bars.
function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 'var(--msp-text-label)', fontWeight: 500, color: 'var(--msp-text-muted)' }}>
      {children}
    </div>
  );
}

function MetricCol({ label, value, tone = 'var(--msp-text)', align = 'left' }: { label: string; value: React.ReactNode; tone?: string; align?: 'left' | 'right' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start', gap: 2 }}>
      <span style={{ fontSize: 'var(--msp-text-label)', fontWeight: 500, color: 'var(--msp-text-muted)' }}>{label}</span>
      <span style={{ fontSize: 'var(--msp-text-body)', fontWeight: 500, color: tone, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{value}</span>
    </div>
  );
}

function MagnitudeBar({ value, max = 100, color = 'var(--msp-flat)', height = 3 }: { value: number; max?: number; color?: string; height?: number }) {
  const pct = Math.min(100, Math.max(0, (Math.abs(value) / max) * 100));
  return (
    <div style={{ width: '100%', height, borderRadius: 999, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }} aria-hidden="true">
      <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 200ms ease' }} />
    </div>
  );
}

function DashboardMetric({ label, value, tone = 'var(--msp-text)', detail }: { label: string; value: string; tone?: string; detail: string }) {
  return (
    <div style={{ background: 'var(--msp-card-2)', borderRadius: 'var(--msp-radius-card)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: '3.5rem' }}>
      <span style={{ fontSize: 'var(--msp-text-label)', fontWeight: 500, color: 'var(--msp-text-muted)' }}>{label}</span>
      <span style={{ fontSize: 'var(--msp-text-h2)', fontWeight: 500, color: tone, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--msp-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={detail}>{detail}</span>
    </div>
  );
}

function PanelHeader({ title, eyebrow, action }: { title: string; eyebrow?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-start justify-between gap-3">
      <div>
        {eyebrow ? <SectionEyebrow>{eyebrow}</SectionEyebrow> : null}
        <h3 style={{ fontSize: 'var(--msp-text-body)', fontWeight: 500, color: 'var(--msp-text)', marginTop: eyebrow ? 2 : 0 }}>{title}</h3>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function MoverRow({ mover, tone, onOpen, onKeyOpen }: { mover: Mover; tone: 'up' | 'down'; onOpen: () => void; onKeyOpen: (event: React.KeyboardEvent) => void }) {
  const pct = parseChangePct(mover.change_percentage);
  const barColor = tone === 'up' ? 'var(--msp-bull)' : 'var(--msp-bear)';
  const sign = pct >= 0 ? '+' : '';
  return (
    <button
      type="button"
      aria-label={`Open Golden Egg for ${mover.ticker}`}
      className="w-full rounded-md px-2 py-1.5 text-xs hover:bg-slate-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
      onClick={onOpen}
      onKeyDown={onKeyOpen}
    >
      <div className="grid grid-cols-[4.5rem_1fr_5.5rem] items-center gap-2">
        <span style={{ fontWeight: 500, color: 'var(--msp-text)' }}>{mover.ticker}</span>
        <span className="text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--msp-text-muted)' }}>{fmtPrice(parseFloat(mover.price))}</span>
        <span className="text-right" style={{ fontVariantNumeric: 'tabular-nums', color: barColor, fontWeight: 500 }}>{sign}{mover.change_percentage}</span>
      </div>
      <div className="mt-1">
        <MagnitudeBar value={pct} max={10} color={barColor} height={2} />
      </div>
    </button>
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
  const { stale: cacheStale, ageMinutes: cacheAgeMinutes } = cached;

  /* -- Magnificent 7 live quotes ---------------------------------------- */
  const [mag7, setMag7] = useState<Mag7Quote[]>([]);
  const [mag7Loading, setMag7Loading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function loadMag7() {
      try {
        const res = await fetch('/api/scanner/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: [...MAG7_SYMBOLS] }),
        });
        if (!res.ok) throw new Error('quotes fetch failed');
        const data = await res.json();
        if (cancelled) return;
        const bySymbol = new Map<string, Mag7Quote>((data.quotes || []).map((q: Mag7Quote) => [q.symbol, q]));
        setMag7(MAG7_SYMBOLS.map(sym => bySymbol.get(sym) || { symbol: sym, price: null, change: null, changePercent: null, error: 'No data' }));
      } catch {
        if (!cancelled) setMag7(MAG7_SYMBOLS.map(sym => ({ symbol: sym, price: null, change: null, changePercent: null, error: 'No data' })));
      } finally {
        if (!cancelled) setMag7Loading(false);
      }
    }
    loadMag7();
    return () => { cancelled = true; };
  }, []);

  /* -- Major Indices live quotes ---------------------------------------- */
  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [indicesLoading, setIndicesLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function loadIndices() {
      try {
        const res = await fetch('/api/scanner/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: [...INDEX_SYMBOLS] }),
        });
        if (!res.ok) throw new Error('quotes fetch failed');
        const data = await res.json();
        if (cancelled) return;
        const bySymbol = new Map<string, IndexQuote>((data.quotes || []).map((q: IndexQuote) => [q.symbol, q]));
        setIndices(INDEX_SYMBOLS.map((sym) => bySymbol.get(sym) || { symbol: sym, price: null, change: null, changePercent: null, error: 'No data' }));
      } catch {
        if (!cancelled) setIndices(INDEX_SYMBOLS.map((sym) => ({ symbol: sym, price: null, change: null, changePercent: null, error: 'No data' })));
      } finally {
        if (!cancelled) setIndicesLoading(false);
      }
    }
    loadIndices();
    return () => { cancelled = true; };
  }, []);

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
    cacheStale ? `Scanner cache stale (${cacheAgeMinutes != null ? `${cacheAgeMinutes}m old` : 'age unknown'})` : null,
    movers.error ? 'Movers' : null,
    news.error ? 'News' : null,
    calendar.error ? 'Calendar' : null,
  ].filter(Boolean);
  const loadingFeeds = [cached.loading, movers.loading, news.loading, calendar.loading].filter(Boolean).length;
  const researchQueueCount = scannerQueue.length + moverQueue.length;
  const highImpactEventCount = highImpactEvents.length;
  const headlineCount = articles.length;
  const dataHealthLabel = degradedFeeds.length ? `${degradedFeeds.length} issue${degradedFeeds.length === 1 ? '' : 's'}` : loadingFeeds ? `${loadingFeeds} loading` : 'Ready';
  const dataHealthTone = degradedFeeds.length ? 'var(--msp-warn)' : loadingFeeds ? 'var(--msp-flat)' : 'var(--msp-bull)';
  const topQueueSymbol = scannerQueue[0]?.symbol || moverQueue[0]?.ticker || 'None';
  const hasQueue = researchQueueCount > 0;
  const nextCheckValue = hasQueue ? `Validate ${topQueueSymbol}` : loadingFeeds ? 'Loading feeds…' : 'Run Scanner first';
  const nextCheckDetail = hasQueue ? 'Open Golden Egg from queue below' : loadingFeeds ? 'Cached scanner data syncing' : 'No cached candidates yet';
  const nextCheckTone = hasQueue ? 'var(--msp-warn)' : 'var(--msp-flat)';
  const topSymbolHref = hasQueue ? `/tools/golden-egg?symbol=${encodeURIComponent(topQueueSymbol)}` : '/tools/golden-egg';

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
      <section style={{ background: 'var(--msp-panel)', borderRadius: 'var(--msp-radius-card)', padding: 16 }} aria-label="Dashboard command header">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,0.9fr)]">
          <div>
            <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 'var(--msp-text-label)', color: 'var(--msp-text-muted)' }}>
              <span>Morning command dashboard</span>
              {regime.data && (
                <span className="inline-flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>
                  <span style={{ color: regime.data.regime.includes('UP') ? 'var(--msp-bull)' : regime.data.regime.includes('DOWN') || regime.data.regime.includes('STRESS') ? 'var(--msp-bear)' : regime.data.regime.includes('EXPANSION') ? 'var(--msp-warn)' : 'var(--msp-info)' }}>{regime.data.regime.replace(/_/g, ' ').toLowerCase()}</span>
                  <span style={{ color: 'var(--msp-text-faint)' }}>·</span>
                  <span>risk <span style={{ color: regime.data.riskLevel === 'low' ? 'var(--msp-bull)' : regime.data.riskLevel === 'moderate' ? 'var(--msp-warn)' : 'var(--msp-bear)' }}>{regime.data.riskLevel}</span></span>
                  <span style={{ color: 'var(--msp-text-faint)' }}>·</span>
                  <span>sizing <span style={{ color: 'var(--msp-text)' }}>{regime.data.sizing}</span></span>
                </span>
              )}
            </div>
            <h1 className="mt-1" style={{ fontSize: 'var(--msp-text-h1)', fontWeight: 500, color: 'var(--msp-text)', lineHeight: 1.25 }}>Open the research queue, then validate one symbol.</h1>
            <p className="mt-1 max-w-3xl" style={{ fontSize: 'var(--msp-text-body-sm)', color: 'var(--msp-text-muted)', lineHeight: 1.5 }}>
              Scanner cache, movers, calendar risk, and headlines compressed into a morning review path.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <DSButton variant="primary" size="sm" onClick={() => navigateTo('scanner')}>Start scanner</DSButton>
              <DSButton variant="secondary" size="sm" onClick={() => { window.location.href = topSymbolHref; }}>{hasQueue ? `Validate ${topQueueSymbol}` : 'Validate symbol'}</DSButton>
              <DSButton variant="ghost" size="sm" onClick={() => { window.location.href = '/tools/workspace?tab=journal'; }}>Open journal</DSButton>
            </div>
          </div>

          <div className="grid self-start gap-1.5 sm:grid-cols-2">
            <DashboardMetric label="Queue" value={researchQueueCount ? `${researchQueueCount} items` : 'Empty'} tone={researchQueueCount ? 'var(--msp-bull)' : 'var(--msp-flat)'} detail={hasQueue ? `Top focus: ${topQueueSymbol}` : 'Run Scanner to populate'} />
            <DashboardMetric label="Data health" value={dataHealthLabel} tone={dataHealthTone} detail={degradedFeeds.length ? degradedFeeds.join(', ') : loadingFeeds ? 'Feeds syncing' : 'No feed errors reported'} />
            <DashboardMetric label="High impact" value={String(highImpactEventCount)} tone={highImpactEventCount ? 'var(--msp-warn)' : 'var(--msp-flat)'} detail={highImpactEventCount ? 'Calendar events in queue' : 'No high-impact events'} />
            <DashboardMetric label="Next check" value={nextCheckValue} tone={nextCheckTone} detail={nextCheckDetail} />
          </div>
        </div>
      </section>

      <ComplianceDisclaimer compact />

      {/* ─── Morning Research Start ----------------------------------- */}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.72fr)]" aria-label="Morning research start">
        <DSCard>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <SectionEyebrow>Today&apos;s research queue</SectionEyebrow>
              <h2 style={{ fontSize: 'var(--msp-text-h2)', fontWeight: 500, color: 'var(--msp-text)', marginTop: 2 }}>Highest-evidence symbols first.</h2>
              <p className="mt-1" style={{ fontSize: 'var(--msp-text-body-sm)', color: 'var(--msp-text-muted)', lineHeight: 1.5 }}>Click a symbol to open Golden Egg. Review context only; no trade instructions.</p>
            </div>
            <DSButton variant="ghost" size="sm" onClick={() => navigateTo('scanner')}>Open scanner</DSButton>
          </div>

          {scannerQueue.length === 0 && moverQueue.length === 0 ? (
            <div style={{ background: 'var(--msp-card-2)', borderRadius: 'var(--msp-radius-control)', padding: '20px', textAlign: 'center', fontSize: 'var(--msp-text-body-sm)', color: 'var(--msp-text-faint)' }}>
              No queue yet. Run Scanner or review movers to create a research list.
            </div>
          ) : (() => {
            const combined: Array<{ kind: 'cached'; row: CachedSymbol } | { kind: 'mover'; row: Mover }> = [
              ...scannerQueue.map(row => ({ kind: 'cached' as const, row })),
              ...moverQueue.map(row => ({ kind: 'mover' as const, row })),
            ];
            return (
              <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                {combined.map((item, idx) => {
                  const isFocal = idx === 0;
                  if (item.kind === 'cached') {
                    const row = item.row;
                    const moveColor = row.changePct >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)';
                    const biasLabel = row.direction === 'bullish' ? 'Bullish bias' : row.direction === 'bearish' ? 'Bearish bias' : 'Neutral bias';
                    const biasTone: 'bull' | 'bear' | 'neutral' = row.direction === 'bullish' ? 'bull' : row.direction === 'bearish' ? 'bear' : 'neutral';
                    return (
                      <button
                        key={`queue-${row.symbol}`}
                        type="button"
                        aria-label={`Validate ${row.symbol} in Golden Egg`}
                        onClick={() => openGoldenEgg(row.symbol)}
                        style={{
                          textAlign: 'left',
                          background: isFocal ? 'var(--msp-card-2)' : 'var(--msp-card)',
                          borderRadius: 'var(--msp-radius-control)',
                          borderLeft: isFocal ? '2px solid var(--msp-accent)' : '2px solid transparent',
                          padding: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          transition: 'background 120ms ease',
                        }}
                        className="hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span style={{ fontSize: 'var(--msp-text-body)', fontWeight: 500, color: 'var(--msp-text)' }}>{row.symbol}</span>
                          <DSBadge tone={biasTone}>{biasLabel}</DSBadge>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <MetricCol label="Score" value={row.score} />
                          <MetricCol label="Price" value={fmtPrice(row.price)} align="right" />
                          <MetricCol label="Move" value={`${row.changePct >= 0 ? '+' : ''}${row.changePct.toFixed(2)}%`} tone={moveColor} align="right" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <MagnitudeBar value={row.score} max={100} color="var(--msp-accent-dim)" height={3} />
                          <MagnitudeBar value={row.changePct} max={10} color={moveColor} height={2} />
                        </div>
                        <div style={{ fontSize: 'var(--msp-text-label)', color: 'var(--msp-text-muted)' }}>Next: review in Golden Egg</div>
                      </button>
                    );
                  } else {
                    const m = item.row;
                    const movePct = parseChangePct(m.change_percentage);
                    const moveColor = movePct >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)';
                    return (
                      <button
                        key={`mover-queue-${m.ticker}`}
                        type="button"
                        aria-label={`Validate ${m.ticker} in Golden Egg`}
                        onClick={() => openGoldenEgg(m.ticker)}
                        style={{
                          textAlign: 'left',
                          background: isFocal ? 'var(--msp-card-2)' : 'var(--msp-card)',
                          borderRadius: 'var(--msp-radius-control)',
                          borderLeft: isFocal ? '2px solid var(--msp-accent)' : '2px solid transparent',
                          padding: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                        className="hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span style={{ fontSize: 'var(--msp-text-body)', fontWeight: 500, color: 'var(--msp-text)' }}>{m.ticker}</span>
                          <DSBadge tone="info">Mover evidence</DSBadge>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <MetricCol label="Price" value={fmtPrice(parseFloat(m.price))} />
                          <MetricCol label="Move" value={`${movePct >= 0 ? '+' : ''}${m.change_percentage}`} tone={moveColor} align="right" />
                        </div>
                        <MagnitudeBar value={movePct} max={10} color={moveColor} height={2} />
                        <div style={{ fontSize: 'var(--msp-text-label)', color: 'var(--msp-text-muted)' }}>Next: validate movement context</div>
                      </button>
                    );
                  }
                })}
              </div>
            );
          })()}
        </DSCard>

        <div className="grid gap-3">
          <DSCard>
            <SectionEyebrow>Data health strip</SectionEyebrow>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div style={{ background: 'var(--msp-card-2)', borderRadius: 'var(--msp-radius-control)', padding: 12 }}>
                <div style={{ fontSize: 'var(--msp-text-label)', color: 'var(--msp-text-muted)' }}>Loading feeds</div>
                <div style={{ marginTop: 4, fontSize: 'var(--msp-text-h2)', fontWeight: 500, color: 'var(--msp-text)', fontVariantNumeric: 'tabular-nums' }}>{loadingFeeds}</div>
              </div>
              <div style={{ background: 'var(--msp-card-2)', borderRadius: 'var(--msp-radius-control)', padding: 12 }}>
                <div style={{ fontSize: 'var(--msp-text-label)', color: 'var(--msp-text-muted)' }}>Degraded feeds</div>
                <div style={{ marginTop: 4, fontSize: 'var(--msp-text-h2)', fontWeight: 500, color: degradedFeeds.length ? 'var(--msp-warn)' : 'var(--msp-bull)', fontVariantNumeric: 'tabular-nums' }}>{degradedFeeds.length}</div>
              </div>
            </div>
            {cacheAgeMinutes != null && !cached.error && (
              <div className="mt-2 flex items-center gap-1.5" style={{ fontSize: 11, color: cacheStale ? 'var(--msp-warn)' : 'var(--msp-text-faint)' }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: cacheStale ? 'var(--msp-warn)' : 'var(--msp-bull)' }} aria-hidden="true" />
                Scanner cache: {cacheAgeMinutes < 60 ? `${cacheAgeMinutes}m` : `${Math.round(cacheAgeMinutes / 60)}h`} old{cacheStale ? ' — stale' : ' — fresh'}
              </div>
            )}
            <p className="mt-2" style={{ fontSize: 11, color: 'var(--msp-text-faint)', lineHeight: 1.5 }}>{degradedFeeds.length ? `Review feed issues: ${degradedFeeds.join(', ')}.` : 'Scanner, movers, news, and calendar feeds have no reported errors.'}</p>
          </DSCard>

          <DSCard>
            <SectionEyebrow>Continue workflow</SectionEyebrow>
            <div className="mt-3 grid gap-2">
              <button type="button" onClick={() => navigateTo('scanner')} style={{ background: hasQueue ? 'var(--msp-card-2)' : 'var(--msp-card)', borderRadius: 'var(--msp-radius-control)', padding: '8px 12px', textAlign: 'left', fontSize: 'var(--msp-text-body-sm)', color: hasQueue ? 'var(--msp-bull)' : 'var(--msp-text-muted)', borderLeft: hasQueue ? '2px solid var(--msp-bull)' : '2px solid transparent' }}>{hasQueue ? `✓ ${researchQueueCount} scenarios queued` : '1. Find scenarios in Scanner'}</button>
              <a href={topSymbolHref} style={{ background: 'var(--msp-card-2)', borderRadius: 'var(--msp-radius-control)', padding: '8px 12px', textAlign: 'left', fontSize: 'var(--msp-text-body-sm)', color: 'var(--msp-text-muted)', textDecoration: 'none' }}>{hasQueue ? `2. Validate ${topQueueSymbol} in Golden Egg` : '2. Validate one symbol in Golden Egg'}</a>
              <a href="/tools/workspace?tab=backtest" style={{ background: 'var(--msp-card-2)', borderRadius: 'var(--msp-radius-control)', padding: '8px 12px', textAlign: 'left', fontSize: 'var(--msp-text-body-sm)', color: 'var(--msp-text-muted)', textDecoration: 'none' }}>3. Test history in Backtest</a>
              <a href="/tools/workspace?tab=journal" style={{ background: 'var(--msp-card-2)', borderRadius: 'var(--msp-radius-control)', padding: '8px 12px', textAlign: 'left', fontSize: 'var(--msp-text-body-sm)', color: 'var(--msp-text-muted)', textDecoration: 'none' }}>4. Save notes in Journal</a>
            </div>
          </DSCard>
        </div>
      </section>

      {/* ─── Volatility Watch + Time Confluence + ARCA Summary ─── */}
      <section className="grid gap-3 md:grid-cols-3" aria-label="Volatility and research context panels">
        {/* Volatility Watch */}
        <DSCard>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <SectionEyebrow>Volatility watch</SectionEyebrow>
              <div style={{ fontSize: 'var(--msp-text-body)', fontWeight: 500, color: 'var(--msp-text)', marginTop: 2 }}>Compression &amp; expansion signals</div>
            </div>
            <DSButton variant="ghost" size="sm" onClick={() => { window.location.href = '/tools/volatility-engine'; }} aria-label="Open Dynamic Volatility Engine">DVE ›</DSButton>
          </div>
          {cached.loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-6 animate-pulse rounded" style={{ background: 'var(--msp-card-2)' }} />)}
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* High ADX = trending (expansion); low ADX = compression candidate */}
              {([...cached.equity.slice(0,3), ...cached.crypto.slice(0,2)] as CachedSymbol[])
                .sort((a, b) => Math.abs(b.adx) - Math.abs(a.adx))
                .slice(0, 4)
                .map((r: CachedSymbol) => {
                  const phase = r.adx >= 30 ? 'Trending' : r.adx >= 20 ? 'Developing' : 'Compression';
                  const phaseTone: 'bull' | 'warn' | 'info' = r.adx >= 30 ? 'bull' : r.adx >= 20 ? 'warn' : 'info';
                  return (
                    <button
                      key={`vol-${r.symbol}`}
                      type="button"
                      aria-label={`Open Golden Egg for ${r.symbol}`}
                      onClick={() => openGoldenEgg(r.symbol)}
                      style={{ background: 'var(--msp-card-2)', borderRadius: 'var(--msp-radius-control)', padding: '6px 10px', width: '100%' }}
                      className="flex items-center justify-between hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                    >
                      <span style={{ fontSize: 'var(--msp-text-body-sm)', fontWeight: 500, color: 'var(--msp-text)' }}>{r.symbol}</span>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 'var(--msp-text-body-sm)', color: 'var(--msp-text-muted)', fontVariantNumeric: 'tabular-nums' }}>ADX {Math.round(r.adx)}</span>
                        <DSBadge tone={phaseTone}>{phase}</DSBadge>
                      </div>
                    </button>
                  );
                })}
              {[...cached.equity, ...cached.crypto].length === 0 && (
                <div className="py-3 text-center" style={{ fontSize: 'var(--msp-text-body-sm)', color: 'var(--msp-text-faint)' }}>Run Scanner to populate volatility watch</div>
              )}
              <div className="pt-1" style={{ fontSize: 10, color: 'var(--msp-text-faint)' }}>ADX ≥ 30 trending · 20–29 developing · &lt;20 compression. Heuristic only.</div>
            </div>
          )}
        </DSCard>

        {/* Time Confluence Watch */}
        <DSCard>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <SectionEyebrow>Time confluence watch</SectionEyebrow>
              <div style={{ fontSize: 'var(--msp-text-body)', fontWeight: 500, color: 'var(--msp-text)', marginTop: 2 }}>Upcoming close clusters</div>
            </div>
            <DSButton variant="ghost" size="sm" onClick={() => { window.location.href = '/tools/time-scanner'; }} aria-label="Open Time Scanner">Time ›</DSButton>
          </div>
          <div className="space-y-2">
            {regime.data ? (
              <>
                <div style={{ background: 'var(--msp-card-2)', borderRadius: 'var(--msp-radius-control)', padding: '8px 12px' }}>
                  <div style={{ fontSize: 'var(--msp-text-body-sm)', fontWeight: 500, color: 'var(--msp-text)' }}>Regime context</div>
                  <div style={{ marginTop: 4, fontSize: 'var(--msp-text-body-sm)', color: 'var(--msp-text-muted)' }}>{regime.data.regime.replace(/_/g, ' ').toLowerCase()} · {regime.data.riskLevel} risk environment</div>
                </div>
                <div style={{ background: 'var(--msp-card-2)', borderRadius: 'var(--msp-radius-control)', padding: '8px 12px', color: 'var(--msp-text-muted)', fontSize: 'var(--msp-text-body-sm)' }}>
                  <div style={{ fontWeight: 500, color: 'var(--msp-text)', marginBottom: 4 }}>What to check</div>
                  <div>· Weekly/monthly closes within next 3 sessions</div>
                  <div>· High-impact calendar events ({highImpactEventCount} queued)</div>
                  <div>· Crypto: UTC Saturday close risk</div>
                </div>
              </>
            ) : (
              <div className="py-3 text-center" style={{ fontSize: 'var(--msp-text-body-sm)', color: 'var(--msp-text-faint)' }}>Regime loading…</div>
            )}
            <a href="/tools/time-scanner" style={{ display: 'block', background: 'var(--msp-card-2)', borderRadius: 'var(--msp-radius-control)', padding: '8px 12px', textAlign: 'center', fontSize: 'var(--msp-text-body-sm)', color: 'var(--msp-info)', textDecoration: 'none', fontWeight: 500 }}>
              Open Time Scanner for close calendar ›
            </a>
          </div>
        </DSCard>

        {/* ARCA Research Summary */}
        <DSCard>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <SectionEyebrow>ARCA research context</SectionEyebrow>
              <div style={{ fontSize: 'var(--msp-text-body)', fontWeight: 500, color: 'var(--msp-text)', marginTop: 2 }}>AI analyst briefing</div>
            </div>
            <DSButton variant="ghost" size="sm" onClick={() => { window.location.href = '/tools/ai-analyst'; }} aria-label="Open MSP Analyst">Ask ›</DSButton>
          </div>
          <div className="space-y-2">
            <div style={{ background: 'var(--msp-card-2)', borderRadius: 'var(--msp-radius-control)', padding: '8px 12px' }}>
              <div style={{ fontSize: 'var(--msp-text-body-sm)', fontWeight: 500, color: 'var(--msp-text)' }}>MSP Analyst</div>
              <div style={{ marginTop: 4, fontSize: 'var(--msp-text-body-sm)', color: 'var(--msp-text-muted)' }}>
                {regime.data
                  ? `Regime is ${regime.data.regime.replace(/_/g, ' ').toLowerCase()}. ${regime.data.riskLevel === 'high' ? 'Elevated risk — review evidence carefully before queuing any scenario.' : 'Normal risk conditions. Review evidence for each queued symbol.'}`
                  : 'Loading regime context…'}
              </div>
            </div>
            <div style={{ background: 'var(--msp-card-2)', borderRadius: 'var(--msp-radius-control)', padding: '8px 12px', color: 'var(--msp-text-muted)', fontSize: 'var(--msp-text-body-sm)' }}>
              <div style={{ fontWeight: 500, color: 'var(--msp-text)', marginBottom: 4 }}>Today&apos;s research questions</div>
              <div>· Which symbols have the most aligned evidence?</div>
              <div>· What invalidates the top setup?</div>
              <div>· What does the volatility phase suggest?</div>
            </div>
            <a href="/tools/ai-analyst" style={{ display: 'block', background: 'var(--msp-card-2)', borderRadius: 'var(--msp-radius-control)', padding: '8px 12px', textAlign: 'center', fontSize: 'var(--msp-text-body-sm)', color: 'var(--msp-accent)', textDecoration: 'none', fontWeight: 500 }}>
              Open MSP Analyst ›
            </a>
          </div>
        </DSCard>
      </section>

      {/* ─── Dashboard Lens Rail ─── */}
      <div style={{ background: 'var(--msp-panel)', borderRadius: 'var(--msp-radius-card)', padding: '10px 12px' }}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <SectionEyebrow>Dashboard lens</SectionEyebrow>
            <div style={{ fontSize: 'var(--msp-text-body-sm)', color: 'var(--msp-text-muted)' }}>Switch between saved pages, live market desk, derivatives, and macro context.</div>
          </div>
        </div>
        <div role="tablist" aria-label="Dashboard lens" className="flex items-center gap-2 overflow-x-auto pb-0.5">
        {DASH_TABS.map(t => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={dashTab === t}
            onClick={() => setDashTab(t)}
            style={{
              flexShrink: 0,
              borderRadius: 'var(--msp-radius-pill)',
              padding: '6px 12px',
              fontSize: 'var(--msp-text-body-sm)',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              transition: 'background 120ms ease, color 120ms ease',
              background: dashTab === t ? 'var(--msp-accent-tint)' : 'transparent',
              color: dashTab === t ? 'var(--msp-accent)' : 'var(--msp-text-muted)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {t.toLowerCase().replace(/^./, c => c.toUpperCase())}
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
        <PanelHeader title="Top confluence now" eyebrow="Validated queue" action={<button type="button" onClick={() => navigateTo('scanner')} className="text-[11px] text-emerald-400 hover:underline">Full scanner ›</button>} />
        {[...cached.equity, ...cached.crypto].length === 0 ? (
          <div className="text-xs text-slate-500 py-4 text-center">
            No cached data yet — <button type="button" onClick={() => navigateTo('scanner')} className="text-emerald-400 hover:underline">run the Scanner</button>
          </div>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {[...cached.equity.slice(0, 3), ...cached.crypto.slice(0, 2)].map((r: CachedSymbol) => (
              <button key={r.symbol} type="button" aria-label={`Open Golden Egg for ${r.symbol}`} className="rounded-md bg-slate-950/30 px-2 py-1.5 text-xs text-left cursor-pointer hover:bg-emerald-400/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50" style={{ background: 'var(--msp-card-2)' }} onClick={() => openGoldenEgg(r.symbol)}>
                <div className="flex items-center justify-between gap-2">
                  <span style={{ fontWeight: 500, color: 'var(--msp-text)' }}>{r.symbol}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: r.changePct >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)', fontWeight: 500 }}>{r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2" style={{ fontSize: 11, color: 'var(--msp-text-muted)' }}>
                  <span style={{ color: directionColor(r.direction) }}>{r.direction === 'bullish' ? 'Bullish' : r.direction === 'bearish' ? 'Bearish' : 'Neutral'} · {r.score}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtPrice(r.price)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
      )}
      </div>

      {/* -- Magnificent 7 -------------------------------------------- */}
      <Card>
        <PanelHeader title="Magnificent 7" eyebrow="Mega-cap heatmap" action={<button type="button" onClick={() => navigateTo('scanner')} className="text-[11px] text-emerald-400 hover:underline">Scan all ›</button>} />
        {mag7Loading ? (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
            {MAG7_SYMBOLS.map(sym => <Skeleton key={sym} h="h-[5.5rem]" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
            {mag7.map(q => {
              const pct = q.changePercent;
              const bg = heatColor(pct);
              const noData = pct == null;
              return (
                <button
                  key={q.symbol}
                  type="button"
                  aria-label={`Open Golden Egg for ${q.symbol}`}
                  onClick={() => openGoldenEgg(q.symbol)}
                  onKeyDown={(e) => onSymbolRowKey(e, q.symbol)}
                  className="flex h-[5.5rem] flex-col items-center justify-center rounded-md px-1 text-center transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  style={{ background: bg, border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div style={{ fontSize: 'var(--msp-text-body)', fontWeight: 700, color: '#fff', letterSpacing: '0.01em' }}>{q.symbol}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#fff', marginTop: 2 }}>
                    {noData ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
                  </div>
                  <div style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
                    {noData ? 'No data' : q.price == null ? '' : fmtPrice(q.price)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* -- Major Indices -------------------------------------------- */}
      <Card>
        <PanelHeader title="Major indices" eyebrow="Index heatmap" action={<button type="button" onClick={() => navigateTo('research')} className="text-[11px] text-emerald-400 hover:underline">Markets ›</button>} />
        {indicesLoading ? (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
            {INDEX_PROXIES.map((i) => <Skeleton key={i.etf} h="h-[5.5rem]" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
            {indices.map((q) => {
              const meta = INDEX_PROXIES.find((i) => i.etf === q.symbol);
              const pct = q.changePercent;
              const noData = pct == null;
              const bg = heatColor(pct);
              return (
                <button
                  key={q.symbol}
                  type="button"
                  aria-label={`Open Golden Egg for ${meta?.label || q.symbol}`}
                  onClick={() => openGoldenEgg(q.symbol)}
                  onKeyDown={(e) => onSymbolRowKey(e, q.symbol)}
                  className="flex h-[5.5rem] flex-col items-center justify-center rounded-md px-1 text-center transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  style={{ background: bg, border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '0.01em' }}>{meta?.label || q.symbol}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#fff', marginTop: 2 }}>
                    {noData ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
                  </div>
                  <div style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
                    {noData ? 'No data' : `${q.symbol}${q.price == null ? '' : ` · ${fmtPrice(q.price)}`}`}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[10px] text-slate-600">Live ETF proxies (SPY/DIA/QQQ/IWM/VIXY) — index levels are end-of-day via Alpha Vantage.</p>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* -- Equity Movers -------------------------------------------- */}
        {movers.loading ? <CardSkeleton rows={5} /> : (
          <Card>
            <PanelHeader title="Equity movers" eyebrow="Live movement" />
            <div className="space-y-1">
              <div className="mb-1" style={{ fontSize: 'var(--msp-text-label)', color: 'var(--msp-text-muted)' }}>Gainers</div>
              {eqGainers.length === 0 ? (
                <div className="text-xs text-slate-500 py-1">No equity data</div>
              ) : eqGainers.slice(0, 4).map((m: Mover) => <MoverRow key={`eg-${m.ticker}`} mover={m} tone="up" onOpen={() => openGoldenEgg(m.ticker)} onKeyOpen={(e) => onSymbolRowKey(e, m.ticker)} />)}
              <div className="mb-1 mt-2" style={{ fontSize: 'var(--msp-text-label)', color: 'var(--msp-text-muted)' }}>Losers</div>
              {eqLosers.length === 0 ? (
                <div className="text-xs text-slate-500 py-1">No equity data</div>
              ) : eqLosers.slice(0, 4).map((m: Mover) => <MoverRow key={`el-${m.ticker}`} mover={m} tone="down" onOpen={() => openGoldenEgg(m.ticker)} onKeyOpen={(e) => onSymbolRowKey(e, m.ticker)} />)}
            </div>
          </Card>
        )}

        {/* -- Crypto Movers -------------------------------------------- */}
        {movers.loading ? <CardSkeleton rows={5} /> : (
          <Card>
            <PanelHeader title="Crypto movers" eyebrow="Live movement" />
            <div className="space-y-1">
              <div className="mb-1" style={{ fontSize: 'var(--msp-text-label)', color: 'var(--msp-text-muted)' }}>Gainers</div>
              {crGainers.length === 0 ? (
                <div className="text-xs text-slate-500 py-1">No crypto data</div>
              ) : crGainers.slice(0, 4).map((m: Mover) => <MoverRow key={`cg-${m.ticker}`} mover={m} tone="up" onOpen={() => openGoldenEgg(m.ticker)} onKeyOpen={(e) => onSymbolRowKey(e, m.ticker)} />)}
              <div className="mb-1 mt-2" style={{ fontSize: 'var(--msp-text-label)', color: 'var(--msp-text-muted)' }}>Losers</div>
              {crLosers.length === 0 ? (
                <div className="text-xs text-slate-500 py-1">No crypto data</div>
              ) : crLosers.slice(0, 4).map((m: Mover) => <MoverRow key={`cl-${m.ticker}`} mover={m} tone="down" onOpen={() => openGoldenEgg(m.ticker)} onKeyOpen={(e) => onSymbolRowKey(e, m.ticker)} />)}
            </div>
          </Card>
        )}

        {/* -- Economic Calendar ---------------------------------------- */}
        {calendar.loading ? <CardSkeleton rows={4} /> : (
          <Card>
            <PanelHeader title="Upcoming events" eyebrow="Calendar risk" />
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
          <PanelHeader title="Cross-market influence" eyebrow="Context map" />
          <div className="space-y-2">
            {CROSS_MARKET.slice(0, 5).map(cm => (
              <div key={cm.from} className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{cm.from} {cm.condition}</span>
                <span className="text-slate-500 text-right">{cm.effect}</span>
              </div>
            ))}
            <button type="button" onClick={() => navigateTo('explorer')} className="mt-1 block text-[11px] text-emerald-400 hover:underline">Market Explorer &#x203A;</button>
          </div>
          <p className="mt-2 text-[10px] text-slate-600">Educational context only — static heuristics, not live readings.</p>
        </Card>
      </div>

      {/* -- Latest News ------------------------------------------------ */}
      {news.loading ? <CardSkeleton rows={4} /> : (
        <Card>
          <PanelHeader title="Latest headlines" eyebrow="News context" action={<button type="button" onClick={() => navigateTo('research')} className="text-[11px] text-emerald-400 hover:underline">All news ›</button>} />
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
