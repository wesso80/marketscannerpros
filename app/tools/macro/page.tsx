'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePolling } from '@/hooks/usePolling';
import ToolsPageHeader from '@/components/ToolsPageHeader';
import MarketStatusBadge from '@/components/MarketStatusBadge';
import { useAIPageContext } from '@/lib/ai/pageContext';
import { FREE_COPY } from '@/components/free/copy';
import { friendlyStatus } from '@/lib/free/friendlyStatus';
import { useUserTier } from '@/lib/useUserTier';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import StatTile from '@/components/visual/StatTile';
import { openMacroAnchor } from '@/lib/overview/macroAnchor';

function followMacroAnchor(event: { preventDefault(): void; currentTarget: { getAttribute(name: string): string | null } }) {
  event.preventDefault();
  const href = event.currentTarget.getAttribute('href') || '';
  if (href.startsWith('#')) window.history.pushState(null, '', href);
  openMacroAnchor(href);
}

type Permission = 'yes' | 'conditional' | 'no';
type RiskState = 'risk_on' | 'neutral' | 'risk_off';

type Driver = {
  label: string;
  impact: 'pos' | 'neg' | 'neutral';
  weight: number;
};

interface IndicatorValue {
  value: number | null;
  /** Observation date of `value` (daily rate series). */
  date?: string | null;
  history?: { date: string; value: number }[];
}

interface MacroData {
  timestamp: string;
  rates: {
    treasury3m?: IndicatorValue;
    treasury2y: IndicatorValue;
    treasury5y?: IndicatorValue;
    treasury10y: IndicatorValue;
    treasury30y?: IndicatorValue;
    yieldCurve: { value: number | null; inverted: boolean; label: string };
    yieldCurve3m10y?: { value: number | null; inverted: boolean; label: string };
    fedFunds: IndicatorValue;
  };
  inflation: {
    cpi: IndicatorValue;
    inflationRate: IndicatorValue;
    trend: string;
  };
  employment: {
    unemployment: IndicatorValue;
    trend: string;
  };
  growth: {
    realGDP: IndicatorValue & { unit: string };
  };
  regime: {
    label: string;
    description: string;
    riskLevel: 'low' | 'medium' | 'high';
  };
}

type MacroGate = {
  ts: string;
  permission: Permission;
  riskState: RiskState;
  confidencePct: number;
  sizing: 'full' | 'reduced' | 'probe' | 'none';
  liquidity: 'expanding' | 'stable' | 'contracting';
  volRegime: 'compression' | 'normal' | 'expansion';
  usdRegime: 'bullish' | 'neutral' | 'bearish';
  ratesRegime: 'easing' | 'neutral' | 'tightening';
  score: number;
  blockers: string[];
  drivers: Driver[];
  notes: string;
};

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toPct(value: number | null | undefined, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not collected';
  return `${value.toFixed(digits)}%`;
}

/** Presentation only: never changes the macro gate or provider response. */
function macroLabel(value: unknown): string {
  if (value == null) return 'Not collected';
  const text = String(value).trim();
  if (!text || /\b(unknown|unavailable|missing|undefined|NaN|N\/A)\b/i.test(text)) return 'Not collected';
  if (/^(Wait for|Monitor for)/i.test(text)) return 'Evidence does not support a clear assessment.';
  const friendly = friendlyStatus(text);
  if (friendly === FREE_COPY.unavailable) return 'Not collected';
  return friendly.replace(/alpha_vantage/gi, 'Alpha Vantage').replace(/bullish/gi, 'Rising').replace(/bearish/gi, 'Falling').replace(/_/g, ' ').replace(/\b[A-Z]{3,}\b/g, word => ['USD', 'BTC', 'SPY', 'VIX', 'GDP', 'CPI'].includes(word) ? word : word[0] + word.slice(1).toLowerCase());
}
function macroNumber(value: unknown, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : 'Not collected';
}

function trendDirection(history?: { date: string; value: number }[]) {
  if (!history || history.length < 2) return 'flat';
  const recent = history[0]?.value;
  const prior = history[Math.min(4, history.length - 1)]?.value;
  if (typeof recent !== 'number' || typeof prior !== 'number') return 'flat';
  if (recent > prior) return 'up';
  if (recent < prior) return 'down';
  return 'flat';
}

function computeMacroGate(data: MacroData | null): MacroGate | null {
  if (!data) return null;

  const fedFunds = safeNumber(data.rates.fedFunds.value);
  const treasury10y = safeNumber(data.rates.treasury10y.value);
  const yieldCurve = safeNumber(data.rates.yieldCurve.value);
  const inflationRate = safeNumber(data.inflation.inflationRate.value);
  const unemployment = safeNumber(data.employment.unemployment.value);

  const ratesRegime: MacroGate['ratesRegime'] =
    fedFunds >= 4 || treasury10y >= 4.25 ? 'tightening' : fedFunds <= 2.5 ? 'easing' : 'neutral';

  const liquidity: MacroGate['liquidity'] =
    data.rates.yieldCurve.inverted && fedFunds >= 4 ? 'contracting' : !data.rates.yieldCurve.inverted && fedFunds <= 3 ? 'expanding' : 'stable';

  const volRegime: MacroGate['volRegime'] =
    data.regime.riskLevel === 'high' ? 'expansion' : data.regime.riskLevel === 'low' ? 'compression' : 'normal';

  const usdRegime: MacroGate['usdRegime'] =
    ratesRegime === 'tightening' ? 'bullish' : ratesRegime === 'easing' ? 'bearish' : 'neutral';

  const growthDeteriorating = (data.growth.realGDP.history?.length || 0) > 1 && trendDirection(data.growth.realGDP.history) === 'down';
  const inflationReaccelerating = data.inflation.trend === 'elevated' || trendDirection(data.inflation.inflationRate.history) === 'up';

  let score = 0;
  const drivers: Driver[] = [];
  const addFactor = (label: string, impact: Driver['impact'], weight: number) => {
    drivers.push({ label, impact, weight });
    if (impact === 'pos') score += weight;
    if (impact === 'neg') score -= weight;
  };

  addFactor('Liquidity', liquidity === 'expanding' ? 'pos' : liquidity === 'contracting' ? 'neg' : 'neutral', 25);
  addFactor('Vol Regime', volRegime === 'compression' ? 'pos' : volRegime === 'expansion' ? 'neg' : 'neutral', 20);
  // USD regime is inferred from the rates regime (no measured dollar input here), so scoring it too counted the same
  // rates reading twice (Rates −15 and USD −15). It stays as a displayed context label only.
  addFactor('Rates Regime', ratesRegime === 'easing' ? 'pos' : ratesRegime === 'tightening' ? 'neg' : 'neutral', 15);
  addFactor('Growth', growthDeteriorating ? 'neg' : 'pos', 15);
  addFactor('Inflation', inflationReaccelerating ? 'neg' : 'pos', 10);

  const riskState: RiskState = score >= 25 ? 'risk_on' : score <= -25 ? 'risk_off' : 'neutral';

  const blockers: string[] = [];
  if (volRegime === 'expansion' && riskState === 'risk_off') blockers.push('Vol expansion with risk-off state');
  if (liquidity === 'contracting' && usdRegime === 'bullish') blockers.push('Contracting liquidity with strong USD');
  if (ratesRegime === 'tightening' && growthDeteriorating) blockers.push('Tightening rates with weakening growth');

  const staleHours = Math.abs(Date.now() - new Date(data.timestamp).getTime()) / (1000 * 60 * 60);
  if (staleHours > 6) blockers.push('Macro data stale (>6h)');

  const conflictingSignals = drivers.filter(d => d.impact === 'pos').length > 0 && drivers.filter(d => d.impact === 'neg').length > 0;
  const amberTriggers = [
    volRegime === 'expansion',
    liquidity !== 'expanding',
    ratesRegime === 'neutral' && inflationReaccelerating,
    conflictingSignals && Math.abs(score) <= 24,
  ].some(Boolean);

  const permission: Permission = blockers.length > 0 ? 'no' : amberTriggers ? 'conditional' : 'yes';

  let confidencePct = Math.min(95, Math.round((Math.abs(score) / 100) * 100));
  if (conflictingSignals) confidencePct = Math.max(35, confidencePct - 15);
  if (staleHours > 6) confidencePct = Math.max(25, confidencePct - 20);

  const sizing: MacroGate['sizing'] =
    permission === 'no' ? 'none' : permission === 'conditional' ? (confidencePct >= 60 ? 'reduced' : 'probe') : confidencePct >= 60 ? 'full' : 'reduced';

  const notes =
    permission === 'no'
      ? 'Analysis: Unfavorable — indicators suggest caution; wait for regime clarity.'
      : permission === 'conditional'
        ? 'Analysis: Mixed — indicators show partial alignment; review before acting.'
        : 'Analysis: Favorable — indicators broadly aligned within current regime.';

  return {
    ts: data.timestamp,
    permission,
    riskState,
    confidencePct,
    sizing,
    liquidity,
    volRegime,
    usdRegime,
    ratesRegime,
    score,
    blockers,
    drivers,
    notes,
  };
}

function Sparkline({ data, stroke }: { data?: { date: string; value: number }[]; stroke: string }) {
  if (!data || data.length < 2) return null;
  const values = data.slice(0, 12).reverse().map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 80;
      const y = 20 - ((v - min) / range) * 18;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 80 24" className="h-6 w-20">
      <polyline fill="none" stroke={stroke} strokeWidth="1.5" points={points} />
    </svg>
  );
}

export default function MacroDashboardPage({ embeddedInDashboard = false }: { embeddedInDashboard?: boolean } = {}) {
  const [data, setData] = useState<MacroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>('');
  const [commodities, setCommodities] = useState<any[] | null>(null);
  const [commodityHealth, setCommodityHealth] = useState<{ gateReady: boolean; eligibleCount: number; totalCount: number; staleSymbols: string[]; sourceAsOf?: string | null } | null>(null);
  const [correlationRegime, setCorrelationRegime] = useState<any | null>(null);
  const [spyPCRatio, setSpyPCRatio] = useState<{ ratio: number; signal: string; totalCalls: number; totalPuts: number } | null>(null);
  const [commoditiesError, setCommoditiesError] = useState<string | null>(null);
  const [correlationError, setCorrelationError] = useState<string | null>(null);
  const [spyPCRError, setSpyPCRError] = useState<string | null>(null);
  const [spyPCRFetched, setSpyPCRFetched] = useState<string | null>(null);

  const { isAdmin, tier, isLoading: tierLoading } = useUserTier();
  const { setPageData } = useAIPageContext();

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/economic-indicators?all=true');
      if (!res.ok) throw new Error('Failed to fetch economic data');
      const result = await res.json();

      if (result.error) {
        setError(result.error);
        return;
      }

      setData(result);
      setLastRefresh(new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch commodities
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/commodities');
        if (!res.ok) { setCommoditiesError(`Commodities feed unavailable (${res.status})`); return; }
        const json = await res.json();
        setCommodities(json.commodities || json.data || []);
        if (json.dataHealth) {
          setCommodityHealth({ ...json.dataHealth, sourceAsOf: json.sourceAsOf ?? null });
        }
      } catch (e: unknown) {
        setCommoditiesError(String(e));
      }
    })();
  }, []);

  // Fetch correlation regime
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/correlation-regime');
        if (!res.ok) { setCorrelationError(`Correlation feed unavailable (${res.status})`); return; }
        const json = await res.json();
        setCorrelationRegime(json);
      } catch (e: unknown) {
        setCorrelationError(String(e));
      }
    })();
  }, []);

  // Fetch SPY P/C ratio
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/options-chain?symbol=SPY&expiries=all');
        if (!res.ok) { setSpyPCRError(`Options feed unavailable (${res.status})`); return; }
        const json = await res.json();
        const contracts = json.contracts || [];
        let totalCalls = 0;
        let totalPuts = 0;
        for (const opt of contracts) {
          const oi = Number(opt.openInterest || 0);
          if (opt.type === 'call') totalCalls += oi;
          else if (opt.type === 'put') totalPuts += oi;
        }
        const ratio = totalCalls > 0 ? totalPuts / totalCalls : 0;
        const signal = ratio > 1.0 ? 'Bearish (elevated put buying)' : ratio < 0.7 ? 'Bullish (low put/call)' : 'Neutral';
        setSpyPCRatio({ ratio: Number(ratio.toFixed(2)), signal, totalCalls, totalPuts });
        setSpyPCRFetched(new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }));
      } catch (e: unknown) {
        setSpyPCRError(String(e));
      }
    })();
  }, []);

  // Auto-refresh hourly (pauses when tab hidden)
  usePolling(fetchData, autoRefresh && (isAdmin || tier === 'pro' || tier === 'pro_trader') ? 60 * 60 * 1000 : null, { immediate: true });

  const gate = useMemo(() => computeMacroGate(data), [data]);

  useEffect(() => {
    openMacroAnchor(window.location.hash);
    const onHash = () => openMacroAnchor(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [data, gate, loading]);

  useEffect(() => {
    if (!data || !gate) return;

    setPageData({
      skill: 'macro',
      symbols: [],
      summary: `Macro Gate: ${gate.permission.toUpperCase()} | ${gate.riskState.replace('_', '-')} | Score ${gate.score} | Sizing ${gate.sizing}`,
      data: {
        macroGate: {
          globalPermission: gate.permission,
          riskState: gate.riskState,
          liquidity: gate.liquidity,
          volRegime: gate.volRegime,
          usdRegime: gate.usdRegime,
          ratesRegime: gate.ratesRegime,
          drivers: gate.drivers,
          confidencePct: gate.confidencePct,
          sizing: gate.sizing,
          blockers: gate.blockers,
        },
        rates: data.rates,
        inflation: data.inflation,
        employment: data.employment,
        growth: data.growth,
      },
    });
  }, [data, gate, setPageData]);

  const completeAssessment = !!data && [data.rates.fedFunds.value, data.rates.treasury10y.value, data.rates.yieldCurve.value, data.inflation.inflationRate.value, data.employment.unemployment.value, data.growth.realGDP.value].every(value => typeof value === 'number' && Number.isFinite(value));
  const assessment = !completeAssessment ? 'Macro assessment not collected' : gate?.permission === 'yes' ? 'Aligned' : gate?.permission === 'conditional' ? 'Mixed' : 'Not aligned';
  const incompleteFeeds = [!completeAssessment && 'Required macro observations', commoditiesError && 'Commodities', correlationError && 'Cross-asset context', spyPCRError && 'Options positioning'].filter(Boolean);

  if (!isAdmin && tier !== 'pro' && tier !== 'pro_trader') return <main id="macro-summary" className="space-y-4 p-4">
    {embeddedInDashboard ? <h2 className="!text-lg font-semibold">{FREE_COPY.macro}</h2> : <h1 className="text-2xl font-semibold">{FREE_COPY.macro}</h1>}
    {tierLoading ? <p>{FREE_COPY.loading}</p> : !data ? <p data-verdict-box className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">Macro observations not collected for this view.</p> : <div className="grid gap-4 sm:grid-cols-2">
      {[[FREE_COPY.treasury, data.rates.treasury10y], [FREE_COPY.inflation, data.inflation.inflationRate]].map(([label, observation]) => {
        const item = observation as IndicatorValue;
        return typeof item.value === 'number' ? <section key={String(label)} className="rounded-xl border border-white/10 p-4"><h2>{String(label)}</h2><p className="text-4xl">{toPct(item.value)}</p><p className="text-xs text-slate-400">{item.date || "Observation date not supplied"}</p></section> : null;
      })}
    </div>}
    <SourceLine source={FREE_COPY.macroSource} asOf={data?.timestamp} basis={FREE_COPY.observation} />
    <a className="inline-flex min-h-10 items-center underline" href="/intelligence/global-m2">{FREE_COPY.deepMacro}</a><p className="text-xs">{FREE_COPY.research}</p>
  </main>;

  return (
    <div className={`${embeddedInDashboard ? '' : 'min-h-screen'} bg-[var(--msp-bg)] text-white`}>
      {embeddedInDashboard && <h2 className="!text-lg font-semibold">Macro</h2>}
      {!embeddedInDashboard && (<>
        <section
          className="rounded-lg border border-emerald-400/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,13,24,0.98))] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
          aria-label="Macro command header"
        >
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,0.9fr)]">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-extrabold uppercase tracking-[0.16em]">
                <span className="text-emerald-300">Macro lens</span>
                {gate && (
                  <span className="flex items-center gap-1.5 rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-slate-300">
                    <span style={{ color: gate.permission === 'yes' ? 'var(--msp-bull)' : gate.permission === 'conditional' ? 'var(--msp-warn)' : 'var(--msp-bear)' }}>{gate.permission.toUpperCase()}</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-400">Risk <span style={{ color: gate.riskState === 'risk_on' ? 'var(--msp-bull)' : gate.riskState === 'risk_off' ? 'var(--msp-bear)' : 'var(--msp-warn)' }}>{gate.riskState.replace('_', '-')}</span></span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-400">Vol <span className="text-slate-200">{gate.volRegime}</span></span>
                  </span>
                )}
                <label className="flex items-center gap-1.5 rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-slate-400">
                  <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="h-3 w-3" aria-label="Toggle auto refresh" />
                  Auto refresh
                </label>
              </div>
              <h2 className="mt-1 text-xl font-black tracking-normal text-white md:text-2xl">Global regime gate for liquidity, rates, growth, and cross-asset context.</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Macro evidence compressed into a single permission gate. Educational only; not a trade signal.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href="#decision" onClick={followMacroAnchor} className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-200 no-underline transition-colors hover:bg-emerald-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">Open Decision</a>
                <a href="#commodities" onClick={followMacroAnchor} className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-amber-200 no-underline transition-colors hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60">Commodities</a>
                <a href="#sentiment" onClick={followMacroAnchor} className="rounded-md border border-sky-400/35 bg-sky-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-sky-200 no-underline transition-colors hover:bg-sky-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60">Sentiment</a>
              </div>
              {lastRefresh && (
                <p className="mt-2 text-[11px] text-slate-500">US ET · Last refresh {lastRefresh}</p>
              )}
            </div>

            <div className="grid self-start gap-1.5 sm:grid-cols-2">
              <div className="min-h-[3.1rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">Permission</div>
                <div className="mt-0.5 truncate text-sm font-black" style={{ color: gate ? (gate.permission === 'yes' ? 'var(--msp-bull)' : gate.permission === 'conditional' ? 'var(--msp-warn)' : 'var(--msp-bear)') : 'var(--msp-flat)' }}>{gate ? gate.permission.toUpperCase() : 'Loading'}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">Macro gate state</div>
              </div>
              <div className="min-h-[3.1rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">Risk State</div>
                <div className="mt-0.5 truncate text-sm font-black" style={{ color: gate ? (gate.riskState === 'risk_on' ? 'var(--msp-bull)' : gate.riskState === 'risk_off' ? 'var(--msp-bear)' : 'var(--msp-warn)') : 'var(--msp-flat)' }}>{gate ? gate.riskState.replace('_', '-').toUpperCase() : 'Loading'}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500" title="USD is inferred from rates and is not scored separately">USD {gate?.usdRegime ?? '—'} (from rates) · Rates {gate?.ratesRegime ?? '—'}</div>
              </div>
              <div className="min-h-[3.1rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">Liquidity</div>
                <div className="mt-0.5 truncate text-sm font-black" style={{ color: '#A5B4FC' }}>{gate?.liquidity ?? 'Loading'}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">Volatility {gate?.volRegime ?? '—'}</div>
              </div>
              <div className="min-h-[3.1rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">Next Check</div>
                <div className="mt-0.5 truncate text-sm font-black" style={{ color: error ? 'var(--msp-bear)' : loading ? 'var(--msp-flat)' : 'var(--msp-warn)' }}>{error ? 'Refresh feed' : loading ? 'Loading…' : 'Review Decision'}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">{error ? 'Macro feed degraded' : 'Open the decision section below'}</div>
              </div>
            </div>
          </div>
        </section>
        <ToolsPageHeader
          title="Macro Dashboard"
          subtitle="Global regime layer for analysis, sizing, and cross-asset assessment"
          badge="Economic Data"
          icon="MAC"
        />
      </>)}

      <div className={`mx-auto w-full max-w-none space-y-4 ${embeddedInDashboard ? 'px-0 pb-6 pt-3' : 'px-4 pb-24 pt-6 md:px-6'}`}>

        {loading ? (
          <div data-macro-skeleton className="space-y-3" aria-busy="true">
            <div className="h-28 animate-pulse rounded-xl bg-white/5" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-white/5" />)}</div>
            <div className="h-36 animate-pulse rounded-xl bg-white/5" />
            <p className="text-sm text-slate-400">Loading macro regime…</p>
          </div>
        ) : error ? (
          <><p data-verdict-box className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">Macro observations could not be loaded.</p><button type="button" className="min-h-10 underline" onClick={fetchData}>Try again</button><SourceLine source="Macro database" basis="Published observations not collected" /></>
        ) : data && gate ? (
          <>
            <section data-global-regime className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <p className="text-xs text-slate-400">Published macro observations</p>
              <div data-verdict-box className="rounded-xl border border-white/10 p-3">
                <p className="text-3xl font-semibold" style={{ color: gate.permission === 'yes' ? 'var(--msp-bull)' : gate.permission === 'conditional' ? 'var(--msp-warn)' : 'var(--msp-bear)' }}>{assessment}</p>
                {completeAssessment && <p className="text-sm text-white/70">Score {gate.score >= 0 ? '+' : ''}{gate.score} · {macroLabel(gate.riskState)}</p>}
                <p className="mt-2 text-sm text-white/60">Rates, liquidity, growth and inflation observations.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  {label: 'Rates', value: data.rates.treasury10y.value, format: (n: number) => toPct(n)},
                  {label: 'Curve', value: data.rates.yieldCurve.value, format: (n: number) => toPct(n)},
                  {label: 'Inflation', value: data.inflation.inflationRate.value, format: (n: number) => toPct(n, 1)},
                  {label: 'US real GDP (trillion USD)', value: data.growth.realGDP.value, format: (n: number) => `$${(n / 1000).toFixed(1)}T`},
                ].filter(item => typeof item.value === 'number' && Number.isFinite(item.value)).map(item => <div data-macro-tile key={item.label}><StatTile label={item.label} value={item.format(item.value!)} /></div>)}
              </div>
              {incompleteFeeds.length > 0 && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">Not collected: {incompleteFeeds.join(' · ')}.</p>}
              <SourceLine source="Macro database" asOf={data.timestamp} basis="Published observations" />
            </section>

            {/* ─── Yield Curve ─── */}
            <section data-macro-chart id="yieldcurve" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <div className="text-sm font-semibold text-white">Treasury Yield Curve</div>
              <div className="mt-1 text-xs text-white/50">Full maturity spectrum: 3M → 2Y → 5Y → 10Y → 30Y</div>
              <div className="mt-3">
                {(() => {
                  const points = [
                    { label: '3M', value: data.rates.treasury3m?.value ?? null },
                    { label: '2Y', value: data.rates.treasury2y.value },
                    { label: '5Y', value: data.rates.treasury5y?.value ?? null },
                    { label: '10Y', value: data.rates.treasury10y.value },
                    { label: '30Y', value: data.rates.treasury30y?.value ?? null },
                  ].filter(p => typeof p.value === 'number' && Number.isFinite(p.value)) as { label: string; value: number }[];
                  if (points.length < 2) return <div className="text-xs text-white/40">Yield curve not collected: at least two measured maturities are needed.</div>;
                  const minY = Math.min(...points.map(p => p.value)) - 0.2;
                  const maxY = Math.max(...points.map(p => p.value)) + 0.2;
                  const rangeY = maxY - minY || 1;
                  const w = 400;
                  const h = 120;
                  const pad = { l: 52, r: 28, t: 24, b: 25 };
                  const pw = w - pad.l - pad.r;
                  const ph = h - pad.t - pad.b;
                  const svgPoints = points.map((p, i) => ({
                    x: pad.l + (i / (points.length - 1)) * pw,
                    y: pad.t + ph - ((p.value - minY) / rangeY) * ph,
                    ...p,
                  }));
                  const pathD = svgPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                  const inverted = (data.rates.treasury3m?.value ?? 0) > (data.rates.treasury10y.value ?? 0);
                  return (
                    <div>
                      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[500px]" style={{ height: 140 }}>
                        {/* grid lines */}
                        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
                          const y = pad.t + ph - frac * ph;
                          const val = minY + frac * rangeY;
                          return <g key={frac}><line x1={pad.l} y1={y} x2={w - pad.r} y2={y} stroke="rgba(255,255,255,0.08)" /><text x={pad.l - 4} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize="9">{val.toFixed(1)}%</text></g>;
                        })}
                        {/* curve line */}
                        <path d={pathD} fill="none" stroke={inverted ? 'var(--msp-bear)' : 'var(--msp-warn)'} strokeWidth="2" />
                        {/* dots + labels */}
                        {svgPoints.map((p, index) => (
                          <g key={p.label}>
                            <circle cx={p.x} cy={p.y} r="4" fill={inverted ? 'var(--msp-bear)' : 'var(--msp-warn)'} />
                            <text x={p.x + (index === 0 ? 6 : index === svgPoints.length - 1 ? -6 : 0)} y={p.y - 8} textAnchor={index === 0 ? "start" : index === svgPoints.length - 1 ? "end" : "middle"} fill="white" fontSize="10" fontWeight="600">{p.value.toFixed(2)}%</text>
                            <text x={p.x} y={h - 5} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="10">{p.label}</text>
                          </g>
                        ))}
                      </svg>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        <span className="text-white/60">2s10s Spread: <span className={data.rates.yieldCurve.inverted ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>{toPct(data.rates.yieldCurve.value)} {macroLabel(data.rates.yieldCurve.label)}</span></span>
                        {data.rates.yieldCurve3m10y && (
                          <span className="text-white/60">3m10y Spread: <span className={data.rates.yieldCurve3m10y.inverted ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>{toPct(data.rates.yieldCurve3m10y.value)} {macroLabel(data.rates.yieldCurve3m10y.label)}</span></span>
                        )}
                        <span className="text-white/60">Fed Funds: <span className="text-white font-semibold">{toPct(data.rates.fedFunds.value)}</span></span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </section>

            <CollapsibleSection title="Macro evidence" summary={`${gate.drivers.length} model factors · rates and cross-asset observations`}>
            <div className="space-y-4">
        <div className={`${embeddedInDashboard ? 'rounded-lg' : 'sticky top-2 z-20 rounded-xl'} border border-white/10 bg-slate-950/95 p-3 backdrop-blur`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <MarketStatusBadge showGlobal />
              <span className="text-xs text-white/60">US session · ET</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!embeddedInDashboard && (
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="h-4 w-4" />
                  Auto refresh
                </label>
              )}
              {['decision', 'rates', 'yieldcurve', 'commodities', 'correlation', 'sentiment', 'inflation', 'growth', 'employment', 'implications'].map((tab) => (
                <a key={tab} href={`#${tab}`} onClick={followMacroAnchor} className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </a>
              ))}
            </div>
          </div>
        </div>
            {completeAssessment && <CollapsibleSection title="Assessment detail" summary={`Score ${gate.score}`}>
            <section id="decision" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_420px]">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {[
                    ['Assessment', assessment],
                    ['Risk State', gate.riskState.replace('_', '-').toUpperCase()],
                    ['Liquidity', gate.liquidity],
                    ['Volatility', gate.volRegime],
                    ['USD Regime (inferred from rates, not scored)', gate.usdRegime],
                    ['Rates Regime', gate.ratesRegime],
                  ].map(([label, value]) => (
                    <div key={label} className="h-14 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <div className="text-[11px] text-white/50">{label}</div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            label === 'Assessment'
                              ? gate.permission === 'yes'
                                ? 'bg-emerald-400'
                                : gate.permission === 'conditional'
                                  ? 'bg-amber-400'
                                  : 'bg-rose-400'
                              : gate.riskState === 'risk_on'
                                ? 'bg-emerald-400'
                                : gate.riskState === 'risk_off'
                                  ? 'bg-rose-400'
                                  : 'bg-amber-400'
                          }`}
                        />
                        <span className="text-sm font-semibold text-white">{macroLabel(value)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-white/50">Score</div>
                    <div className="text-xs text-white/50">Confidence</div>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <div className="text-2xl font-semibold text-white">{gate.score >= 0 ? '+' : ''}{gate.score}</div>
                    <div className="text-sm font-semibold text-white/80">{gate.confidencePct}%</div>
                  </div>

                  <div className="mt-3 grid gap-2">
                    {gate.drivers.slice(0, 5).map((driver) => (
                      <div key={driver.label} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                        <span className="text-xs text-white/80">{driver.label}</span>
                        <span
                          className={`text-xs font-semibold ${
                            driver.impact === 'pos' ? 'text-emerald-300' : driver.impact === 'neg' ? 'text-rose-300' : 'text-slate-300'
                          }`}
                        >
                          {driver.impact === 'pos' ? 'Positive' : driver.impact === 'neg' ? 'Negative' : 'Neutral'} ({driver.weight})
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
                    {assessment} macro evidence.
                  </div>
                </div>
              </div>
            </section>
            </CollapsibleSection>}

            <CollapsibleSection title="Rates, inflation, growth, employment" summary="One line per measured series">
            <section id="rates" className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs text-white/50">Rates & Real Rates</div>
                  <Sparkline data={data.rates.treasury10y.history} stroke="#94a3b8" />
                </div>
                <div className="text-2xl font-semibold">{toPct(data.rates.treasury10y.value)}</div>
                <div className="mt-1 text-xs text-white/60">10Y Treasury{data.rates.treasury10y.date ? ` (as of ${data.rates.treasury10y.date})` : ''} • {gate.ratesRegime}</div>
              </div>

              <div id="inflation" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs text-white/50">Inflation</div>
                  <Sparkline data={data.inflation.inflationRate.history} stroke="#f87171" />
                </div>
                <div className="text-2xl font-semibold">{toPct(data.inflation.inflationRate.value, 1)}</div>
                <div className="mt-1 text-xs text-white/60">CPI YoY • {macroLabel(data.inflation.trend)}</div>
              </div>

              <div id="growth" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs text-white/50">Growth</div>
                  <Sparkline data={data.growth.realGDP.history} stroke="#94a3b8" />
                </div>
                <div className="text-2xl font-semibold">{typeof data.growth.realGDP.value === 'number' ? `$${(data.growth.realGDP.value / 1000).toFixed(1)}T` : 'Not collected'}</div>
                <div className="mt-1 text-xs text-white/60">Real GDP • {(data.growth.realGDP.history?.length ?? 0) > 1 ? trendDirection(data.growth.realGDP.history) : 'Not collected'}</div>
              </div>

              <div id="employment" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs text-white/50">Employment</div>
                  <Sparkline data={data.employment.unemployment.history} stroke="#fbbf24" />
                </div>
                <div className="text-2xl font-semibold">{toPct(data.employment.unemployment.value, 1)}</div>
                <div className="mt-1 text-xs text-white/60">Unemployment • {macroLabel(data.employment.trend)}</div>
              </div>
            </section>
            </CollapsibleSection>

            {/* ─── Commodities ─── */}
            <CollapsibleSection title="Commodities" summary="Top 4, then the rest">
            <section id="commodities" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <div className="text-sm font-semibold text-white">Commodities Monitor</div>
              <div className="mt-1 text-xs text-white/50">Oil, metals, agriculture — growth proxy and inflation signals</div>
              <div className="mt-0.5 text-[11px] text-white/30">Market data · source dates shown per row · educational context only</div>
              {commodityHealth && (
                <div className={`mt-2 rounded-md border px-2.5 py-2 text-[11px] ${commodityHealth.staleSymbols.length ? 'border-amber-500/25 bg-amber-500/5 text-amber-200' : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200'}`}>
                  Eligible {commodityHealth.eligibleCount}/{commodityHealth.totalCount}.
                  {commodityHealth.staleSymbols.length ? ` Stale and excluded from live commodity context: ${commodityHealth.staleSymbols.join(', ')}.` : ' No stale rows excluded.'}
                  {commodityHealth.sourceAsOf ? ` Latest eligible source date: ${commodityHealth.sourceAsOf}.` : ''}
                </div>
              )}
              {commodities && commodities.length > 0 ? (
                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                  {commodities.slice(0, 4).map((c: any) => (
                    <div key={c.symbol || c.name} className={`rounded-lg border p-2 ${c.eligibleForGate === false ? 'border-rose-500/25 bg-rose-500/5' : 'border-white/10 bg-black/20'}`}>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-white/50">
                        <span>{c.name || c.symbol}</span>
                        <span className={c.freshnessStatus === 'STALE' ? 'text-rose-300' : c.freshnessStatus === 'DELAYED' ? 'text-amber-300' : 'text-emerald-300'}>{macroLabel(c.freshnessStatus)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">{typeof c.price === 'number' ? `${c.price.toFixed(2)}` : 'Not collected'}</span>
                        <span className={`text-xs font-semibold ${(c.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {typeof c.changePercent === 'number' && Number.isFinite(c.changePercent) ? `${c.changePercent >= 0 ? '+' : ''}${c.changePercent.toFixed(1)}%` : 'Not collected'}
                        </span>
                      </div>
                      <div className="text-[11px] text-white/40">{macroLabel(c.category)} · {c.unit || 'Unit not supplied'}</div>
                      <div className="mt-1 text-[10px] text-white/35">
                        Observation {c.date || 'not dated'}{Number.isFinite(c.dataAgeDays) ? ` · age ${c.dataAgeDays}d` : ''}{c.sourceSymbol ? ` · proxy ${c.sourceSymbol}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-xs text-amber-400/80">
                  {commoditiesError ? 'Commodities feed could not be loaded' : commodities === null ? 'Loading commodities data…' : 'No commodity data available'}
                </div>
              )}
              {commodities && commodities.length > 4 ? (
                <details className="mt-3">
                  <summary className="min-h-10 cursor-pointer text-sm">Show all {commodities.length}</summary>
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                    {commodities.slice(4).map((c: any) => (
                      <div key={`rest-${c.symbol || c.name}`} className="rounded-lg border border-white/10 bg-black/20 p-2 text-sm">
                        <div>{c.name || c.symbol}</div>
                        {typeof c.changePercent === 'number' ? <div>{c.changePercent >= 0 ? '+' : ''}{c.changePercent.toFixed(1)}%</div> : null}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </section>
            </CollapsibleSection>

            <CollapsibleSection title="More macro detail" summary="Correlation, sentiment, and implications">
            {/* ─── Correlation Regime ─── */}
            <section id="correlation" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <div className="text-sm font-semibold text-white">Cross-Asset Correlation Regime</div>
              <div className="mt-1 text-xs text-white/50">BTC↔SPY correlation, VIX regime, USD trend, sector rotation</div>
              <div className="mt-0.5 text-[11px] text-white/30">Heuristic model · educational context · live inputs, dated below</div>
              <div className="mt-1 text-[11px] text-white/50">How this differs from Risk State: Risk State is a slow macro score (rates, liquidity, growth, inflation); this panel reads the current tape (BTC and SPY moves, VIX level, USD trend, BTC↔SPY correlation), so the two can disagree.</div>
              {correlationRegime && correlationRegime.available === false ? (
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">Cross-asset assessment not collected.</div>
                  <CrossAssetInputList inputs={correlationRegime.inputs} />
                </div>
              ) : correlationRegime ? (
                <div className="mt-3">
                  {(() => {
                    const metrics = [
                      ['Regime', macroLabel(correlationRegime.regime)],
                      ['VIX regime', macroLabel(correlationRegime.vixRegime)],
                      ['Risk score', typeof correlationRegime.riskScore === 'number' ? `${macroNumber(correlationRegime.riskScore, 0)}/100` : 'Not collected'],
                      ['Weighting factor', typeof correlationRegime.sizeMultiplier === 'number' && correlationRegime.sizeMultiplier !== 0 ? `${macroNumber(correlationRegime.sizeMultiplier)}x` : 'Not collected'],
                      ['USD trend', macroLabel(correlationRegime.dxyTrend)],
                      ['BTC–SPY correlation (20d)', macroNumber(correlationRegime.btcSpyCorrelation)],
                      ['Sector rotation', macroLabel(correlationRegime.sectorRotation)],
                      ['Gold safe haven', correlationRegime.components?.goldSafeHaven == null ? 'Not collected' : correlationRegime.components.goldSafeHaven ? 'Active' : 'Inactive'],
                    ];
                    const absent = metrics.filter(([, value]) => value === 'Not collected').map(([label]) => label);
                    return <><div className="grid grid-cols-2 gap-2 md:grid-cols-4">{metrics.filter(([, value]) => value !== 'Not collected').map(([label, value]) => <div key={label} className="rounded-lg border border-white/10 p-2"><div className="text-xs text-white/50">{label}</div><div className="text-sm">{value}</div></div>)}</div>{absent.length > 0 && <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">Not collected: {absent.join(' · ')}.</p>}</>;
                  })()}
                  {correlationRegime.warnings?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {correlationRegime.warnings.map((w: string, i: number) => (
                        <div key={i} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">{macroLabel(w)}</div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
                    {macroLabel(correlationRegime.recommendation)}
                  </div>
                  <CrossAssetInputList inputs={correlationRegime.inputs} />
                </div>
              ) : (
                <div className="mt-3 text-xs text-amber-400/80">{correlationError ? 'Cross-asset feed could not be loaded' : 'Loading correlation regime…'}</div>
              )}
            </section>

            {/* ─── SPY Put/Call Ratio (Market Sentiment) ─── */}
            <section id="sentiment" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <div className="text-sm font-semibold text-white">Market Sentiment — SPY Put/Call Ratio</div>
              <div className="mt-1 text-xs text-white/50">Aggregate options positioning as a contrarian sentiment indicator</div>
              {spyPCRFetched && <div className="mt-0.5 text-[11px] text-white/30">Computed from options OI · educational indicator only</div>}
              {spyPCRatio && spyPCRatio.totalCalls > 0 ? (
                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] text-white/50">P/C Ratio</div>
                    <div className={`mt-1 text-2xl font-semibold ${
                      spyPCRatio.ratio > 1.0 ? 'text-rose-400' : spyPCRatio.ratio < 0.7 ? 'text-emerald-400' : 'text-white'
                    }`}>{spyPCRatio.ratio}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] text-white/50">Signal</div>
                    <div className={`mt-1 text-sm font-semibold ${
                      spyPCRatio.signal.startsWith('Bearish') ? 'text-rose-400' : spyPCRatio.signal.startsWith('Bullish') ? 'text-emerald-400' : 'text-white'
                    }`}>{spyPCRatio.ratio > 1 ? 'More put than call open interest' : spyPCRatio.ratio < 0.7 ? 'Lower put than call open interest' : 'Comparable put and call open interest'}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] text-white/50">Total Call OI</div>
                    <div className="mt-1 text-sm font-semibold text-white">{spyPCRatio.totalCalls.toLocaleString()}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] text-white/50">Total Put OI</div>
                    <div className="mt-1 text-sm font-semibold text-white">{spyPCRatio.totalPuts.toLocaleString()}</div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-xs text-amber-400/80">{spyPCRError ? 'Options feed could not be loaded' : spyPCRatio ? 'Options positioning not collected: call open interest is absent.' : 'Loading SPY options data…'}</div>
              )}
            </section>

            {completeAssessment && <section id="implications" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <div className="text-sm font-semibold text-white">Implications Matrix</div>
              <div className="mt-1 text-xs text-white/50">Regime → educational scenario map across asset classes</div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/80">
                  <div className="mb-1 text-[11px] text-white/50">Equities</div>
                  {gate.permission === 'no' ? 'Defensive context; high-beta risk elevated.' : gate.permission === 'conditional' ? 'Quality growth context; small-cap risk reduced.' : 'Growth + cyclicals showing supportive context.'}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/80">
                  <div className="mb-1 text-[11px] text-white/50">Crypto</div>
                  {gate.riskState === 'risk_off' ? 'BTC-led defensive context; alts/meme risk elevated.' : gate.riskState === 'neutral' ? 'BTC + majors context only.' : 'BTC + selective alts rotation context.'}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/80">
                  <div className="mb-1 text-[11px] text-white/50">Vol</div>
                  {gate.volRegime === 'expansion' ? 'Volatility expansion; directional scenario risk elevated.' : gate.volRegime === 'compression' ? 'Volatility compression; trend-follow context may improve.' : 'Normal volatility; standard scenario review.'}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/80">
                  <div className="mb-1 text-[11px] text-white/50">USD</div>
                  {gate.usdRegime === 'bullish' ? 'USD headwind for risk assets.' : gate.usdRegime === 'bearish' ? 'USD tailwind for risk assets.' : 'USD neutral; defer to micro regime.'}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/80">
                  <div className="mb-1 text-[11px] text-white/50">Rates</div>
                  {gate.ratesRegime === 'tightening' ? 'Duration headwind.' : gate.ratesRegime === 'easing' ? 'Duration tailwind.' : 'Rates neutral; balanced duration.'}
                </div>
              </div>
            </section>}

            <section className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <div className="text-sm font-semibold text-white">Macro Event Awareness</div>
              <div className="mt-1 text-xs text-white/50">Key recurring catalysts to monitor</div>
              <div className="mt-3 grid gap-2">
                {[
                  { label: 'FOMC Rate Decision / Minutes', time: 'See Fed calendar', impact: 'High' },
                  { label: 'Initial Jobless Claims', time: 'Thursdays 08:30 ET', impact: 'High' },
                  { label: 'PCE / CPI Inflation Release', time: 'Monthly schedule', impact: 'High' },
                ].map((event) => (
                  <div key={event.label} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <div>
                      <div className="text-sm text-white">{event.label}</div>
                      <div className="text-xs text-white/50">{event.time}</div>
                    </div>
                    <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[11px] font-semibold text-amber-300">{event.impact}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-white/40 text-center">Check an economic calendar for exact dates and times.</p>
            </section>
            </CollapsibleSection>

            <details className="rounded-xl border border-white/10 bg-white/5" open={false}>
              <summary className="cursor-pointer list-none px-3 py-3 md:px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-xl">Deep Dive: Rates</summary>
              <div className="border-t border-white/10 p-3 md:p-4 text-xs text-white/75">
                10Y: {toPct(data.rates.treasury10y.value)} • 2Y: {toPct(data.rates.treasury2y.value)} • Curve: {toPct(data.rates.yieldCurve.value)} ({macroLabel(data.rates.yieldCurve.label)})
              </div>
            </details>

            <details className="rounded-xl border border-white/10 bg-white/5" open={false}>
              <summary className="cursor-pointer list-none px-3 py-3 md:px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-xl">Deep Dive: Inflation</summary>
              <div className="border-t border-white/10 p-3 md:p-4 text-xs text-white/75">
                CPI: {macroNumber(data.inflation.cpi.value, 1)} • Inflation YoY: {toPct(data.inflation.inflationRate.value, 1)} • Trend: {macroLabel(data.inflation.trend)}
              </div>
            </details>

            <details className="rounded-xl border border-white/10 bg-white/5" open={false}>
              <summary className="cursor-pointer list-none px-3 py-3 md:px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-xl">Deep Dive: Employment</summary>
              <div className="border-t border-white/10 p-3 md:p-4 text-xs text-white/75">
                Unemployment: {toPct(data.employment.unemployment.value, 1)} • Trend: {macroLabel(data.employment.trend)}
              </div>
            </details>

            <details className="rounded-xl border border-white/10 bg-white/5" open={false}>
              <summary className="cursor-pointer list-none px-3 py-3 md:px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-xl">Deep Dive: Growth</summary>
              <div className="border-t border-white/10 p-3 md:p-4 text-xs text-white/75">
                Real GDP: {typeof data.growth.realGDP.value === 'number' ? `$${(data.growth.realGDP.value / 1000).toFixed(1)}T` : 'Not collected'} • Trend: {(data.growth.realGDP.history?.length ?? 0) > 1 ? trendDirection(data.growth.realGDP.history) : 'Not collected'}
              </div>
            </details>

            {isAdmin && !embeddedInDashboard && (
              <details className="rounded-xl border border-emerald-500/30 bg-emerald-500/5" open={false}>
                <summary className="cursor-pointer list-none px-3 py-3 md:px-4 text-sm font-semibold text-emerald-300">Admin: Macro Gate Debug</summary>
                <div className="border-t border-emerald-500/20 p-3 md:p-4 text-xs text-emerald-100/90">
                  <div>Score: {gate.score} • Alignment: {gate.permission} • Sizing: {gate.sizing}</div>
                  <div className="mt-2">Blockers: {gate.blockers.length ? gate.blockers.join(' | ') : 'None'}</div>
                  <div className="mt-2">Drivers: {gate.drivers.map((d) => `${d.label}:${d.impact}(${d.weight})`).join(' | ')}</div>
                </div>
              </details>
            )}

            </div>
            </CollapsibleSection>
          </>
        ) : null}
      </div>
    </div>
  );
}

type CrossAssetInputInfo = { label: string; available: boolean; value: number | null; changePct: number | null; asOf: string | null; source: string | null; note?: string };

/** Per-input values and dates behind the Cross-Asset regime; missing inputs are listed as unavailable (never defaulted). */
function CrossAssetInputList({ inputs }: { inputs?: Record<string, CrossAssetInputInfo> | null }) {
  if (!inputs) return null;
  const fmt = (i: CrossAssetInputInfo) => {
    if (!i.available) return 'Not collected';
    const parts: string[] = [];
    if (i.value != null) parts.push(Math.abs(i.value) >= 1000 ? i.value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : String(Number(i.value.toFixed(3))));
    if (i.changePct != null) parts.push(`${i.changePct >= 0 ? '+' : ''}${i.changePct.toFixed(2)}%`);
    if (i.asOf) parts.push(`as of ${i.asOf.slice(0, 10)}`);
    return parts.join(' · ') || 'available';
  };
  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-white/50">
      <div className="mb-1 font-semibold text-white/60">Inputs</div>
      {Object.entries(inputs).map(([k, i]) => (
        <div key={k} title={macroLabel(i.source)}><span className="text-white/70">{macroLabel(i.label)}:</span> <span className={i.available ? '' : 'text-amber-300/80'}>{fmt(i)}</span></div>
      ))}
    </div>
  );
}
