'use client';

import { useState, useCallback } from 'react';
import GECommandStrip from '@/src/features/goldenEgg/components/GECommandStrip';
import GEHeaderBar from '@/src/features/goldenEgg/components/GEHeaderBar';
import GEDecisionStrip from '@/src/features/goldenEgg/components/layer1/GEDecisionStrip';
import GEPlanGrid from '@/src/features/goldenEgg/components/layer2/GEPlanGrid';
import GEExecutionCard from '@/src/features/goldenEgg/components/layer2/GEExecutionCard';
import GESetupCard from '@/src/features/goldenEgg/components/layer2/GESetupCard';
import GEEvidenceStack from '@/src/features/goldenEgg/components/layer3/GEEvidenceStack';
import GECard from '@/src/features/goldenEgg/components/shared/GECard';
import GEEmptyState from '@/src/features/goldenEgg/components/shared/GEEmptyState';
import GESectionHeader from '@/src/features/goldenEgg/components/shared/GESectionHeader';
import { isNoTrade } from '@/src/features/goldenEgg/selectors';
import type { GoldenEggPayload } from '@/src/features/goldenEgg/types';

export default function GoldenEggPage() {
  const [symbol, setSymbol] = useState('');
  const [payload, setPayload] = useState<GoldenEggPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const analyze = useCallback(async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) { setError('Enter a symbol'); return; }
    setLoading(true);
    setError('');
    setPayload(null);
    try {
      const res = await fetch(`/api/golden-egg?symbol=${encodeURIComponent(sym)}`);
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Analysis failed'); return; }
      setPayload(json.data);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') analyze();
  };

  const noTrade = payload ? isNoTrade(payload) : false;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--msp-bg)] text-slate-100">
      <GEHeaderBar />

      <main className="mx-auto w-full max-w-[1280px] px-4 pb-24">
        {/* ── Symbol Search ───────────────────────────────────── */}
        <div className="mx-auto mt-6 flex max-w-md items-center gap-2">
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="Enter symbol (e.g. AAPL, BTC, NVDA)"
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/40 outline-none focus:border-[var(--msp-accent)] focus:ring-1 focus:ring-[var(--msp-accent)]"
            disabled={loading}
          />
          <button
            onClick={analyze}
            disabled={loading || !symbol.trim()}
            className="rounded-lg bg-[var(--msp-accent)] px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>

        {error && (
          <div className="mx-auto mt-3 max-w-md rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-center text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-12 flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[var(--msp-accent)]" />
            <p className="text-sm text-white/50">Fetching live data and computing analysis…</p>
          </div>
        )}

        {/* ── Empty State ─────────────────────────────────────── */}
        {!payload && !loading && !error && (
          <div className="mt-16 text-center">
            <div className="mb-3 text-5xl">🥚</div>
            <h2 className="text-xl font-bold text-white/80">Golden Egg Decision Engine</h2>
            <p className="mt-2 text-sm text-white/40">Enter a symbol to generate a live multi-factor trade analysis</p>
            <div className="mx-auto mt-4 flex flex-wrap justify-center gap-2">
              {['AAPL', 'NVDA', 'BTC', 'TSLA', 'SPY', 'ETH'].map((s) => (
                <button
                  key={s}
                  onClick={() => { setSymbol(s); }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60 transition hover:border-[var(--msp-accent)]/50 hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Live Results ────────────────────────────────────── */}
        {payload && (
          <>
            <GECommandStrip meta={payload.meta} layer1={payload.layer1} />

            <section id="layer-1" className="mt-4">
              <GEDecisionStrip layer1={payload.layer1} meta={payload.meta} />
            </section>

            <section id="layer-2" className="mt-4">
              {noTrade ? (
                <GECard title="Plan" variant="warning">
                  <GESectionHeader title="Waiting For" />
                  <ul className="mt-2 space-y-2 text-sm text-slate-200">
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

            <section id="layer-3" className="mt-4">
              <GEEvidenceStack layer3={payload.layer3} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
