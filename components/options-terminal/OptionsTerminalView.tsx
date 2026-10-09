'use client';

/**
 * OptionsTerminalView — Full options desk with live Alpha Vantage data.
 *
 * Visual scaffold adapted from the user's UI blueprint, data powered by
 * the useOptionsChain hook → /api/options-chain → AV REALTIME_OPTIONS (else HISTORICAL_OPTIONS, previous session).
 */

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {noQuoteLabel} from '@/lib/market/priceStamp';
import {isMarketOpenForSession} from '@/lib/time/sessionCloseEngine';
import {trustBadgeState} from '@/components/market/TrustBadge';
import type { RiskFlag } from '@/components/market/RiskFlagPanel';
import { buildMarketDataProviderStatus } from '@/lib/scanner/providerStatus';
import { selectOptionsExpiry, withOptionsExpiry } from '@/lib/options/expiry';
import { atmStrike } from '@/lib/options/atmStrike';
import PerContractCosts from './PerContractCosts';
import OptionsResearchSections from './OptionsResearchSections';
import OptionsPicture from './OptionsPicture';
import MobileOptionsChain, { initialContractSelection } from './MobileOptionsChain';
import { researchLabel, researchReason } from '@/components/terminal/researchPresentation';
import ChipRow from '@/components/visual/ChipRow';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import { chainQuality, quoteDateLabel } from '@/lib/options/quoteQuality';
import { optionJournalParams } from '@/lib/options/journalHandoff';
import { expiryAfterUnavailable, useOptionsChain } from '@/hooks/useOptionsChain';
import type {
  OptionsContract,
  StrikeGroup,
  BestStrike,
  ExpirationMeta,
  OIHeatmapRow,
  IVMetrics,
} from '@/types/optionsTerminal';

function optionsCopy(value: string) { return researchReason(value).replace(/\bunavailable\b/gi,'not collected').replace(/\bHISTORICAL_OPTIONS\b/g,'Previous session close'); }

type Mode = 'retail' | 'institutional';
type CPFilter = 'BOTH' | 'CALLS' | 'PUTS';

function evidenceStatus(value: boolean) {
  return value ? 'supportive' as const : 'missing' as const;
}

function riskSeverity(label: string): RiskFlag['severity'] {
  const lower = label.toLowerCase();
  if (lower.includes('error') || lower.includes('unavailable') || lower.includes('extreme') || lower.includes('no contracts')) return 'critical';
  if (lower.includes('delayed') || lower.includes('previous session') || lower.includes('no live bid/ask') || lower.includes('stale') || lower.includes('wide') || lower.includes('thin') || lower.includes('high')) return 'warning';
  return 'info';
}

/* ─────────────────────────────────────────────────────────────────
   Main Component
   ───────────────────────────────────────────────────────────────── */
export default function OptionsTerminalView({ symbol: propSymbol, expiry: propExpiry }: { symbol?: string; expiry?:string } = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialSymbol = propSymbol?.toUpperCase() || searchParams.get('symbol')?.toUpperCase() || 'SPY';

  /* ── Live data ─────────────────────────────────────────────── */
  const chain = useOptionsChain();
  const tableContainer = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(chain.loading)return;
    const container=tableContainer.current, row=container?.querySelector<HTMLTableRowElement>('[data-atm="true"]');
    // Row offsetTop is measured from the table, not the page, so do not subtract container.offsetTop.
    if(container && row) container.scrollTop=Math.max(0,row.offsetTop-container.clientHeight/2);
  },[chain.loading,chain.contracts]);

  /* ── UI state ──────────────────────────────────────────────── */
  const [ticker, setTicker] = useState(initialSymbol);
  const [tickerInput, setTickerInput] = useState(initialSymbol);
  const selectedExpiry = searchParams.get('expiry') || propExpiry || '';
  const setSelectedExpiry = useCallback((expiry:string) => {
    router.replace(`${pathname}?${withOptionsExpiry(new URLSearchParams(searchParams.toString()),expiry)}`,{scroll:false});
  },[pathname,searchParams,router]);
  const [mode, setMode] = useState<Mode>('retail');
  const [cp, setCp] = useState<CPFilter>('BOTH');
  const [rangePct, setRangePct] = useState(20);
  const [minOI, setMinOI] = useState(0);
  const [minVol, setMinVol] = useState(0);
  const [maxSpreadPct, setMaxSpreadPct] = useState(50);
  const [selected, setSelected] = useState<{ side: 'CALL' | 'PUT'; strike: number } | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [watchlistMsg, setWatchlistMsg] = useState('');

  useEffect(() => {
    if (!propSymbol) return;
    const next = propSymbol.toUpperCase();
    if (next !== ticker) {
      setTicker(next);
      setTickerInput(next);
      setSelected(null);
    }
  // Sync only when the outer symbol changes; local typing must remain editable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propSymbol]);

  /* ── Auto-fetch on ticker/expiry change ────────────────────── */
  useEffect(() => {
    if (ticker) {
      chain.fetch(ticker, selectedExpiry || undefined);
      setSelected(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, selectedExpiry]);

  /* ── Auto-select the shared expiry once loaded ─────────── */
  useEffect(() => {
    if (!chain.expirations.length) return;
    const dates = chain.expirations.map(e => e.date);
    if (!selectedExpiry) {
      setSelectedExpiry(selectOptionsExpiry(chain.expirations.map(e=>e.date)) || '');
      return;
    }
    if (!chain.error) return;
    const next = expiryAfterUnavailable(selectedExpiry, dates);
    if (next && next !== selectedExpiry) setSelectedExpiry(next);
  }, [chain.expirations, chain.error, selectedExpiry]);

  /* ── Build table rows from live strike groups ──────────────── */
  const rows = useMemo(() => {
    let groups = chain.strikeGroups;
    const spot = chain.underlyingPrice;

    // strike range filter
    if (spot > 0 && rangePct < 100) {
      const lo = spot * (1 - rangePct / 100);
      const hi = spot * (1 + rangePct / 100);
      groups = groups.filter((g) => g.strike >= lo && g.strike <= hi);
    }
    // liquidity filters
    if (minOI > 0) groups = groups.filter((g) => (g.call?.openInterest ?? 0) >= minOI || (g.put?.openInterest ?? 0) >= minOI);
    if (minVol > 0) groups = groups.filter((g) => (g.call?.volume ?? 0) >= minVol || (g.put?.volume ?? 0) >= minVol);
    if (maxSpreadPct < 100) groups = groups.filter((g) => [g.call, g.put].some((contract) => contract && contract.bid > 0 && contract.ask >= contract.bid && contract.spreadPct != null && Number.isFinite(contract.spreadPct) && contract.spreadPct <= maxSpreadPct));
    groups = groups.filter((g) => [g.call, g.put].some((contract) => contract && ((contract.bid > 0) || (contract.ask > 0) || (contract.volume > 0) || (contract.openInterest > 0) || (contract.last > 0))));

    return groups;
  }, [chain.strikeGroups, chain.underlyingPrice, rangePct, minOI, minVol, maxSpreadPct]);

  /* ── Selected row contract data ────────────────────────────── */
  const selectedRow = useMemo(() => {
    if (!selected) return null;
    return rows.find((r) => r.strike === selected.strike) ?? null;
  }, [rows, selected]);

  const selectedContract: OptionsContract | undefined = useMemo(() => {
    if (!selectedRow || !selected) return undefined;
    return selected.side === 'CALL' ? selectedRow.call : selectedRow.put;
  }, [selectedRow, selected]);

  useEffect(() => {
    if (chain.loading) return;
    if (selected && rows.some(row => row.strike === selected.strike && (selected.side === 'CALL' ? row.call : row.put))) return;
    const next = initialContractSelection(chain.strikeGroups, rows, chain.underlyingPrice);
    if (next || selected) setSelected(next);
  }, [chain.loading, chain.strikeGroups, chain.underlyingPrice, rows, selected]);

  /* ── Handlers ──────────────────────────────────────────────── */
  const applyFilter = useCallback((name: string) => {
    if (activeFilter === name) {
      // toggle off – reset to defaults
      setActiveFilter(null);
      setRangePct(20); setMinOI(0); setMinVol(0); setMaxSpreadPct(50);
      return;
    }
    setActiveFilter(name);
    // reset first
    setRangePct(20); setMinOI(0); setMinVol(0); setMaxSpreadPct(50);
    switch (name) {
      case 'ATM Focus':      setRangePct(5); break;
      case '25Δ Focus':      setRangePct(15); break;
      case 'High OI':        setMinOI(500); break;
      case 'High Volume':    setMinVol(100); break;
      case 'Tight Spreads':  setMaxSpreadPct(5); break;
    }
  }, [activeFilter]);

  const handleTickerChange = useCallback((s: string) => {
    const next = s.toUpperCase().trim();
    setTicker(next);
    setTickerInput(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('symbol',next); params.set('type','equity'); params.delete('expiry');
    router.replace(`${pathname}?${params}`,{scroll:false});
    setSelected(null);
  }, [searchParams, router, pathname]);

  const [marketOpen,setMarketOpen]=useState<boolean|null>(null);
  useEffect(()=>{setMarketOpen(isMarketOpenForSession(new Date(),'regular'));},[]);
  const spot = chain.underlyingPrice;
  const updatedLabel = chain.loading ? 'Loading…' : quoteDateLabel(chain.quoteBasis, chain.asOfDate);
  const quality = chainQuality(chain.contracts, spot, chain.quoteBasis, chain.asOfDate);
  const chainIsStale = quality.stale;
  const liquidContracts = quality.quoted;
  const chainCoverage = quality.coverage;
  const avgSpreadPct = quality.averageSpread;
  const tightSpreadPct = quality.tightShare;
  const providerStatus = buildMarketDataProviderStatus({
    source: 'options-terminal',
    provider: chain.provider || 'options chain',
    stale: chainIsStale,
    degraded: quality.degraded,
    warnings: [
      !chain.asOfDate ? 'Provider quote date unavailable.' : null,
      chainCoverage < 80 ? `${chainCoverage}% two-sided quote coverage within 10% of spot.` : null,
      chain.error ? `Options chain error: ${chain.error}` : null,
      chain.contracts.length === 0 && ticker ? 'No option contracts loaded.' : null,
      chain.quoteBasis === 'previous_session' ? `Live option quotes unavailable; ${updatedLabel}.` : null,
      chain.quoteBasis === 'marks_only' ? 'Provider returned marks only (no usable bid/ask).' : null,
      chainIsStale ? 'Options quote date is older than the current/last trading session.' : null,
      avgSpreadPct > 12 ? `Average contract spread is wide at ${avgSpreadPct.toFixed(1)}%.` : null,
    ].filter(Boolean) as string[],
  });
  const optionsMarketStatusItems = [
    {
      label: 'Chain',
      statusLabel: trustBadgeState({providerStatus}).label,
      notes: [quoteDateLabel(chain.quoteBasis,chain.asOfDate)],
      status: providerStatus,
      source: chain.provider || 'unknown',
      coverageScore: chainCoverage,
      computedAt: null, // Retrieval time must not masquerade as quote time.
    },
    {
      label: 'Liquidity',
      status: buildMarketDataProviderStatus({
        source: 'options-liquidity',
        provider: 'bid ask and OI',
        degraded: liquidContracts.length === 0 || tightSpreadPct < 60,
        warnings: [
          liquidContracts.length === 0 ? 'No spread data available.' : null,
          tightSpreadPct < 60 && liquidContracts.length > 0 ? `${tightSpreadPct}% of contracts have spreads at or below 8%.` : null,
        ].filter(Boolean) as string[],
      }),
      coverageScore: tightSpreadPct,
    },
    {
      label: 'IV',
      status: buildMarketDataProviderStatus({
        source: 'options-iv',
        provider: 'implied volatility model',
        degraded: quality.degraded || chain.ivMetrics.avgIV <= 0,
        warnings: [
          quality.degraded ? `IV uses ${updatedLabel}; near-money quote coverage ${chainCoverage}%.` : null,
          chain.ivMetrics.avgIV <= 0 ? 'Average IV unavailable.' : null,
          chain.ivMetrics.ivLevel === 'extreme' ? 'Extreme IV requires event and spread checks.' : null,
        ].filter(Boolean) as string[],
      }),
      coverageScore: chain.contracts.length ? Math.round(chain.contracts.filter(c => Number.isFinite(c.iv) && c.iv > 0).length / chain.contracts.length * 100) : 0,
    },
  ];
  const optionsEvidenceItems = [
    {
      label: 'Chain Coverage',
      value: chain.contracts.length > 0 ? `${chain.contracts.length} contracts` : 'Not collected',
      status: evidenceStatus(chain.contracts.length > 0),
      detail: `${chain.expirations.length} expirations loaded; ${rows.length} strikes visible after filters.`,
    },
    {
      label: 'Provider',
      value: chain.provider && chain.provider !== 'HISTORICAL_OPTIONS' ? chain.provider : 'Previous session close',
      status: chain.quoteBasis === 'realtime' ? 'supportive' as const : chain.quoteBasis === 'marks_only' ? 'conflicting' as const : chain.provider ? 'neutral' as const : 'missing' as const,
      detail: [chain.provider === 'HISTORICAL_OPTIONS' ? 'Previous session close' : chain.sourceLabel, updatedLabel].filter((part) => part && !/unknown|HISTORICAL_OPTIONS/i.test(part)).join(' · ') || 'No fetch timestamp available.',
    },
    {
      label: 'Liquidity',
      value: liquidContracts.length ? `${tightSpreadPct}% tight` : 'Not collected',
      status: liquidContracts.length === 0 ? 'missing' as const : tightSpreadPct >= 60 ? 'supportive' as const : 'conflicting' as const,
      detail: liquidContracts.length ? `Average spread ${avgSpreadPct.toFixed(1)}% across quoted contracts within 10% of spot.` : 'No usable bid/ask pairs; spread and liquidity quality are unavailable.',
    },
    {
      label: 'IV Context',
      value: 'IV history not collected yet',
      status: chain.ivMetrics.avgIV > 0 ? 'neutral' as const : 'missing' as const,
      detail: chain.ivMetrics.avgIV > 0 ? `ATM IV ${(chain.ivMetrics.avgIV * 100).toFixed(1)}%, expected move ${chain.ivMetrics.expectedMovePct.toFixed(1)}%.` : 'IV metrics unavailable until contracts load.',
    },
  ];
  const optionsRiskFlags = (chain.loading ? [] : [
    chain.contracts.some((contract) => !(contract.bid > 0 && contract.ask >= contract.bid)) ? `${chain.contracts.filter((contract) => !(contract.bid > 0 && contract.ask >= contract.bid)).length}/${chain.contracts.length} contracts lack valid two-sided quotes. Spread and liquidity assessment are incomplete.` : null,
    chain.error ? `Options chain error: ${chain.error}` : null,
    chain.contracts.length === 0 && ticker ? 'No contracts loaded for selected ticker.' : null,
    chain.quoteBasis === 'previous_session' ? `Quotes are the previous session close${chain.asOfDate ? ` (as of ${chain.asOfDate})` : ''}, not live.` : null,
    chain.quoteBasis === 'marks_only' ? 'Only fair-value marks available; no live bid/ask.' : null,
    chainIsStale ? 'Options chain is stale.' : null,
    avgSpreadPct > 12 ? `Average spread is wide at ${avgSpreadPct.toFixed(1)}%.` : null,
    chain.ivMetrics.ivLevel === 'extreme' ? 'Extreme IV environment.' : null,
    rows.length === 0 && chain.contracts.length > 0 ? 'No quoted strikes pass the current liquidity filters.' : null,
  ]).filter(Boolean).map((label) => ({
    label: label as string,
    severity: riskSeverity(label as string),
    detail: 'Limits educational options scenario quality until checked.',
  }));

  /* ── Landing state (no ticker) ─────────────────────────────── */
  if (!ticker && chain.contracts.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-8">
        <div className="w-16 h-16 rounded-2xl overflow-hidden mb-5">
          <img src="/assets/platform-tools/options-terminal.png" alt="Options Terminal" className="h-full w-full object-contain p-1" />
        </div>
        <h2 className="text-xl font-bold mb-2">Options Terminal</h2>
        <p className="text-sm text-zinc-400 mb-6 max-w-md text-center">
          One ticker — the entire options decision surface. Enter a symbol to see
          the full chain with Greeks, IV, OI, volume, and strategy scenarios.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const val = (e.currentTarget.elements.namedItem('sym') as HTMLInputElement)?.value?.trim().toUpperCase();
            if (val) handleTickerChange(val);
          }}
          className="flex items-center gap-2 mb-6 w-full max-w-xs"
        >
          <input
            name="sym"
            type="text"
            autoFocus
            placeholder="Enter symbol…"
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
          />
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-500 transition"
          >
            Go
          </button>
        </form>
        <div className="flex flex-wrap justify-center gap-2">
          {['AAPL', 'SPY', 'TSLA', 'NVDA', 'QQQ', 'AMZN'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleTickerChange(t)}
              className="rounded-xl border border-emerald-600/30 bg-emerald-600/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-600/20 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     MAIN RENDER
     ══════════════════════════════════════════════════════════════ */
  return (
    <div className="min-w-0 bg-zinc-950 text-zinc-100 [&_button]:min-h-10 [&_select]:min-h-10" data-options-page>
      <header className="space-y-2 border-b border-zinc-800 px-3 py-3">
        {pathname === '/tools/terminal' ? <h2 className="text-lg font-semibold">Options chain</h2> : <h1 className="text-xl font-semibold">Options</h1>}
        <p className="text-sm font-semibold" data-options-verdict>{chain.loading ? 'Loading chain…' : chain.error ? 'Chain not collected' : rows.length ? `${ticker} · ${rows.length} listed strikes` : 'No quoted strikes for this selection.'}</p>
        <div className="flex flex-wrap items-end gap-2">
          {pathname === '/tools/terminal' ? <span className="py-2 text-sm">{ticker}</span> : <label className="text-xs text-zinc-400">Symbol<input aria-label="Options symbol" value={tickerInput} onChange={e=>setTickerInput(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==='Enter')handleTickerChange(tickerInput);}} className="ml-2 min-h-10 w-20 rounded border border-zinc-700 bg-zinc-900 px-2 text-sm"/></label>}
          <label className="text-xs text-zinc-400">Expiry<select aria-label="Options expiry" value={selectedExpiry} onChange={e=>setSelectedExpiry(e.target.value)} className="ml-2 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs"><option value="">Default expiry</option>{chain.expirations.map(exp=><option key={exp.date} value={exp.date}>{exp.label}</option>)}</select></label>
        </div>
        <p className="text-xs text-zinc-300">{spot>0?`${chain.spotObservation?'Underlying':'Underlying estimate'} $${spot.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`:`${ticker} · ${noQuoteLabel(marketOpen)}`}{chain.spotObservation?.changePercent != null ? ` · ${chain.spotObservation.changePercent.toFixed(2)}% from previous close` : ''}</p>
        <p className="text-xs text-zinc-400" data-options-status>{chain.loading?'Collecting quotes…':quoteDateLabel(chain.quoteBasis,chain.asOfDate)}</p>
      </header>

      {/* ── Error banner ──────────────────────────────────── */}
      {chain.error && (
        <div className="w-full px-4 pt-4">
          <div className="rounded-2xl border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-300">
            {optionsCopy(chain.error)}
          </div>
        </div>
      )}

      <div className="w-full space-y-3 px-3 pt-3">
        <CollapsibleSection title="Open-interest context" summary="Expected move and observed open interest"><OptionsPicture
          spot={spot}
          expectedMove={chain.ivMetrics.expectedMoveAbs}
          callOi={chain.oiHeatmap.reduce((sum, row) => sum + (row.callOI || 0), 0)}
          putOi={chain.oiHeatmap.reduce((sum, row) => sum + (row.putOI || 0), 0)}
          walls={chain.oiHeatmap.map((row) => ({ strike: row.strike, callOI: row.callOI, putOI: row.putOI }))}
        />
        </CollapsibleSection>
        <ChipRow
          items={[{
            id: 'evidence',
            label: 'Chain evidence',
            detail: chain.loading ? <p role="status">Loading options provider…</p> : (
              <div className="space-y-3">
                <div className="space-y-2">{optionsEvidenceItems.map(item=><p key={item.label} className="text-xs"><strong>{item.label}:</strong> {optionsCopy(item.value)} · {optionsCopy(item.detail)}</p>)}</div>
                <div className="space-y-1">{optionsRiskFlags.map((flag,i)=><p key={i} className="text-xs text-amber-200">{optionsCopy(flag.label)}</p>)}</div>
                <div className="space-y-1">{optionsMarketStatusItems.flatMap(item=>item.status?.warnings??[]).map((warning,i)=><p key={i} className="text-xs text-zinc-400">{optionsCopy(warning)}</p>)}</div>
              </div>
            ),
          }]}
        />
        {chain.providerIssues.length > 0 && <ul className="text-sm text-amber-300">{chain.providerIssues.map((issue,i)=><li key={i}>{optionsCopy(issue)}</li>)}</ul>}
      </div>

      {/* ── Page shell ────────────────────────────────────── */}
      <div className="w-full px-4 py-4 space-y-4">
          {/* ── IV & Expected Move ─────────────────────── */}
          <CollapsibleSection title="IV and expected move" summary="Model inputs and estimates"><div className="w-full">
            <Card title="IV & Expected Move" right={<span className="text-xs text-zinc-400">{selectedExpiry || 'nearest listed expiry'}</span>}>
              <div className="grid grid-cols-2 gap-4">
                <MiniStat label="ATM IV (2% band)" value={chain.ivMetrics.avgIV > 0 ? `${(chain.ivMetrics.avgIV * 100).toFixed(1)}%` : 'Not collected'} />
                <MiniStat label="1-sigma move to expiry" value={chain.ivMetrics.expectedMoveAbs > 0 ? `±$${chain.ivMetrics.expectedMoveAbs.toFixed(2)}` : 'Not collected'} />
                <MiniStat label="ATM straddle mid" value={chain.ivMetrics.atmStraddleMid != null ? `$${chain.ivMetrics.atmStraddleMid.toFixed(2)}` : 'Not collected'} />
                <MiniStat label="EM %" value={chain.ivMetrics.expectedMovePct > 0 ? `±${chain.ivMetrics.expectedMovePct.toFixed(1)}%` : 'Not collected'} />
              </div>

              <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400">Desk Read</div>
                <div className="mt-1 text-sm font-semibold">
                  IV history not collected yet. This is a 1-sigma model estimate, not a guaranteed range. Market basis: {chain.asOfDate || 'not collected'}.

                </div>
              </div>
            </Card>
          </div>

          </CollapsibleSection>
        {/* === DESK GRID === */}
        <div className="grid grid-cols-12 gap-4">
          {/* ── Left: Chain Navigator ─────────────────────── */}
          <div className="order-2 col-span-12 space-y-3">
            <CollapsibleSection title="Chain filters" summary="Expiry shortcuts, liquidity and display"><ModeToggle mode={mode} setMode={setMode}/><Card title="Chain Navigator" right={<span className="text-xs text-zinc-400">{chain.expirations.length} expirations</span>}>
              <div className="space-y-4">
                {/* Expiry quick picks */}
                <div className="grid grid-cols-2 gap-3">
                  {chain.expirations.slice(0, 4).map((exp) => (
                    <button
                      key={exp.date}
                      type="button"
                      aria-pressed={exp.date === selectedExpiry}
                      onClick={() => setSelectedExpiry(exp.date)}
                      className={`rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                        exp.date === selectedExpiry
                          ? 'border-emerald-600/40 bg-emerald-600/10'
                          : 'border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{exp.dte} DTE</div>
                      <div className="mt-1 text-sm font-semibold">{exp.date}</div>
                    </button>
                  ))}
                </div>

                {/* Quick Filters */}
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
                  <div className="text-xs font-semibold">Quick Filters</div>
                  <div className="flex flex-wrap gap-2">
                    {['ATM Focus', '25Δ Focus', 'High OI', 'High Volume', 'Tight Spreads'].map((f) => (
                      <Chip key={f} active={activeFilter === f} onClick={() => applyFilter(f)}>{f}</Chip>
                    ))}
                  </div>
                </div>

                {/* Notable Strikes (auto-computed) */}
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
                  <div className="text-xs font-semibold">Notable Strikes (Auto)</div>
                  <div className="grid grid-cols-2 gap-3">
                    {chain.bestStrikes.slice(0, 6).map((bs, i) => (
                      <BestStrikeCard
                        key={`${bs.label}-${i}`}
                        label={bs.label}
                        value={`$${bs.strike.toFixed(2)}`}
                        sub={bs.reason}
                        tone={bs.type === 'call' ? 'ok' : 'bad'}
                        onClick={() => {
                          setSelected({ side: bs.type === 'call' ? 'CALL' : 'PUT', strike: bs.strike });
                        }}
                      />
                    ))}
                  </div>
                  {chain.bestStrikes.length === 0 && (
                    <div className="text-xs text-zinc-400">Load a chain to see auto-computed notable strikes.</div>
                  )}
                </div>
              </div>
            </Card></CollapsibleSection>
          </div>

          {/* ── Center: Options Chain Grid ─────────────────── */}
          <div className="order-1 col-span-12 min-w-0 space-y-3">
            <section aria-label="Options chain table">
            <Card
              title="Options Chain"
              right={
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">±{rangePct}%</Badge>
                  <Badge tone="neutral">{rows.length} strikes</Badge>
                </div>
              }
            >
              {/* Toolbar */}
              <CollapsibleSection title="Table filters"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="hidden sm:block">
                <Segmented value={cp} onChange={setCp} options={[
                  { label: 'Both', value: 'BOTH' },
                  { label: 'Calls', value: 'CALLS' },
                  { label: 'Puts', value: 'PUTS' },
                ]} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full lg:w-auto">
                  <NumberField label="Range %" value={rangePct} setValue={setRangePct} min={5} max={100} />
                  <NumberField label="Min OI" value={minOI} setValue={setMinOI} min={0} max={100000} />
                  <NumberField label="Min Vol" value={minVol} setValue={setMinVol} min={0} max={100000} />
                  <NumberField label="Max Spread %" value={maxSpreadPct} setValue={setMaxSpreadPct} min={1} max={100} />
                </div>
              </div>

              <p className="mt-3 text-xs text-zinc-400" data-testid="chain-scroll-hint">Swipe sideways to read calls, the centre strike, and puts.</p>
              </CollapsibleSection>
              <MobileOptionsChain rows={rows} selected={selected} onSelect={setSelected}/>
              {/* Chain Table */}
              <div className="mt-3 hidden rounded border border-zinc-800 sm:block">
                <div ref={tableContainer} className="relative max-h-64 min-w-0 max-w-full overflow-auto">
                  <table className="w-full border-collapse"><caption className="py-2 text-left text-xs text-zinc-400">{cp==='BOTH'?'Calls left · Puts right':cp==='CALLS'?'Calls':'Puts'}</caption>
                    <thead className="sticky top-0 z-10 bg-zinc-900">
                      <tr className="text-left">
                        {cp !== 'PUTS' && (
                          <>
                            <Th>Bid</Th><Th>Ask</Th><Th>Vol</Th><Th>OI</Th><Th>IV</Th><Th className="whitespace-nowrap">Delta</Th>
                            {mode === 'institutional' && <><Th>Γ</Th><Th>Θ</Th><Th>Vega</Th></>}
                          </>
                        )}
                        <Th className="sticky-strike whitespace-nowrap text-center">Strike</Th>
                        {cp !== 'CALLS' && (
                          <>
                            {mode === 'institutional' && <><Th>Vega</Th><Th>Θ</Th><Th>Γ</Th></>}
                            <Th className="whitespace-nowrap">Delta</Th><Th>IV</Th><Th>OI</Th><Th>Vol</Th><Th>Bid</Th><Th>Ask</Th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-zinc-950">
                      {rows.map((g) => {
                        const c = g.call;
                        const p = g.put;
                        const isSelCall = selected?.side === 'CALL' && selected.strike === g.strike;
                        const isSelPut = selected?.side === 'PUT' && selected.strike === g.strike;

                        return (
                          <React.Fragment key={g.strike}>
                          <tr
                            data-atm={g.isAtm}
                            className={`border-t border-zinc-900 ${g.isAtm ? 'bg-zinc-900/40' : ''}`}
                          >
                            {/* Call side */}
                            {cp !== 'PUTS' && (
                              <>
                                <Td clickable selected={isSelCall} onClick={() => setSelected({ side: 'CALL', strike: g.strike })}>
                                  {quoteCell(c, 'bid')}
                                </Td>
                                <Td clickable selected={isSelCall} onClick={() => setSelected({ side: 'CALL', strike: g.strike })}>
                                  {quoteCell(c, 'ask')}
                                </Td>
                                <Td>{fmtInt(c?.volume)}</Td>
                                <Td>{fmtInt(c?.openInterest)}</Td>
                                <Td>{fmtPct(c?.iv)}</Td>
                                <Td>{fmt(c?.delta, 2)}</Td>
                                {mode === 'institutional' && (
                                  <>
                                    <Td>{fmt(c?.gamma, 4)}</Td>
                                    <Td>{fmt(c?.theta, 4)}</Td>
                                    <Td>{fmt(c?.vega, 4)}</Td>
                                  </>
                                )}
                              </>
                            )}

                            {/* Strike */}
                            <TdStrike strike={g.strike} underlying={spot} isATM={g.isAtm} />

                            {/* Put side */}
                            {cp !== 'CALLS' && (
                              <>
                                {mode === 'institutional' && (
                                  <>
                                    <Td>{fmt(p?.vega, 4)}</Td>
                                    <Td>{fmt(p?.theta, 4)}</Td>
                                    <Td>{fmt(p?.gamma, 4)}</Td>
                                  </>
                                )}
                                <Td>{fmt(p?.delta, 2)}</Td>
                                <Td>{fmtPct(p?.iv)}</Td>
                                <Td>{fmtInt(p?.openInterest)}</Td>
                                <Td>{fmtInt(p?.volume)}</Td>
                                <Td clickable selected={isSelPut} onClick={() => setSelected({ side: 'PUT', strike: g.strike })}>
                                  {quoteCell(p, 'bid')}
                                </Td>
                                <Td clickable selected={isSelPut} onClick={() => setSelected({ side: 'PUT', strike: g.strike })}>
                                  {quoteCell(p, 'ask')}
                                </Td>
                              </>
                            )}
                          </tr>
                          {((c && !twoSided(c)) || (p && !twoSided(p))) && (
                            <tr className="border-t border-zinc-900/60">
                              <td colSpan={99} className="px-3 py-2">
                                <span data-testid="no-two-sided-quote" className="inline-flex rounded-full border border-amber-400/40 px-2 py-0.5 text-xs font-semibold text-amber-200">
                                  No two-sided quote{c && !twoSided(c) && p && !twoSided(p) ? '' : c && !twoSided(c) ? ' · call' : ' · put'}
                                </span>
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                        );
                      })}

                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={99} className="px-6 py-12 text-center text-sm text-zinc-400">
                            {chain.loading ? 'Loading options chain…' : 'No quoted strikes pass these filters. Check the chain coverage warning above.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-3 text-xs text-zinc-400">
                Click Bid/Ask on a strike to load the Contract Inspector.
              </div>
            </Card>
            </section>
          </div>

          {/* ── Right: Contract Inspector ──────────────────── */}
          <div className="order-3 col-span-12 space-y-3">
            <CollapsibleSection title="Contract inspector" summary={selectedContract ? `${selectedContract.strike}${selectedContract.type==='call'?'C':'P'} · ${selectedContract.expiration}` : 'No quoted ATM contract in this selection'}><Card title="Contract Inspector">
              {!selected || !selectedContract ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-6 text-sm text-zinc-400 text-center">
                  Select a contract from the chain to view Greeks, IV, OI/Vol, and liquidity.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold">
                          {ticker} {selectedContract.expiration} {selectedContract.strike}
                          {selected.side === 'CALL' ? 'C' : 'P'}
                        </div>
                        <div className="text-xs text-zinc-400">
                          Mark: <span className="font-semibold text-zinc-200">${selectedContract.mark.toFixed(2)}</span>
                          {' · '}Spread: <span className="font-semibold text-zinc-200">{selectedContract.spreadPct == null ? 'No valid two-sided quote' : `$${selectedContract.spread.toFixed(2)} (${selectedContract.spreadPct.toFixed(1)}%)`}</span>
                        </div>
                      </div>
                      <Badge tone={selected.side === 'CALL' ? 'ok' : 'bad'}>{selected.side}</Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <MiniStat label="OI" value={fmtInt(selectedContract.openInterest)} />
                      <MiniStat label="Vol" value={fmtInt(selectedContract.volume)} />
                      <MiniStat label="IV" value={fmtPct(selectedContract.iv)} />
                      <MiniStat label="Δ" value={fmt(selectedContract.delta, 3)} />
                    </div>
                  </div>

                  <PerContractCosts contract={selectedContract} spot={spot} quoteBasis={chain.quoteBasis} asOfDate={chain.asOfDate} />
                  {/* Greeks */}
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="text-xs font-semibold">Greeks</div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <MiniStat label="Delta" value={fmt(selectedContract.delta, 4)} />
                      <MiniStat label="Theta" value={fmt(selectedContract.theta, 4)} />
                      {mode === 'institutional' && (
                        <>
                          <MiniStat label="Gamma" value={fmt(selectedContract.gamma, 5)} />
                          <MiniStat label="Vega" value={fmt(selectedContract.vega, 4)} />
                          <MiniStat label="Rho" value={fmt(selectedContract.rho, 4)} />
                        </>
                      )}
                    </div>
                    {mode === 'retail' && (
                      <div className="mt-3 text-xs text-zinc-400">
                        Retail view shows core Greeks. Switch to Institutional for Γ, Vega, Rho.
                      </div>
                    )}
                  </div>

                  {/* Liquidity Check */}
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="text-xs font-semibold">Liquidity Check</div>
                    <div className="mt-3 space-y-2">
                      <LiquidityLine
                        label="Spread %"
                        value={selectedContract.spreadPct == null ? 'No valid bid / two-sided quote' : `${selectedContract.spreadPct.toFixed(1)}%`}
                        tone={selectedContract.spreadPct == null ? 'warn' : selectedContract.spreadPct < 3 ? 'ok' : selectedContract.spreadPct < 8 ? 'warn' : 'bad'}
                      />
                      <LiquidityLine
                        label="OI Depth"
                        value={selectedContract.openInterest > 5000 ? 'Strong' : selectedContract.openInterest > 500 ? 'Moderate' : 'Thin'}
                        tone={selectedContract.openInterest > 5000 ? 'ok' : selectedContract.openInterest > 500 ? 'warn' : 'bad'}
                      />
                      <LiquidityLine
                        label="Vol/OI"
                        value={selectedContract.openInterest > 0 ? (selectedContract.volume / selectedContract.openInterest).toFixed(2) : 'Not collected'}
                        tone={selectedContract.openInterest > 0 && selectedContract.volume / selectedContract.openInterest > 0.5 ? 'ok' : 'warn'}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-zinc-400">Journal premium: {selectedContract.ask > 0 ? `$${selectedContract.ask.toFixed(2)} per share (ask)` : 'No valid ask'}. Calls and puts default to purchased positions; review before saving.</p>
                  {/* Actions */}
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          // Fetch user's watchlists, pick first or create "Options"
                          const res = await fetch('/api/watchlists', { credentials: 'include' });
                          if (!res.ok) throw new Error('Failed to fetch watchlists');
                          const { watchlists } = await res.json();
                          let wlId = watchlists?.[0]?.id;
                          if (!wlId) {
                            const createRes = await fetch('/api/watchlists', {
                              method: 'POST', credentials: 'include',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ name: 'Options' }),
                            });
                            if (!createRes.ok) throw new Error('Failed to create watchlist');
                            const created = await createRes.json();
                            wlId = created.watchlist?.id;
                          }
                          // Add the contract symbol
                          const contractSymbol = `${ticker} ${selectedContract!.expiration} ${selectedContract!.strike}${selected!.side === 'CALL' ? 'C' : 'P'}`;
                          const addRes = await fetch('/api/watchlists/items', {
                            method: 'POST', credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              watchlistId: wlId,
                              symbol: ticker,
                              assetType: 'option',
                              option: {expiration:selectedContract!.expiration,strike:selectedContract!.strike,type:selectedContract!.type},
                              notes: contractSymbol,
                              addedPrice: selectedContract!.mark,
                            }),
                          });
                          if (!addRes.ok) throw new Error('Failed to add to watchlist');
                          const saved = await addRes.json();
                          setWatchlistMsg(saved.alreadyExists ? 'Already in watchlist' : '✓ Added to watchlist');
                          setTimeout(() => setWatchlistMsg(''), 3000);
                        } catch (e: any) {
                          setWatchlistMsg(e.message);
                          setTimeout(() => setWatchlistMsg(''), 3000);
                        }
                      }}
                      className="w-full rounded-2xl bg-zinc-950/40 border border-zinc-800 px-4 py-3 text-sm font-semibold hover:bg-zinc-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                    >
                      {watchlistMsg || 'Add to Watchlist'}
                    </button>
                    <button
                      type="button"
                      disabled={!Number.isFinite(selectedContract.ask) || selectedContract.ask <= 0}
                      onClick={() => {
                        const params = optionJournalParams(ticker, selectedContract!, 'scenario');
                        router.push(`/tools/workspace?tab=journal&prefill=true&${params.toString()}`);
                      }}
                      className="w-full rounded-2xl bg-zinc-950/40 border border-zinc-800 px-4 py-3 text-sm font-semibold hover:bg-zinc-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                    >
                      Save Scenario
                    </button>
                    <button
                      type="button"
                      disabled={!Number.isFinite(selectedContract.ask) || selectedContract.ask <= 0}
                      onClick={() => {
                        const params = optionJournalParams(ticker, selectedContract!, 'analysis');
                        router.push(`/tools/workspace?tab=journal&prefill=true&${params.toString()}`);
                      }}
                      className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-500 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                    >
                      Log to Journal
                    </button>
                  </div>
                  <div className="text-xs text-zinc-400 text-center">Educational purposes only · Not financial advice</div>
                </div>
              )}
            </Card></CollapsibleSection>
          </div>
        </div>

        <CollapsibleSection title="More detail" summary="Open interest map and educational scenarios">
        {/* === ANALYTICS ROW === */}
        <div className="grid grid-cols-12 gap-4">
          {/* OI Map */}
          <div className="col-span-12 xl:col-span-4">
            <Card title="Open Interest Map" right={<span className="text-xs text-zinc-400">OI as of {chain.asOfDate || 'not supplied'}</span>}>
              {chain.oiHeatmap.length > 0 ? (
                <OIHeatmapInline heatmap={chain.oiHeatmap} spot={spot} expectedMove={chain.ivMetrics.expectedMoveAbs} />
              ) : (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-6 text-sm text-zinc-400 text-center">
                  Load a chain to see OI heatmap
                </div>
              )}
            </Card>
          </div>

          {/* Strategy Scenarios */}
          <div className="col-span-12 xl:col-span-4">
            <Card title="Strategy Scenarios (Educational)" right={<span className="text-xs text-zinc-400">not advice</span>}>
              <SuggestedPlaysInline ivLevel={chain.ivMetrics.ivLevel} />
            </Card>
          </div>
        </div>
        <OptionsResearchSections symbol={ticker} expiry={chain.contracts[0]?.expiration??selectedExpiry}/>
        </CollapsibleSection>
        <SourceLine source={chain.quoteBasis === 'previous_session' ? 'Previous session close' : 'Options chain'} tradingDay={chain.asOfDate ? `Option quote session ${chain.asOfDate}` : 'Quote date not collected'} basis={`Bid and ask · underlying session ${chain.spotObservation?.asOf || 'inferred; date not supplied'}`} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   UI Primitives (Tailwind · zinc dark theme)
   ═══════════════════════════════════════════════════════════════════ */

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 shadow-lg">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="text-sm font-semibold">{title}</div>
        <div>{right}</div>
      </div>
      <div className="p-3 sm:p-5">{children}</div>
    </div>
  );
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'info' | 'neutral' }) {
  const cls = tone === 'ok' ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-300'
    : tone === 'warn' ? 'border-yellow-600/30 bg-yellow-600/10 text-yellow-300'
    : tone === 'bad' ? 'border-red-600/30 bg-red-600/10 text-red-300'
    : tone === 'info' ? 'border-indigo-600/30 bg-indigo-600/10 text-indigo-300'
    : 'border-zinc-800 bg-zinc-950/40 text-zinc-300';
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${cls}`}>{children}</span>;
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active ?? false}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${active ? 'border-emerald-600/40 bg-emerald-600/20 text-emerald-300' : 'border-zinc-800 bg-zinc-950/40 text-zinc-300 hover:bg-zinc-800'}`}
    >
      {children}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function BestStrikeCard({ label, value, sub, tone, onClick }: {
  label: string; value: string; sub: string; tone: 'ok' | 'bad' | 'warn' | 'info'; onClick: () => void;
}) {
  const cls = tone === 'ok' ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-300'
    : tone === 'bad' ? 'border-red-600/30 bg-red-600/10 text-red-300'
    : tone === 'warn' ? 'border-yellow-600/30 bg-yellow-600/10 text-yellow-300'
    : 'border-indigo-600/30 bg-indigo-600/10 text-indigo-300';
  return (
    <button type="button" onClick={onClick} className={`rounded-2xl border p-3 text-left transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${cls}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
      <div className="text-[10px] opacity-70">{sub}</div>
    </button>
  );
}

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex rounded-xl border border-zinc-800 overflow-hidden">
      <button type="button" aria-pressed={mode === 'retail'} onClick={() => setMode('retail')} className={`px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/50 ${mode === 'retail' ? 'bg-emerald-600/20 text-emerald-300' : 'text-zinc-400 hover:bg-zinc-900'}`}>
        Retail
      </button>
      <button type="button" aria-pressed={mode === 'institutional'} onClick={() => setMode('institutional')} className={`px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/50 ${mode === 'institutional' ? 'bg-indigo-600/20 text-indigo-300' : 'text-zinc-400 hover:bg-zinc-900'}`}>
        Institutional
      </button>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { label: string; value: T }[] }) {
  return (
    <div className="inline-flex rounded-xl border border-zinc-800 overflow-hidden bg-zinc-950/40">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={`px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/50 ${o.value === value ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NumberField({ label, value, setValue, min, max }: { label: string; value: number; setValue: (v: number) => void; min: number; max: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <input type="number" value={value} min={min} max={max} onChange={(e) => setValue(Number(e.target.value))}
        className="w-full bg-transparent text-sm font-semibold outline-none" />
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th scope="col" className={`whitespace-nowrap px-2 py-3 text-[11px] uppercase tracking-normal text-zinc-400 ${className}`}>{children}</th>;
}

function Td({ children, clickable, selected, onClick }: { children: React.ReactNode; clickable?: boolean; selected?: boolean; onClick?: () => void }) {
  return (
    <td
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable && onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={`px-3 py-3 text-sm ${clickable ? 'cursor-pointer hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/50' : ''} ${selected ? 'bg-indigo-600/10' : ''}`}>
      <span className="text-zinc-200">{children}</span>
    </td>
  );
}

function TdStrike({ strike, underlying, isATM }: { strike: number; underlying: number; isATM: boolean }) {
  const dist = strike - underlying;
  const distPct = underlying > 0 ? (dist / underlying) * 100 : 0;
  return (
    <td className="sticky-strike z-10 whitespace-nowrap bg-zinc-950 px-2 py-3 text-center">
      <div className="inline-flex flex-col items-center">
        <div className="text-sm font-semibold text-zinc-100">
          {strike.toFixed(2)} {isATM && <span className="ml-1 text-[11px] text-emerald-300">ATM</span>}
        </div>
        <div className="text-[11px] text-zinc-400">
          {dist >= 0 ? '+' : ''}{dist.toFixed(2)} ({distPct >= 0 ? '+' : ''}{distPct.toFixed(1)}%)
        </div>
      </div>
    </td>
  );
}

function LiquidityLine({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'bad' }) {
  const cls = tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-yellow-300' : 'text-red-300';
  return (
    <div className="flex items-center justify-between">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={`text-xs font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

/* ─── Inline OI Heatmap ──────────────────────────────────────── */
function OIHeatmapInline({ heatmap, spot, expectedMove }: { heatmap: OIHeatmapRow[]; spot: number; expectedMove:number }) {
  const topRows = useMemo(() => {
    return [...heatmap].sort((a, b) => a.strike - b.strike);
  }, [heatmap]);
  const maxOI = Math.max(...topRows.map((r) => r.totalOI), 1);

  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-400">Spot ${spot.toFixed(2)} · {expectedMove > 0 ? `window ±3 moves; shaded 1-sigma band $${(spot-expectedMove).toFixed(2)}–$${(spot+expectedMove).toFixed(2)}` : '10% spot window; expected move not collected'}</p>
      {topRows.map((row, index) => {
        const callPct = (row.callOI / maxOI) * 100;
        const putPct = (row.putOI / maxOI) * 100;
        const isWall = row.totalOI >= maxOI * 0.7;
        const isAtm = row.strike === atmStrike(topRows.map(r=>r.strike),spot);

        return (
          <div key={row.strike}>
          {row.strike >= spot && (index===0 || topRows[index-1].strike<spot) && <div className="border-t border-emerald-400 text-[10px] text-emerald-300">Spot ${spot.toFixed(2)}</div>}
          <div className={`flex items-center gap-1 py-0.5 ${expectedMove>0 && Math.abs(row.strike-spot)<=expectedMove ? 'bg-sky-900/30' : ''}`}>
            <div className="flex-1 h-3 flex justify-end">
              <div className="h-full rounded-l-sm" style={{ width: `${callPct}%`, background: isWall ? 'var(--msp-bull)' : 'rgba(47,179,110,0.3)' }} />
            </div>
            <div className={`text-[9px] font-mono font-bold text-center w-12 shrink-0 ${isAtm ? 'text-emerald-300' : isWall ? 'text-yellow-300' : 'text-zinc-400'}`}>
              {row.strike.toString()}
            </div>
            <div className="flex-1 h-3 flex justify-start">
              <div className="h-full rounded-r-sm" style={{ width: `${putPct}%`, background: isWall ? 'var(--msp-bear)' : 'rgba(228,103,103,0.3)' }} />
            </div>
          </div>
          </div>
        );
      })}
      <div className="flex items-center justify-center gap-4 mt-2 text-[9px] text-zinc-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Calls</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400" /> Puts</span>
      </div>
    </div>
  );
}

/* ─── Inline Strategy Scenarios ─────────────────────────────────── */
function SuggestedPlaysInline({ ivLevel }: { ivLevel: IVMetrics['ivLevel'] }) {
  const frameworks = useMemo(() => {
    if (ivLevel === 'unavailable') return [{title:'Compare structures',desc:'Historical IV rank is not collected yet. Compare premium, liquidity and defined risk without assuming volatility is cheap or expensive.'}];
    if (ivLevel === 'high' || ivLevel === 'extreme') {
      return [
        { title: 'Directional + Elevated IV', desc: 'Elevated IV can make defined-risk credit structures worth reviewing, but spread width and event risk still control quality.' },
        { title: 'Neutral + Elevated IV', desc: 'Iron-condor frameworks can be compared against the expected move zone; wider wings change risk and reward assumptions.' },
        { title: 'Directional + Low IV', desc: 'When IV is high, naked long premium can face headwinds unless a further volatility expansion scenario is credible.' },
      ];
    }
    if (ivLevel === 'low') {
      return [
        { title: 'Directional + Low IV', desc: 'Low premium environment: debit structures cost less, but the directional scenario still needs evidence.' },
        { title: 'Calendar Spread', desc: 'Calendar frameworks depend on IV expansion assumptions and theta differential; validate event timing first.' },
        { title: 'Neutral', desc: 'Low IV compresses credits, so neutral premium frameworks may offer thin reward relative to risk.' },
      ];
    }
    return [
      { title: 'Directional', desc: 'Balanced IV: debit spreads are a defined-risk framework to compare against liquidity and spread width.' },
      { title: 'Range-Bound', desc: 'Butterfly or iron-condor frameworks can be reviewed around the expected move in balanced IV.' },
      { title: 'Event Framework', desc: 'Earnings/catalyst proximity matters. Near-term events create IV crush risk for long premium holders.' },
    ];
  }, [ivLevel]);

  return (
    <div className="space-y-3">
      {frameworks.map((p, i) => (
        <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="text-sm font-semibold">{p.title}</div>
          <div className="mt-1 text-sm text-zinc-400 leading-relaxed">{p.desc}</div>
        </div>
      ))}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 text-xs text-zinc-400">
        These are educational frameworks only. Not personal advice. Validate structure, event risk, and liquidity independently before relying on any scenario.
      </div>
    </div>
  );
}

/* ─── Formatting helpers ─────────────────────────────────────── */
function fmt(n?: number | null, decimals: number = 2) {
  if (n == null || Number.isNaN(n)) return '-';
  return n.toFixed(decimals);
}
function fmtInt(n?: number | null) {
  if (n == null || Number.isNaN(n)) return '-';
  return Math.round(n).toLocaleString();
}
function fmtPct(n?: number | null) {
  if (n == null || Number.isNaN(n)) return '-';
  return `${(n * 100).toFixed(1)}%`;
}
function twoSided(contract?: OptionsContract) {
  return !!contract && contract.bid > 0 && contract.ask >= contract.bid;
}
function quoteCell(contract: OptionsContract | undefined, side: 'bid' | 'ask') {
  if (!contract || !(contract[side] > 0)) return 'No quote';
  return fmt(side === 'bid' ? contract.bid : contract.ask);
}
