'use client';

import { useState, useCallback, useEffect } from 'react';
import GEHeaderBar from '@/src/features/goldenEgg/components/GEHeaderBar';
import GEDecisionStrip from '@/src/features/goldenEgg/components/layer1/GEDecisionStrip';
import GEPlanGrid from '@/src/features/goldenEgg/components/layer2/GEPlanGrid';
import GEExecutionCard from '@/src/features/goldenEgg/components/layer2/GEExecutionCard';
import GESetupCard from '@/src/features/goldenEgg/components/layer2/GESetupCard';
import GEEvidenceStack from '@/src/features/goldenEgg/components/layer3/GEEvidenceStack';
import GEDeepSection from '@/src/features/goldenEgg/components/deep/GEDeepSection';
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
            <p className="text-sm text-white/40">Enter a symbol above to generate a live multi-factor trade analysis</p>
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────── */}
        {payload && (
          <div className="mt-8 space-y-8">
            {/* Symbol Hero */}
            <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-slate-800/60 to-slate-900/60 px-6 py-8 text-center">
              <div className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
                {payload.meta.assetClass} &bull; {payload.meta.timeframe}
              </div>
              <h2 className="mt-2 text-4xl font-bold text-white">{payload.meta.symbol}</h2>
              <div className={`mt-3 text-3xl font-bold ${payload.layer1.direction === 'SHORT' ? 'text-rose-400' : 'text-emerald-400'}`}>
                ${(payload.meta.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="mt-4">
                <span className={`inline-block rounded-lg px-5 py-2 text-sm font-bold ${
                  payload.layer1.direction === 'LONG' ? 'bg-emerald-500 text-black' :
                  payload.layer1.direction === 'SHORT' ? 'bg-rose-500 text-white' :
                  'bg-slate-600 text-white'
                }`}>
                  {payload.layer1.direction === 'LONG' ? 'BUY' : payload.layer1.direction === 'SHORT' ? 'SELL' : 'NEUTRAL'}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-400">
                Score: {payload.layer1.confidence}/100 &bull; Grade {payload.layer1.grade}
              </p>
            </div>

            {/* Decision Analysis */}
            <section>
              <SectionTitle icon="📊" title="Quick Summary &amp; Signal Breakdown" />
              <GEDecisionStrip layer1={payload.layer1} />
            </section>

            {/* Trade Plan */}
            <section>
              <SectionTitle icon="🎯" title="Trade Plan" />
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
                      title="Do not execute"
                      body="Permission is NO_TRADE. Set alerts on flip conditions and wait for structure confirmation."
                    />
                  </div>
                </GECard>
              ) : (
                <GEPlanGrid>
                  <GESetupCard setup={payload.layer2.setup} />
                  <GEExecutionCard execution={payload.layer2.execution} permission={payload.layer1.permission} />
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
