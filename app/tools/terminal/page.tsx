'use client';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/* ---------------------------------------------------------------------------
   SURFACE 7: TERMINAL — Charts + Close Calendar + Options Chain + Flow
   Real APIs: /api/confluence-scan (POST), /api/flow, TradingView embed
   --------------------------------------------------------------------------- */

import { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { optionsEntrySymbol } from '@/lib/options/journey';
import { useSearchParams, useRouter } from 'next/navigation';
import { useV2 } from '@/app/v2/_lib/V2Context';
import { useUserTier } from '@/lib/useUserTier';
import { isPaidTier } from '@/lib/tiers';
import { useCachedTopSymbols } from '@/hooks/useCachedTopSymbols';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import { detectMarketPath, type MarketPath } from '@/lib/terminal/marketPath';
import CapitalPressureView from '@/components/terminal/CapitalPressureView';
import TerminalCryptoDesk from '@/components/terminal/TerminalCryptoDesk';
import { hasCommoditySessionMap } from '@/lib/terminal/futures/cashBridgeMap';
import { futuresScheduleRangeSummary, terminalHorizonLabel } from '@/lib/terminal/horizonChip';

const OptionsTerminalView = dynamic(() => import('@/components/options-terminal/OptionsTerminalView'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500">Loading Options Terminal…</div> });
const CryptoTerminalView = dynamic(() => import('@/components/crypto-terminal/CryptoTerminalView'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500">Loading Crypto Terminal…</div> });
const FuturesTerminalPanel = dynamic(() => import('@/components/terminal/futures/FuturesTerminalPanel'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500">Loading Futures Terminal…</div> });
const OptionsConfluence = dynamic(() => import('@/components/options-terminal/OptionsConfluenceScanner'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Options Confluence…</div> });
const OptionsFlow = dynamic(() => import('@/components/options-terminal/OptionsFlowView'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Options Flow…</div> });
const TimeScanner = dynamic(() => import('@/app/tools/time-scanner/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Time Gravity…</div> });
const ConfluenceScanner = dynamic(() => import('@/app/tools/confluence-scanner/page'), { ssr: false, loading: () => <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading Time Confluence Scanner…</div> });
import {
  useCloseCalendar,
  useFlow,
  useFuturesTerminal,
  type CloseCalendarAnchor,
  type FuturesAnchorMode,
  type ForwardCloseScheduleRow,
  type ForwardCloseCluster,
  type ForwardCloseCalendar,
} from '@/app/v2/_lib/api';
import { Card, Badge, UpgradeGate } from '@/app/v2/_components/ui';
import { PageHero } from '@/components/ui';
import CollapsibleSection from '@/components/visual/CollapsibleSection';

function Skel({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-slate-700/50 rounded animate-pulse`} />;
}

function TerminalMetric({ label, value, tone = 'var(--msp-text)', detail }: { label: string; value: string; tone?: string; detail: string }) {
  return (
    <div className="min-h-[3.1rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
      <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-black" style={{ color: tone }} title={value}>{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-slate-500" title={detail}>{detail}</div>
    </div>
  );
}

const TABS = [
  'Close Calendar',
  'Options Terminal',
  'Options Confluence',
  'Options Flow',
  'Crypto',
  'Futures Session',
  'Cash Bridge',
  'Commodity Session Map',
  'Liquidity & Volume',
  'Capital Pressure',
  'Time Gravity',
  'Time Confluence',
] as const;
type TerminalTab = typeof TABS[number];

const TERMINAL_TAB_PARAM_MAP: Record<string, TerminalTab> = {
  close: 'Close Calendar',
  calendar: 'Close Calendar',
  options: 'Options Terminal',
  'options-terminal': 'Options Terminal',
  confluence: 'Options Confluence',
  'options-confluence': 'Options Confluence',
  flow: 'Options Flow',
  'options-flow': 'Options Flow',
  crypto: 'Crypto',
  'crypto-terminal': 'Crypto',
  capital: 'Capital Pressure',
  futures: 'Futures Session',
  session: 'Futures Session',
  bridge: 'Cash Bridge',
  liquidity: 'Liquidity & Volume',
  gravity: 'Time Gravity',
  'time-gravity': 'Time Gravity',
  time: 'Time Confluence',
  'time-scanner': 'Time Confluence',
  'time-confluence': 'Time Confluence',
};

const TERMINAL_TAB_META: Record<TerminalTab, { eyebrow: string; description: string }> = {
  'Close Calendar': {
    eyebrow: '1. Timing map',
    description: 'Find candle-close clusters and session pressure before checking positioning.',
  },
  'Options Terminal': {
    eyebrow: '2. Chain quality',
    description: 'Inspect strikes, spreads, open interest, IV, and chain data truth.',
  },
  'Options Confluence': {
    eyebrow: '3. Options setup',
    description: 'Check strike and expiry alignment against the selected research scenario.',
  },
  'Options Flow': {
    eyebrow: '4. Flow estimate',
    description: 'Review premium-flow classification, skew, and large-flow estimates.',
  },
  Crypto: {
    eyebrow: '2. Derivatives map',
    description: 'Inspect funding, open interest, liquidations, exchanges, and stablecoin context.',
  },
  'Futures Session': {
    eyebrow: '2. Futures session map',
    description: 'Track Globex, pre-RTH, RTH, post-RTH, and maintenance break transitions.',
  },
  'Cash Bridge': {
    eyebrow: '3. Cash bridge',
    description: 'Map futures, ETF, and cash-index timing alignment.',
  },
  'Commodity Session Map': {
    eyebrow: '3. Commodity session map',
    description: 'Use commodity-specific session context when no cash-index bridge exists.',
  },
  'Liquidity & Volume': {
    eyebrow: '4. Liquidity and volume',
    description: 'Compare RTH and overnight participation context.',
  },
  'Capital Pressure': {
    eyebrow: '5. Capital pressure',
    description: 'Read flow, gamma, liquidity, and session context together.',
  },
  'Time Gravity': {
    eyebrow: '6. Gravity map',
    description: 'Locate decompression windows, midpoint debt, and gravity zones.',
  },
  'Time Confluence': {
    eyebrow: '7. Final timing check',
    description: 'Combine timing, pressure, close calendar, and macro/fib confluence.',
  },
};

function visibleTabsForPath(marketPath: MarketPath, commodityFutures: boolean): TerminalTab[] {
  if (marketPath === 'crypto') {
    return ['Close Calendar', 'Crypto', 'Capital Pressure', 'Time Gravity', 'Time Confluence'];
  }
  if (marketPath === 'futures') {
    return [
      'Close Calendar',
      'Futures Session',
      commodityFutures ? 'Commodity Session Map' : 'Cash Bridge',
      'Liquidity & Volume',
      'Capital Pressure',
      'Time Gravity',
      'Time Confluence',
    ];
  }
  return ['Close Calendar', 'Options Terminal', 'Options Confluence', 'Options Flow', 'Capital Pressure', 'Time Gravity', 'Time Confluence'];
}

function TerminalTabRail({
  activeTab,
  marketPath,
  commodityFutures,
  onSelectTab,
}: {
  activeTab: TerminalTab;
  marketPath: MarketPath;
  commodityFutures: boolean;
  onSelectTab: (tab: TerminalTab) => void;
}) {
  const visibleTabs = visibleTabsForPath(marketPath, commodityFutures);
  const pathLabel = marketPath === 'crypto' ? 'Crypto path' : marketPath === 'futures' ? 'Futures path' : 'Equity path';

  return (
    <details className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2" aria-label="Terminal market mechanics views">
      <summary className="min-h-10 cursor-pointer py-2 text-sm text-slate-200">{activeTab} · Change view</summary>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-emerald-300">Mechanics workbench</div>
          <div className="text-[0.72rem] text-slate-500">Timing first, then positioning, flow, and final confluence before Backtest.</div>
        </div>
        <div className="rounded-md border border-slate-700/70 bg-slate-950/60 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-500">
          {pathLabel}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
        {visibleTabs.map((terminalTab) => {
          const meta = TERMINAL_TAB_META[terminalTab];
          const isActive = activeTab === terminalTab;
          return (
            <button
              key={terminalTab}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectTab(terminalTab)}
              className={`rounded-md border px-3 py-1.5 text-left transition ${
                isActive
                  ? 'border-emerald-400/40 bg-emerald-400/10 text-white'
                  : 'border-white/10 bg-white/[0.025] text-slate-300 hover:border-emerald-400/30 hover:bg-emerald-400/[0.05]'
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{meta.eyebrow}</div>
              <div className={`mt-0.5 text-sm font-black ${isActive ? 'text-emerald-200' : 'text-white'}`}>{terminalTab}</div>
            </button>
          );
        })}
      </div>
    </details>
  );
}

function TerminalSubviewFrame({
  tab,
  symbol,
  marketPath,
  commodityFutures,
  timeframe,
  onSelectTab,
  children,
}: {
  tab: Exclude<TerminalTab, 'Close Calendar'>;
  symbol: string;
  marketPath: MarketPath;
  commodityFutures: boolean;
  timeframe?: string;
  onSelectTab: (tab: TerminalTab) => void;
  children: React.ReactNode;
}) {
  // Each subview owns its measured state; the page supplies the only Terminal hero.
  return <div className="min-w-0 space-y-3">{children}</div>;
}

const ANCHOR_OPTIONS: { value: CloseCalendarAnchor; label: string }[] = [
  { value: 'NOW', label: 'Now' },
  { value: 'TODAY', label: 'Today' },
  { value: 'PRIOR_DAY', label: 'Prior Day' },
  { value: 'EOW', label: 'End of Week' },
  { value: 'EOM', label: 'End of Month' },
];
const HORIZON_OPTIONS = [1, 3, 7, 14, 30] as const;
const FUTURES_ANCHOR_LABEL: Record<FuturesAnchorMode, string> = {
  globex: 'Globex',
  rth: 'Regular hours',
  cash_bridge: 'Cash bridge',
};

/* --- Close Calendar helpers --------------------------------------- */

function marketPathToLegacyAsset(path: MarketPath): 'crypto' | 'equity' {
  return path === 'crypto' ? 'crypto' : 'equity';
}

function readableCalDate(iso: string | null | undefined, asset: 'crypto' | 'equity'): string | null {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return null;
  try {
    return formatCalDate(iso, asset);
  } catch {
    return null;
  }
}

function formatCalDate(iso: string, asset: 'crypto' | 'equity'): string {
  const d = new Date(iso);
  const tz = asset === 'crypto' ? 'UTC' : 'America/New_York';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const v = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const tzLabel = asset === 'crypto' ? 'UTC' : new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? 'ET';
  return `${v('weekday')} ${v('month')} ${v('day')} ${v('hour')}:${v('minute')} ${tzLabel}`;
}

function fmtMins(m: number | null): string {
  if (m === null) return 'Not collected';
  if (m <= 0) return 'NOW';
  if (m < 60) return `${Math.round(m)}m`;
  if (m < 1440) { const h = Math.floor(m/60); const r = Math.round(m%60); return r > 0 ? `${h}h ${r}m` : `${h}h`; }
  const d = Math.floor(m/1440); const h = Math.round((m%1440)/60);
  if (d >= 30) return `${Math.round(d/30)}mo`;
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

function catColor(c: string) {
  switch(c){ case 'intraday': return 'text-slate-500'; case 'daily': return 'text-cyan-400'; case 'weekly': return 'text-emerald-400'; case 'monthly': return 'text-amber-400'; case 'yearly': return 'text-rose-400'; default: return 'text-slate-400'; }
}
function catBg(c: string) {
  switch(c){ case 'intraday': return 'bg-slate-800'; case 'daily': return 'bg-cyan-500/10'; case 'weekly': return 'bg-emerald-500/10'; case 'monthly': return 'bg-amber-500/10'; case 'yearly': return 'bg-rose-500/10'; default: return ''; }
}
function clusterColors(s: number) {
  if (s >= 70) return 'border-emerald-500/40 bg-emerald-500/10';
  if (s >= 40) return 'border-amber-500/40 bg-amber-500/10';
  return 'border-slate-700 bg-slate-900/30';
}

export default function TerminalPage() {
  const { tier } = useUserTier();
  const { selectedSymbol, selectSymbol } = useV2();
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedExpiry = searchParams.get('expiry') || '';
  const selectTab = (next:TerminalTab) => {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    const slug = Object.entries(TERMINAL_TAB_PARAM_MAP).find(([,value])=>value===next)?.[0];
    if(slug) params.set('tab',slug);
    router.replace(`/tools/terminal?${params}`,{scroll:false});
  };
  const requestedType = searchParams.get('type')?.toLowerCase();
  const requestedTimeframe = searchParams.get('timeframe') || '';
  const requestedSymbol = searchParams.get('symbol')?.trim().toUpperCase() || '';
  const requestedInitialTab = TERMINAL_TAB_PARAM_MAP[(searchParams.get('tab') || '').toLowerCase()]
    || (requestedType === 'crypto' ? 'Crypto' : 'Close Calendar');
  const [tab, setTab] = useState<TerminalTab>(requestedInitialTab);
  useDocumentTitle(tab);
  const entrySymbol = optionsEntrySymbol((searchParams.get('tab') || '').toLowerCase(),requestedSymbol,requestedType || '',selectedSymbol || '');
  const [symInput, setSymInput] = useState(entrySymbol);
  const [cryptoTerminalState, setCryptoTerminalState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  /* Symbol management */
  const sym = requestedSymbol || (['Options Terminal','Options Confluence','Options Flow'].includes(requestedInitialTab) && !requestedType ? entrySymbol : selectedSymbol || symInput || 'BTCUSD');
  const marketPath: MarketPath = requestedType === 'crypto'
    ? 'crypto'
    : requestedType === 'equity'
      ? 'equity'
      : detectMarketPath(sym);
  const commodityFutures = marketPath === 'futures' && hasCommoditySessionMap(sym);
  const asset = marketPathToLegacyAsset(marketPath);
  const flowMarketType = marketPath === 'futures' ? 'futures' : marketPath;
  const visibleTabs = visibleTabsForPath(marketPath, commodityFutures);

  const FUTURES_QUICK = ['/ES', '/NQ', '/YM', '/RTY', '/CL', '/GC', '/SI', '/M2K', '/MES', '/MNQ', '/MCL', '/MGC'];
  const fallbackCryptoQuick = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'];
  const fallbackEquityQuick = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN'];

  useEffect(() => {
    const urlSymbol = searchParams.get('symbol')?.trim().toUpperCase();
    if (urlSymbol) {
      setSymInput(urlSymbol);
    }
    const urlType = searchParams.get('type')?.toLowerCase();
    const requestedTab = TERMINAL_TAB_PARAM_MAP[(searchParams.get('tab') || '').toLowerCase()]
      || (urlType === 'crypto' ? 'Crypto' : undefined);
    if (requestedTab) setTab(requestedTab);
    // Only re-sync when the URL tab param changes; including `tab` here would force
    // user clicks back to the URL value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /* Keep current tab aligned with active market path.
     Deep links to options tabs must not be silently reset by a stale crypto symbol. */
  useEffect(() => {
    // A tab can change; an explicitly selected instrument must never be replaced.
    if (!visibleTabs.includes(tab)) {
      setTab(visibleTabs[0]);
    }
  }, [tab, marketPath, visibleTabs, selectSymbol]);

  const handleSymSubmit = () => {
    const s = symInput.trim().toUpperCase();
    // Detect the path from the NEW symbol; the current page's path must not carry over (RS-24).
    if (s) { selectSymbol(s, { assetType: detectMarketPath(s) }); }
  };

  /* Quick symbols */
  const cached = useCachedTopSymbols(5);
  const quickCrypto = useMemo(
    () => (cached.crypto.length > 0 ? cached.crypto.map((c) => c.symbol).slice(0, 8) : fallbackCryptoQuick),
    [cached.crypto],
  );
  const quickEquity = useMemo(
    () => (cached.equity.length > 0 ? cached.equity.map((c) => c.symbol).slice(0, 8) : fallbackEquityQuick),
    [cached.equity],
  );

  /* Close Calendar state */
  const [anchor, setAnchor] = useState<CloseCalendarAnchor>('TODAY');
  const [horizon, setHorizon] = useState(1);
  const [futuresAnchorMode, setFuturesAnchorMode] = useState<FuturesAnchorMode>('globex');
  const [calFilter, setCalFilter] = useState<'all'|'daily'|'weekly'|'monthly'|'yearly'>('all');
  const [showAnchorDay, setShowAnchorDay] = useState(true);
  const calendar = useCloseCalendar(sym, anchor, horizon);
  const futuresTerminal = useFuturesTerminal(marketPath === 'futures' ? sym : null, futuresAnchorMode, horizon);
  const calData = calendar.data as ForwardCloseCalendar | null;
  const horizonLabel = calData ? terminalHorizonLabel(calData.horizonDays, readableCalDate(calData.horizonEndISO, asset)) : null;

  const isPriorDay = anchor === 'PRIOR_DAY';
  const isEquity = asset === 'equity';

  const stripIntraday = (rows: ForwardCloseScheduleRow[]) => isEquity ? rows.filter(r => r.category !== 'intraday') : rows;
  const filteredSchedule = stripIntraday(calData?.schedule.filter(r => calFilter === 'all' || r.category === calFilter) ?? []);
  const anchorDayRows = stripIntraday(calData?.closesOnAnchorDay ?? []);

  useEffect(() => { if (anchor === 'PRIOR_DAY') setShowAnchorDay(true); }, [anchor]);

  /* Flow */
  const flow = useFlow(sym, flowMarketType);
  const activeMeta = TERMINAL_TAB_META[tab];
  const quickSymbolRows = (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-20 text-[10px] font-bold uppercase tracking-[0.1em] text-cyan-300">Futures</span>
        {FUTURES_QUICK.map((s) => (
          <button key={s} type="button" aria-pressed={sym === s} onClick={() => { selectSymbol(s, { assetType: 'futures' }); setSymInput(s); }} className={`px-2 py-1 text-[11px] rounded border transition-colors ${sym === s ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30' : 'text-slate-500 border-slate-800 hover:text-slate-300'}`}>
            {s}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-20 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-300">Crypto</span>
        {quickCrypto.map((s) => (
          <button key={s} type="button" aria-pressed={sym === s} onClick={() => { selectSymbol(s, { assetType: 'crypto' }); setSymInput(s); }} className={`px-2 py-1 text-[11px] rounded border transition-colors ${sym === s ? 'bg-amber-500/20 text-amber-200 border-amber-500/30' : 'text-slate-500 border-slate-800 hover:text-slate-300'}`}>
            {s}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-20 text-[10px] font-bold uppercase tracking-[0.1em] text-indigo-300">Equity</span>
        {quickEquity.map((s) => (
          <button key={s} type="button" aria-pressed={sym === s} onClick={() => { selectSymbol(s, { assetType: 'equity' }); setSymInput(s); }} className={`px-2 py-1 text-[11px] rounded border transition-colors ${sym === s ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/30' : 'text-slate-500 border-slate-800 hover:text-slate-300'}`}>
            {s}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3">
      <div className={tab === 'Options Flow' ? 'order-last' : undefined}><ComplianceDisclaimer compact variant={asset === 'crypto' ? 'cryptoDerivatives' : 'options'} /></div>

      <PageHero
        ariaLabel="Terminal command header"
        eyebrow="Workflow step 3 · Market mechanics check"
        badges={[{ label: activeMeta.eyebrow }]}
        title="Terminal"
        subtitle="Symbol checks the setup. Terminal shows timing and market mechanics."
        actions={[
          { label: 'Back to Symbol', variant: 'primary', href: `/tools/golden-egg?symbol=${encodeURIComponent(sym)}&type=${marketPath}${requestedTimeframe ? `&timeframe=${encodeURIComponent(requestedTimeframe)}` : ''}` },
          { label: 'Continue to Backtest', variant: 'secondary', href: `/tools/workspace?tab=backtest&symbol=${encodeURIComponent(sym)}&type=${marketPath}${requestedTimeframe ? `&timeframe=${encodeURIComponent(requestedTimeframe)}` : ''}` },
          { label: 'All tools', variant: 'ghost', href: '/tools' },
        ]}

      />

      {/* One shared symbol picker for all subviews. */}
      <Card>
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={symInput}
              onChange={e => setSymInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleSymSubmit()}
              placeholder="Symbol..."
              aria-label="Terminal symbol"
              className="w-28 bg-[#0A101C] border border-[var(--msp-border)] rounded-lg text-xs px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-600/40 font-mono"
            />
            <button type="button" onClick={handleSymSubmit} className="px-3 py-2 text-xs rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors">
              Load
            </button>
            <span className="text-xs text-slate-400 ml-1">{sym}</span>

          </div>

          <details className="rounded-md border border-slate-800">
            <summary className="min-h-10 cursor-pointer list-none px-2 py-2 text-xs text-slate-300">More symbols</summary>
            <div className="space-y-1 px-2 pb-2">{quickSymbolRows}</div>
          </details>
        </div>
      </Card>

      <div>
        <TerminalTabRail activeTab={tab} marketPath={marketPath} commodityFutures={commodityFutures} onSelectTab={selectTab} />
      </div>

      {/* -- CLOSE CALENDAR ------------------------------------------- */}
      {tab === 'Close Calendar' && (marketPath === 'futures' ? (
        <div className="min-w-0 space-y-3">
          <CollapsibleSection title="Schedule range" summary={futuresScheduleRangeSummary(horizon, FUTURES_ANCHOR_LABEL[futuresAnchorMode])}>
            <div className="flex min-w-0 flex-wrap items-end gap-3">
              <div className="min-w-0">
                <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">Anchor</div>
                <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold text-cyan-200">Today</div>
              </div>
              <div className="min-w-0">
                <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">Horizon</div>
                <div className="flex flex-wrap gap-1">
                  {HORIZON_OPTIONS.map((d) => (
                    <button key={d} type="button" aria-pressed={horizon === d} onClick={() => setHorizon(d)} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 ${horizon === d ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-slate-950/40 text-slate-400 border border-slate-800 hover:text-slate-200'}`}>
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-w-0">
                <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">Schedule basis</div>
                <div className="flex flex-wrap gap-1">
                  {(['globex', 'rth', 'cash_bridge'] as const).map((mode) => (
                    <button key={mode} type="button" aria-pressed={futuresAnchorMode === mode} onClick={() => setFuturesAnchorMode(mode)} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${futuresAnchorMode === mode ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-950/40 text-slate-400 border border-slate-800 hover:text-slate-200'}`}>
                      {FUTURES_ANCHOR_LABEL[mode]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CollapsibleSection>
          <FuturesTerminalPanel
            data={futuresTerminal.data}
            loading={futuresTerminal.loading}
            error={futuresTerminal.error}
            tab="Close Calendar"
            symbol={sym}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Controls */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">
                  {isPriorDay ? 'Close Calendar · Prior Day Closes' : 'Close Calendar · Forward Schedule'}
                </div>
                <div className="text-xs text-slate-400">
                  {isPriorDay
                    ? `Which timeframes closed on the most recent ${isEquity ? 'trading' : 'calendar'} day?`
                    : 'Which timeframes close on your target day? Where do closes stack?'}
                </div>
              </div>
              <button type="button" onClick={() => calendar.refetch()} disabled={calendar.loading} className="rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1.5 text-xs font-semibold text-slate-100 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50">
                {calendar.loading ? 'Loading…' : '↻ Refresh'}
              </button>
            </div>

            {/* Anchor selector */}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-slate-500">Anchor</label>
                <div className="flex gap-1 overflow-x-auto">
                  {ANCHOR_OPTIONS.map(o => (
                    <button key={o.value} type="button" aria-pressed={anchor === o.value} onClick={() => setAnchor(o.value)} className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${anchor === o.value ? 'bg-[rgba(16,185,129,0.1)] text-[var(--msp-accent)] border border-[rgba(16,185,129,0.4)]' : 'bg-[var(--msp-panel-2)] text-[var(--msp-text-muted)] border border-[var(--msp-border)] hover:text-slate-200'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {!isPriorDay && (
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wider text-slate-500">Horizon</label>
                  <div className="flex gap-1">
                    {HORIZON_OPTIONS.map(d => (
                      <button key={d} type="button" aria-pressed={horizon === d} onClick={() => setHorizon(d)} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 ${horizon === d ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'bg-slate-950/40 text-slate-400 border border-slate-800 hover:text-slate-200'}`}>
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {calendar.error && <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{calendar.error}</div>}

          {calendar.loading && !calData && (
            <Card><div className="py-8 text-center text-xs text-slate-500">Computing forward close schedule…</div></Card>
          )}

          {calData && (
            <>
              {/* Anchor info strip */}
              <Card>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <span className="text-slate-400">{isPriorDay ? 'Prior Day' : 'Anchor'}: <span className="font-semibold text-slate-200">{formatCalDate(calData.anchorTimeISO, asset)}</span></span>
                  {!isPriorDay && horizonLabel && <span className="text-slate-400">Horizon: <span className="font-semibold text-slate-200">{horizonLabel}</span></span>}
                  <span className="text-slate-400">Daily+ closes: <span className="font-semibold text-emerald-400">{calData.totalCloseEventsInHorizon}</span></span>
                </div>
              </Card>

              {/* Close Cluster Timeline */}
              {calData.forwardClusters.length > 0 && (
                <Card>
                  <div className="mb-2 text-xs font-semibold text-slate-300">Close Cluster Timeline</div>
                  <div className="flex flex-wrap gap-2">
                    {calData.forwardClusters.slice(0, 8).map((cluster, i) => (
                      <div key={i} className={`rounded-xl border px-3 py-2 transition-all ${clusterColors(cluster.clusterScore)}`}>
                        <div className="text-[11px] font-semibold text-slate-100">{cluster.label}</div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {cluster.tfs.map(tf => (<span key={tf} className="rounded bg-slate-800/60 px-1.5 py-0.5 text-[11px] font-semibold text-slate-200">{tf}</span>))}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">Wt {Math.round(cluster.weight)} · Score {cluster.clusterScore}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Toggle anchor day vs full schedule */}
              <div className="flex items-center gap-2 px-1">
                <button type="button" aria-pressed={showAnchorDay} onClick={() => setShowAnchorDay(true)} className={`rounded-lg px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${showAnchorDay ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}>
                  {isPriorDay ? 'Prior Day Closes' : 'Closes on Anchor Day'} ({anchorDayRows.length})
                </button>
                {!isPriorDay && (
                  <button type="button" aria-pressed={!showAnchorDay} onClick={() => setShowAnchorDay(false)} className={`rounded-lg px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 ${!showAnchorDay ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}>
                    Full Schedule ({filteredSchedule.length})
                  </button>
                )}
                {!showAnchorDay && (
                  <div className="ml-auto flex gap-1">
                    {(['all','daily','weekly','monthly','yearly'] as const).map(f => (
                      <button key={f} type="button" aria-pressed={calFilter === f} onClick={() => setCalFilter(f)} className={`rounded px-2 py-1 text-[11px] font-medium uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50 ${calFilter === f ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Schedule table */}
              <Card>
                {showAnchorDay ? (
                  <AnchorDayTable rows={anchorDayRows} asset={asset} />
                ) : (
                  <FullScheduleTable rows={filteredSchedule} asset={asset} />
                )}
              </Card>
            </>
          )}
        </div>
      ))}

      {tab === 'Futures Session' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Futures Session Map">
          <TerminalSubviewFrame tab="Futures Session" symbol={sym} marketPath={marketPath} commodityFutures={commodityFutures} timeframe={requestedTimeframe || undefined} onSelectTab={selectTab}>
            <FuturesTerminalPanel
              data={futuresTerminal.data}
              loading={futuresTerminal.loading}
              error={futuresTerminal.error}
              tab="Futures Session"
              symbol={sym}
            />
          </TerminalSubviewFrame>
        </UpgradeGate>
      )}

      {tab === 'Cash Bridge' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Cash Bridge Map">
          <TerminalSubviewFrame tab="Cash Bridge" symbol={sym} marketPath={marketPath} commodityFutures={commodityFutures} timeframe={requestedTimeframe || undefined} onSelectTab={selectTab}>
            <FuturesTerminalPanel
              data={futuresTerminal.data}
              loading={futuresTerminal.loading}
              error={futuresTerminal.error}
              tab="Cash Bridge"
              symbol={sym}
            />
          </TerminalSubviewFrame>
        </UpgradeGate>
      )}

      {tab === 'Commodity Session Map' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Commodity Session Map">
          <TerminalSubviewFrame tab="Commodity Session Map" symbol={sym} marketPath={marketPath} commodityFutures={commodityFutures} timeframe={requestedTimeframe || undefined} onSelectTab={selectTab}>
            <FuturesTerminalPanel
              data={futuresTerminal.data}
              loading={futuresTerminal.loading}
              error={futuresTerminal.error}
              tab="Commodity Session Map"
              symbol={sym}
            />
          </TerminalSubviewFrame>
        </UpgradeGate>
      )}

      {tab === 'Liquidity & Volume' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Futures Liquidity and Volume">
          <TerminalSubviewFrame tab="Liquidity & Volume" symbol={sym} marketPath={marketPath} commodityFutures={commodityFutures} timeframe={requestedTimeframe || undefined} onSelectTab={selectTab}>
            <FuturesTerminalPanel
              data={futuresTerminal.data}
              loading={futuresTerminal.loading}
              error={futuresTerminal.error}
              tab="Liquidity & Volume"
              symbol={sym}
            />
          </TerminalSubviewFrame>
        </UpgradeGate>
      )}

      {/* -- OPTIONS TERMINAL ----------------------------------------------- */}
      {tab === 'Options Terminal' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Options Terminal">
          <TerminalSubviewFrame tab="Options Terminal" symbol={sym} marketPath={marketPath} commodityFutures={commodityFutures} timeframe={requestedTimeframe || undefined} onSelectTab={selectTab}>
            <Suspense fallback={<div className="py-12 text-center text-xs text-slate-500">Loading Options Terminal…</div>}>
              <OptionsTerminalView symbol={sym} />
            </Suspense>
          </TerminalSubviewFrame>
        </UpgradeGate>
      )}

      {/* -- CRYPTO TERMINAL ------------------------------------------------ */}
      {tab === 'Crypto' && (
        <TerminalSubviewFrame tab="Crypto" symbol={sym} marketPath={marketPath} commodityFutures={commodityFutures} timeframe={requestedTimeframe || undefined} onSelectTab={selectTab}>
          <TerminalCryptoDesk symbol={sym} />
          <a className="mt-3 inline-flex min-h-10 items-center text-sm text-emerald-300 underline" href="/tools/crypto-dashboard">Open market-wide crypto derivatives</a>
        </TerminalSubviewFrame>
      )}
      {/* -- FLOW ----------------------------------------------------- */}
      {tab === 'Capital Pressure' && (
        !isPaidTier(tier) ? <UpgradeGate requiredTier="pro" currentTier={tier} feature="Capital Flow Analysis"><div className="py-12" /></UpgradeGate> :
        <TerminalSubviewFrame tab="Capital Pressure" symbol={sym} marketPath={marketPath} commodityFutures={commodityFutures} timeframe={requestedTimeframe || undefined} onSelectTab={selectTab}>
          <CapitalPressureView symbol={sym} data={flow.data} loading={flow.loading} error={flow.error} onRefresh={() => flow.refetch()} />
        </TerminalSubviewFrame>
      )}

      {/* ─── Options Confluence (v1 flagship decision engine) ─── */}
      {tab === 'Options Confluence' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Options Confluence Engine">
          <TerminalSubviewFrame tab="Options Confluence" symbol={sym} marketPath={marketPath} commodityFutures={commodityFutures} timeframe={requestedTimeframe || undefined} onSelectTab={selectTab}>
            <OptionsConfluence embeddedInTerminal symbol={sym} timeframe={requestedTimeframe} expiry={requestedExpiry} />
          </TerminalSubviewFrame>
        </UpgradeGate>
      )}

      {/* ─── Options Flow (v1 flow intelligence) ─── */}
      {tab === 'Options Flow' && (
        <TerminalSubviewFrame tab="Options Flow" symbol={sym} marketPath={marketPath} commodityFutures={commodityFutures} timeframe={requestedTimeframe || undefined} onSelectTab={selectTab}>
          <OptionsFlow embeddedInTerminal symbol={sym} expiry={requestedExpiry} />
        </TerminalSubviewFrame>
      )}

      {/* ─── Time Gravity Map (v1 time scanner) ─── */}
      {tab === 'Time Gravity' && (
        <UpgradeGate requiredTier="pro" currentTier={tier} feature="Time Gravity Map">
          <TerminalSubviewFrame tab="Time Gravity" symbol={sym} marketPath={marketPath} commodityFutures={commodityFutures} timeframe={requestedTimeframe || undefined} onSelectTab={selectTab}>
            <TimeScanner key={`${asset}:${sym}`} symbol={sym} assetType={asset} embeddedInTerminal />
          </TerminalSubviewFrame>
        </UpgradeGate>
      )}

      {/* ─── Time Confluence Scanner ─── */}
      {tab === 'Time Confluence' && (
        <TerminalSubviewFrame tab="Time Confluence" symbol={sym} marketPath={marketPath} commodityFutures={commodityFutures} timeframe={requestedTimeframe || undefined} onSelectTab={selectTab}>
          <ConfluenceScanner key={`${asset}:${sym}:${requestedTimeframe}`} symbol={sym} assetType={asset} timeframe={requestedTimeframe} embeddedInTerminal />
        </TerminalSubviewFrame>
      )}
    </div>
  );
}

/* ??????????????????????????????????????????????????????????????????? */
/*  Sub-components                                                      */
/* ??????????????????????????????????????????????????????????????????? */

function AnchorDayTable({ rows, asset }: { rows: ForwardCloseScheduleRow[]; asset: 'crypto' | 'equity' }) {
  if (rows.length === 0) return <div className="py-6 text-center text-xs text-slate-500">No daily+ timeframes close on the anchor day.</div>;

  const groups = new Map<string, ForwardCloseScheduleRow[]>();
  for (const r of rows) { if (!groups.has(r.category)) groups.set(r.category, []); groups.get(r.category)!.push(r); }
  const catOrder = ['intraday', 'daily', 'weekly', 'monthly', 'yearly'];

  return (
    <div className="space-y-3">
      {catOrder.map(cat => {
        const catRows = groups.get(cat);
        if (!catRows?.length) return null;
        return (
          <div key={cat}>
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${catColor(cat)}`}>{cat}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
                  <th scope="col" className="pb-1.5 pr-3 font-medium">TF</th>
                  <th scope="col" className="pb-1.5 pr-3 font-medium">Close Time</th>
                  <th scope="col" className="pb-1.5 pr-3 font-medium">In</th>
                  <th scope="col" className="pb-1.5 font-medium">Weight</th>
                </tr></thead>
                <tbody>{catRows.map(row => (
                  <tr key={row.tf} className={`border-b border-slate-800/50 ${catBg(cat)}`}>
                    <td className={`py-1.5 pr-3 font-semibold ${catColor(cat)}`}>{row.tf}</td>
                    <td className="py-1.5 pr-3 font-mono text-slate-300">{row.firstCloseAtISO ? formatCalDate(row.firstCloseAtISO, asset) : 'Not collected'}</td>
                    <td className="py-1.5 pr-3 font-mono text-slate-400">{fmtMins(row.minsToFirstClose)}</td>
                    <td className="py-1.5 text-slate-500">{row.weight}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FullScheduleTable({ rows, asset }: { rows: ForwardCloseScheduleRow[]; asset: 'crypto' | 'equity' }) {
  if (rows.length === 0) return <div className="py-6 text-center text-xs text-slate-500">No closes in selected range.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs" style={{ minWidth: 600 }}>
        <thead><tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
          <th scope="col" className="pb-1.5 pr-3 font-medium">TF</th>
          <th scope="col" className="pb-1.5 pr-3 font-medium">Category</th>
          <th scope="col" className="pb-1.5 pr-3 font-medium">Next Close</th>
          <th scope="col" className="pb-1.5 pr-3 font-medium">In</th>
          <th scope="col" className="pb-1.5 pr-3 font-medium">Closes</th>
          <th scope="col" className="pb-1.5 pr-3 font-medium">Anchor Day</th>
          <th scope="col" className="pb-1.5 font-medium">Weight</th>
        </tr></thead>
        <tbody>{rows.map(row => (
          <tr key={row.tf} className={`border-b border-slate-800/50 ${row.closesOnAnchorDay ? catBg(row.category) : ''}`}>
            <td className={`py-1.5 pr-3 font-semibold ${catColor(row.category)}`}>{row.tf}</td>
            <td className="py-1.5 pr-3"><span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium uppercase ${catBg(row.category)} ${catColor(row.category)}`}>{row.category}</span></td>
            <td className="py-1.5 pr-3 font-mono text-slate-300">{row.firstCloseAtISO ? formatCalDate(row.firstCloseAtISO, asset) : 'Not collected'}</td>
            <td className="py-1.5 pr-3 font-mono text-slate-400">{fmtMins(row.minsToFirstClose)}</td>
            <td className="py-1.5 pr-3 text-center font-semibold text-slate-200">{row.closesInHorizon}</td>
            <td className="py-1.5 pr-3 text-center">{row.closesOnAnchorDay ? <span className="inline-block rounded bg-emerald-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-400">YES</span> : <span className="text-slate-600">No</span>}</td>
            <td className="py-1.5 text-slate-500">{row.weight}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
