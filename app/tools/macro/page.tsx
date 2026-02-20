'use client';

import { useEffect, useMemo, useState } from 'react';
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
    treasury10y: IndicatorValue;
    treasury2y: IndicatorValue;
    yieldCurve: { value: number | null; inverted: boolean; label: string };
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
      ? 'Permission: No — stand down; protect capital and wait for regime reset.'
      : permission === 'conditional'
        ? 'Permission: Conditional — deploy reduced size and avoid high-beta chasing.'
        : 'Permission: Yes — risk deployment allowed within playbook constraints.';

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

  const { isAdmin } = useUserTier();
  const { setPageData } = useAIPageContext();

  useEffect(() => {
    const fetchData = async () => {
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
    };

    fetchData();
    if (autoRefresh) {
      const interval = setInterval(fetchData, 60 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

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
    <div className="min-h-screen bg-[#0B1120] text-white">
      <ToolsPageHeader
        title="Macro Dashboard"
        subtitle="Global regime layer for permission, sizing, and cross-asset deployment"
        badge="Economic Data"
        icon="🏛️"
      />

      <div className="mx-auto w-full max-w-[1280px] space-y-4 px-4 pb-24 pt-6 md:px-6">
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
              {['decision', 'rates', 'inflation', 'growth', 'employment', 'implications'].map((tab) => (
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
              <div className="text-sm font-semibold text-white">Scheduled Events (US ET)</div>
              <div className="mt-1 text-xs text-white/50">Next 24h / 7d macro catalysts</div>
              <div className="mt-3 grid gap-2">
                {[
                  { label: 'Fed Governor Speech', time: 'Tomorrow 10:00 ET', impact: 'High' },
                  { label: 'Initial Jobless Claims', time: 'Thursday 08:30 ET', impact: 'High' },
                  { label: 'PCE Inflation Release', time: 'Friday 08:30 ET', impact: 'High' },
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
