'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePolling } from '@/hooks/usePolling';
import ToolsPageHeader from '@/components/ToolsPageHeader';
import MarketStatusBadge from '@/components/MarketStatusBadge';
import { useAIPageContext } from '@/lib/ai/pageContext';
import { useUserTier } from '@/lib/useUserTier';

type Permission = 'yes' | 'conditional' | 'no';
type RiskState = 'risk_on' | 'neutral' | 'risk_off';

type Driver = {
  label: string;
  impact: 'pos' | 'neg' | 'neutral';
  weight: number;
};

interface IndicatorValue {
  value: number | null;
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
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(digits)}%`;
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
  addFactor('USD Regime', usdRegime === 'bearish' ? 'pos' : usdRegime === 'bullish' ? 'neg' : 'neutral', 15);
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

export default function MacroDashboardPage() {
  const [data, setData] = useState<MacroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>('');
  const [commodities, setCommodities] = useState<any[] | null>(null);
  const [correlationRegime, setCorrelationRegime] = useState<any | null>(null);
  const [spyPCRatio, setSpyPCRatio] = useState<{ ratio: number; signal: string; totalCalls: number; totalPuts: number } | null>(null);

  const { isAdmin } = useUserTier();
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
        if (res.ok) {
          const json = await res.json();
          setCommodities(json.commodities || json.data || []);
        }
      } catch {}
    })();
  }, []);

  // Fetch correlation regime
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/correlation-regime');
        if (res.ok) {
          const json = await res.json();
          setCorrelationRegime(json);
        }
      } catch {}
    })();
  }, []);

  // Fetch SPY P/C ratio
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/options-chain?symbol=SPY');
        if (res.ok) {
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
        }
      } catch {}
    })();
  }, []);

  // Auto-refresh hourly (pauses when tab hidden)
  usePolling(fetchData, autoRefresh ? 60 * 60 * 1000 : null, { immediate: true });

  const gate = useMemo(() => computeMacroGate(data), [data]);

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

  return (
    <div className="min-h-screen bg-[var(--msp-bg)] text-white">
      <ToolsPageHeader
        title="Macro Dashboard"
        subtitle="Global regime layer for analysis, sizing, and cross-asset assessment"
        badge="Economic Data"
        icon="🏛️"
      />

      <div className="mx-auto w-full max-w-none space-y-4 px-4 pb-24 pt-6 md:px-6">
        <div className="sticky top-2 z-20 rounded-xl border border-white/10 bg-slate-950/95 p-3 backdrop-blur">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <MarketStatusBadge showGlobal />
              <span className="text-xs text-white/60">US ET {lastRefresh ? `• Last refresh ${lastRefresh}` : ''}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-white/70">
                <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="h-4 w-4" />
                Auto refresh
              </label>
              {['decision', 'rates', 'yieldcurve', 'commodities', 'correlation', 'sentiment', 'inflation', 'growth', 'employment', 'implications'].map((tab) => (
                <a key={tab} href={`#${tab}`} className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10">
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </a>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-emerald-500" />
            <p className="text-slate-400">Finding macro regime data...</p>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/50 bg-red-500/20 p-6 text-center text-red-400">⚠️ {error}</div>
        ) : data && gate ? (
          <>
            <section id="decision" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_420px]">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {[
                    ['Permission', gate.permission.toUpperCase()],
                    ['Risk State', gate.riskState.replace('_', '-').toUpperCase()],
                    ['Liquidity', gate.liquidity],
                    ['Volatility', gate.volRegime],
                    ['USD Regime', gate.usdRegime],
                    ['Rates Regime', gate.ratesRegime],
                  ].map(([label, value]) => (
                    <div key={label} className="h-14 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <div className="text-[11px] text-white/50">{label}</div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            label === 'Permission'
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
                        <span className="text-sm font-semibold text-white">{value}</span>
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
                          {driver.impact.toUpperCase()} ({driver.weight})
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
                    {gate.notes}
                  </div>
                </div>
              </div>
            </section>

            <section id="rates" className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs text-white/50">Rates & Real Rates</div>
                  <Sparkline data={data.rates.treasury10y.history} stroke="#60a5fa" />
                </div>
                <div className="text-2xl font-semibold">{toPct(data.rates.treasury10y.value)}</div>
                <div className="mt-1 text-xs text-white/60">10Y Treasury • {gate.ratesRegime}</div>
              </div>

              <div id="inflation" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs text-white/50">Inflation</div>
                  <Sparkline data={data.inflation.inflationRate.history} stroke="#f87171" />
                </div>
                <div className="text-2xl font-semibold">{toPct(data.inflation.inflationRate.value, 1)}</div>
                <div className="mt-1 text-xs text-white/60">CPI YoY • {data.inflation.trend}</div>
              </div>

              <div id="growth" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs text-white/50">Growth</div>
                  <Sparkline data={data.growth.realGDP.history} stroke="#34d399" />
                </div>
                <div className="text-2xl font-semibold">${(safeNumber(data.growth.realGDP.value) / 1000).toFixed(1)}T</div>
                <div className="mt-1 text-xs text-white/60">Real GDP • {trendDirection(data.growth.realGDP.history)}</div>
              </div>

              <div id="employment" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs text-white/50">Employment</div>
                  <Sparkline data={data.employment.unemployment.history} stroke="#fbbf24" />
                </div>
                <div className="text-2xl font-semibold">{toPct(data.employment.unemployment.value, 1)}</div>
                <div className="mt-1 text-xs text-white/60">Unemployment • {data.employment.trend}</div>
              </div>
            </section>

            {/* ─── Yield Curve ─── */}
            <section id="yieldcurve" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
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
                  ].filter(p => p.value !== null) as { label: string; value: number }[];
                  if (points.length < 2) return <div className="text-xs text-white/40">Yield data loading…</div>;
                  const minY = Math.min(...points.map(p => p.value)) - 0.2;
                  const maxY = Math.max(...points.map(p => p.value)) + 0.2;
                  const rangeY = maxY - minY || 1;
                  const w = 400;
                  const h = 120;
                  const pad = { l: 40, r: 20, t: 10, b: 25 };
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
                        <path d={pathD} fill="none" stroke={inverted ? '#f87171' : '#60a5fa'} strokeWidth="2" />
                        {/* dots + labels */}
                        {svgPoints.map(p => (
                          <g key={p.label}>
                            <circle cx={p.x} cy={p.y} r="4" fill={inverted ? '#f87171' : '#60a5fa'} />
                            <text x={p.x} y={p.y - 8} textAnchor="middle" fill="white" fontSize="10" fontWeight="600">{p.value.toFixed(2)}%</text>
                            <text x={p.x} y={h - 5} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="10">{p.label}</text>
                          </g>
                        ))}
                      </svg>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        <span className="text-white/60">2s10s Spread: <span className={data.rates.yieldCurve.inverted ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>{toPct(data.rates.yieldCurve.value)} {data.rates.yieldCurve.label}</span></span>
                        {data.rates.yieldCurve3m10y && (
                          <span className="text-white/60">3m10y Spread: <span className={data.rates.yieldCurve3m10y.inverted ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>{toPct(data.rates.yieldCurve3m10y.value)} {data.rates.yieldCurve3m10y.label}</span></span>
                        )}
                        <span className="text-white/60">Fed Funds: <span className="text-white font-semibold">{toPct(data.rates.fedFunds.value)}</span></span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </section>

            {/* ─── Commodities ─── */}
            <section id="commodities" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <div className="text-sm font-semibold text-white">Commodities Monitor</div>
              <div className="mt-1 text-xs text-white/50">Oil, metals, agriculture — growth proxy and inflation signals</div>
              {commodities && commodities.length > 0 ? (
                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                  {commodities.map((c: any) => (
                    <div key={c.symbol || c.name} className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-white/50">{c.name || c.symbol}</div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">${typeof c.price === 'number' ? c.price.toFixed(2) : 'N/A'}</span>
                        <span className={`text-xs font-semibold ${(c.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {(c.changePercent ?? 0) >= 0 ? '+' : ''}{typeof c.changePercent === 'number' ? c.changePercent.toFixed(1) : '0.0'}%
                        </span>
                      </div>
                      <div className="text-[10px] text-white/40">{c.category}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-xs text-white/40">{commodities === null ? 'Loading commodities data…' : 'No commodity data available'}</div>
              )}
            </section>

            {/* ─── Correlation Regime ─── */}
            <section id="correlation" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <div className="text-sm font-semibold text-white">Cross-Asset Correlation Regime</div>
              <div className="mt-1 text-xs text-white/50">BTC↔SPY correlation, VIX regime, DXY trend, sector rotation</div>
              {correlationRegime ? (
                <div className="mt-3">
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-white/50">Regime</div>
                      <div className={`mt-1 text-sm font-semibold ${
                        correlationRegime.regime === 'RISK_ON' ? 'text-emerald-400' :
                        correlationRegime.regime === 'RISK_OFF' || correlationRegime.regime === 'STRESS' ? 'text-rose-400' :
                        'text-amber-400'
                      }`}>{correlationRegime.regime.replace('_', ' ')}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-white/50">VIX Regime</div>
                      <div className={`mt-1 text-sm font-semibold ${
                        correlationRegime.vixRegime === 'LOW' ? 'text-emerald-400' :
                        correlationRegime.vixRegime === 'EXTREME' ? 'text-rose-400' :
                        correlationRegime.vixRegime === 'ELEVATED' ? 'text-amber-400' :
                        'text-white'
                      }`}>{correlationRegime.vixRegime}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-white/50">Risk Score</div>
                      <div className="mt-1 text-sm font-semibold text-white">{correlationRegime.riskScore}/100</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-white/50">Size Multiplier</div>
                      <div className="mt-1 text-sm font-semibold text-white">{correlationRegime.sizeMultiplier}x</div>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-white/50">DXY Trend</div>
                      <div className="mt-1 text-xs text-white/80">{correlationRegime.dxyTrend}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-white/50">BTC↔SPY Corr</div>
                      <div className="mt-1 text-xs text-white/80">{correlationRegime.btcSpyCorrelation}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-white/50">Sector Rotation</div>
                      <div className="mt-1 text-xs text-white/80">{correlationRegime.sectorRotation?.replace('_', ' ') || 'MIXED'}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-white/50">Gold Safe Haven</div>
                      <div className="mt-1 text-xs text-white/80">{correlationRegime.components?.goldSafeHaven ? '⚠️ Active' : 'Inactive'}</div>
                    </div>
                  </div>
                  {correlationRegime.warnings?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {correlationRegime.warnings.map((w: string, i: number) => (
                        <div key={i} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">{w}</div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
                    {correlationRegime.recommendation}
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-xs text-white/40">Loading correlation regime…</div>
              )}
            </section>

            {/* ─── SPY Put/Call Ratio (Market Sentiment) ─── */}
            <section id="sentiment" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <div className="text-sm font-semibold text-white">Market Sentiment — SPY Put/Call Ratio</div>
              <div className="mt-1 text-xs text-white/50">Aggregate options positioning as a contrarian sentiment indicator</div>
              {spyPCRatio ? (
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
                    }`}>{spyPCRatio.signal}</div>
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
                <div className="mt-3 text-xs text-white/40">Loading SPY options data…</div>
              )}
            </section>

            <section id="implications" className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <div className="text-sm font-semibold text-white">Implications Matrix</div>
              <div className="mt-1 text-xs text-white/50">Regime → best deployment map across asset classes</div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/80">
                  <div className="mb-1 text-[11px] text-white/50">Equities</div>
                  {gate.permission === 'no' ? 'Defensive only; avoid high-beta.' : gate.permission === 'conditional' ? 'Quality growth favored; small caps reduced.' : 'Growth + cyclicals allowed with discipline.'}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/80">
                  <div className="mb-1 text-[11px] text-white/50">Crypto</div>
                  {gate.riskState === 'risk_off' ? 'BTC-led defense; alts/meme off.' : gate.riskState === 'neutral' ? 'Selective BTC + majors only.' : 'BTC + selective alts rotation on.'}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/80">
                  <div className="mb-1 text-[11px] text-white/50">Vol</div>
                  {gate.volRegime === 'expansion' ? 'Buy vol / reduce directional size.' : gate.volRegime === 'compression' ? 'Sell vol / trend follow allowed.' : 'Normal vol; standard execution.'}
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
            </section>

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
              <p className="mt-2 text-[10px] text-white/40 text-center">Check an economic calendar for exact dates and times.</p>
            </section>

            <details className="rounded-xl border border-white/10 bg-white/5" open={false}>
              <summary className="cursor-pointer list-none px-3 py-3 md:px-4 text-sm font-semibold text-white">Deep Dive: Rates</summary>
              <div className="border-t border-white/10 p-3 md:p-4 text-xs text-white/75">
                10Y: {toPct(data.rates.treasury10y.value)} • 2Y: {toPct(data.rates.treasury2y.value)} • Curve: {toPct(data.rates.yieldCurve.value)} ({data.rates.yieldCurve.label})
              </div>
            </details>

            <details className="rounded-xl border border-white/10 bg-white/5" open={false}>
              <summary className="cursor-pointer list-none px-3 py-3 md:px-4 text-sm font-semibold text-white">Deep Dive: Inflation</summary>
              <div className="border-t border-white/10 p-3 md:p-4 text-xs text-white/75">
                CPI: {safeNumber(data.inflation.cpi.value).toFixed(1)} • Inflation YoY: {toPct(data.inflation.inflationRate.value, 1)} • Trend: {data.inflation.trend}
              </div>
            </details>

            <details className="rounded-xl border border-white/10 bg-white/5" open={false}>
              <summary className="cursor-pointer list-none px-3 py-3 md:px-4 text-sm font-semibold text-white">Deep Dive: Employment</summary>
              <div className="border-t border-white/10 p-3 md:p-4 text-xs text-white/75">
                Unemployment: {toPct(data.employment.unemployment.value, 1)} • Trend: {data.employment.trend}
              </div>
            </details>

            <details className="rounded-xl border border-white/10 bg-white/5" open={false}>
              <summary className="cursor-pointer list-none px-3 py-3 md:px-4 text-sm font-semibold text-white">Deep Dive: Growth</summary>
              <div className="border-t border-white/10 p-3 md:p-4 text-xs text-white/75">
                Real GDP: ${((safeNumber(data.growth.realGDP.value)) / 1000).toFixed(1)}T • Trend: {trendDirection(data.growth.realGDP.history)}
              </div>
            </details>

            {isAdmin && (
              <details className="rounded-xl border border-emerald-500/30 bg-emerald-500/5" open={false}>
                <summary className="cursor-pointer list-none px-3 py-3 md:px-4 text-sm font-semibold text-emerald-300">Admin: Macro Gate Debug</summary>
                <div className="border-t border-emerald-500/20 p-3 md:p-4 text-xs text-emerald-100/90">
                  <div>Score: {gate.score} • Permission: {gate.permission} • Sizing: {gate.sizing}</div>
                  <div className="mt-2">Blockers: {gate.blockers.length ? gate.blockers.join(' | ') : 'None'}</div>
                  <div className="mt-2">Drivers: {gate.drivers.map((d) => `${d.label}:${d.impact}(${d.weight})`).join(' | ')}</div>
                </div>
              </details>
            )}

            <p className="text-center text-xs text-slate-500">Global regime object is active in AI context for cross-page consumption.</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
