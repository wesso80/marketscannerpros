'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import GEHeaderBar from '@/src/features/goldenEgg/components/GEHeaderBar';
import GESignalHero from '@/src/features/goldenEgg/components/GESignalHero';
import GERegimeBar from '@/src/features/goldenEgg/components/GERegimeBar';
import GETimeframeContext from '@/src/features/goldenEgg/components/GETimeframeContext';
import GEConfluenceHeatmap from '@/src/features/goldenEgg/components/GEConfluenceHeatmap';
import GEDecisionStrip from '@/src/features/goldenEgg/components/layer1/GEDecisionStrip';
import GEPlanGrid from '@/src/features/goldenEgg/components/layer2/GEPlanGrid';
import GEExecutionCard from '@/src/features/goldenEgg/components/layer2/GEExecutionCard';
import GESetupCard from '@/src/features/goldenEgg/components/layer2/GESetupCard';
import GEDVEConditions from '@/src/features/goldenEgg/components/layer2/GEDVEConditions';
import GEEvidenceStack from '@/src/features/goldenEgg/components/layer3/GEEvidenceStack';
import GEDeepSection from '@/src/features/goldenEgg/components/deep/GEDeepSection';
import GEVolatilityGauge from '@/src/features/goldenEgg/components/GEVolatilityGauge';
import GEBreakoutReadiness from '@/src/features/goldenEgg/components/GEBreakoutReadiness';
import GEVolTrapAlert from '@/src/features/goldenEgg/components/GEVolTrapAlert';
import GECard from '@/src/features/goldenEgg/components/shared/GECard';
import GEEmptyState from '@/src/features/goldenEgg/components/shared/GEEmptyState';
import { isNoTrade } from '@/src/features/goldenEgg/selectors';
import type { GoldenEggPayload, DeepAnalysisData } from '@/src/features/goldenEgg/types';

const QUICK_SYMBOLS = ['AAPL', 'BTC', 'TSLA', 'ETH', 'NVDA', 'EURUSD', 'GOLD'];

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-base">{icon}</span>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-400">{title}</h2>
    </div>
  );
}

export default function GoldenEggPage() {
  const [symbol, setSymbol] = useState('');
  const [payload, setPayload] = useState<GoldenEggPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Deep analysis (progressive second fetch)
  const [deep, setDeep] = useState<DeepAnalysisData | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepError, setDeepError] = useState('');

  const analyze = useCallback(async (sym?: string) => {
    const s = (sym || symbol).trim().toUpperCase();
    if (!s) { setError('Enter a symbol'); return; }
    if (sym) setSymbol(s);
    setLoading(true);
    setError('');
    setPayload(null);
    setDeep(null);
    setDeepError('');
    try {
      const res = await fetch(`/api/golden-egg?symbol=${encodeURIComponent(s)}`);
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Analysis failed'); return; }
      setPayload(json.data);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  // Fetch deep analysis after main payload loads
  useEffect(() => {
    if (!payload) return;
    const sym = payload.meta.symbol;
    let cancelled = false;

    async function fetchDeep() {
      setDeepLoading(true);
      setDeepError('');
      try {
        const res = await fetch(`/api/deep-analysis?symbol=${encodeURIComponent(sym)}`);
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) { setDeepError(json.error || 'Deep analysis unavailable'); return; }
        setDeep(json as DeepAnalysisData);
      } catch {
        if (!cancelled) setDeepError('Unable to load deep analysis');
      } finally {
        if (!cancelled) setDeepLoading(false);
      }
    }

    fetchDeep();
    return () => { cancelled = true; };
  }, [payload]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') analyze();
  };

  const noTrade = payload ? isNoTrade(payload) : false;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--msp-bg)] text-slate-100">
      <GEHeaderBar />

      <main className="mx-auto w-full max-w-[1280px] px-4 pb-24">
        {/* ── Search ──────────────────────────────────────────── */}
        <div className="mx-auto mt-8 max-w-lg">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1.5">
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="Enter symbol (e.g. AAPL, BTC, NVDA)"
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white placeholder-white/40 outline-none"
              disabled={loading}
            />
            <button
              onClick={() => analyze()}
              disabled={loading || !symbol.trim()}
              className="rounded-lg bg-emerald-500 px-6 py-2.5 text-sm font-bold text-black transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {loading ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {QUICK_SYMBOLS.map((s) => (
              <button
                key={s}
                onClick={() => analyze(s)}
                disabled={loading}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  symbol === s
                    ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                    : 'border-white/10 bg-white/5 text-white/60 hover:border-amber-500/40 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mx-auto mt-4 max-w-lg rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-center text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-16 flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
            <p className="text-sm text-white/50">Fetching live data and computing analysis…</p>
          </div>
        )}

        {/* ── Empty State ─────────────────────────────────────── */}
        {!payload && !loading && !error && (
          <div className="mt-20 text-center">
            <p className="text-sm text-white/40">Enter a symbol above to generate a live multi-factor research analysis</p>
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────── */}
        {payload && (
          <div className="mt-8 space-y-8">
            {/* Signal Hero — dominant score display */}
            <GESignalHero
              meta={payload.meta}
              layer1={payload.layer1}
              setupType={payload.layer2.setup.setupType}
              volatility={payload.layer3.structure.volatility}
            />

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href={`/tools/portfolio?add=${encodeURIComponent(payload.meta.symbol)}&price=${payload.meta.price}&side=${payload.layer1.direction === 'SHORT' ? 'short' : 'long'}`}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-400 no-underline transition hover:bg-emerald-500/20"
              >
                Add to Portfolio
              </Link>
              <Link
                href={`/tools/alerts?symbol=${encodeURIComponent(payload.meta.symbol)}&price=${payload.meta.price}&direction=${payload.layer1.direction === 'LONG' ? 'bullish' : payload.layer1.direction === 'SHORT' ? 'bearish' : 'neutral'}`}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/60 no-underline transition hover:bg-white/10"
              >
                Set Alert
              </Link>
              <Link
                href={`/tools/scanner/backtest?symbol=${encodeURIComponent(payload.meta.symbol)}`}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/60 no-underline transition hover:bg-white/10"
              >
                Backtest
              </Link>
            </div>

            {/* Regime + Timeframe + Confluence row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <GERegimeBar structure={payload.layer3.structure} />
              <GETimeframeContext
                setupType={payload.layer2.setup.setupType}
                timeframe={payload.meta.timeframe}
              />
            </div>

            {/* Volatility Trap Alert (conditional) */}
            <GEVolTrapAlert volatility={payload.layer3.structure.volatility} />

            {/* DVE Volatility Gauge + Breakout Readiness (conditional on DVE data) */}
            {payload.layer3.structure.volatility.bbwp != null && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <GEVolatilityGauge volatility={payload.layer3.structure.volatility} />
                <GEBreakoutReadiness volatility={payload.layer3.structure.volatility} />
              </div>
            )}

            {/* Confluence Heatmap */}
            <section>
              <SectionTitle icon="🔥" title="Confluence Heatmap" />
              <GEConfluenceHeatmap
                scoreBreakdown={payload.layer1.scoreBreakdown}
                confidence={payload.layer1.confidence}
              />
            </section>

            {/* Decision Analysis */}
            <section>
              <SectionTitle icon="📊" title="Quick Summary &amp; Signal Breakdown" />
              <GEDecisionStrip layer1={payload.layer1} />
            </section>

            {/* Market Structure Map */}
            <section>
              <SectionTitle icon="🎯" title="Market Structure Map" />
              {noTrade ? (
                <GECard title="Waiting For" variant="warning">
                  <ul className="space-y-2 text-sm text-slate-200">
                    {payload.layer1.flipConditions.map((condition) => (
                      <li key={condition.id} className="rounded-xl border border-white/5 bg-white/5 px-3 py-2">
                        {condition.text}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3">
                    <GEEmptyState
                      title="Conditions not aligned"
                      body="Confluence is insufficient. Set alerts on flip conditions and monitor for structure changes."
                    />
                  </div>
                </GECard>
              ) : (
                <GEPlanGrid>
                  <GESetupCard setup={payload.layer2.setup} />
                  <GEExecutionCard scenario={payload.layer2.scenario} assessment={payload.layer1.assessment} />
                  <GEDVEConditions volatility={payload.layer3.structure.volatility} />
                </GEPlanGrid>
              )}
            </section>

            {/* Evidence Stack */}
            <section>
              <SectionTitle icon="🔍" title="Evidence Stack" />
              <GEEvidenceStack layer3={payload.layer3} />
            </section>

            {/* Deep Analysis (progressive load) */}
            <section>
              <SectionTitle icon="🧠" title="Deep Analysis" />
              <GEDeepSection deep={deep} loading={deepLoading} error={deepError} />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
