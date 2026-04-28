'use client';

import { useState, useCallback } from 'react';
import type { DVEReading, DVEApiResponse } from '@/src/features/volatilityEngine/types';
import VEHeatmapGauge from '@/src/features/volatilityEngine/components/VEHeatmapGauge';
import VEDirectionalCompass from '@/src/features/volatilityEngine/components/VEDirectionalCompass';
import VEPhasePanel from '@/src/features/volatilityEngine/components/VEPhasePanel';
import VESignalCard from '@/src/features/volatilityEngine/components/VESignalCard';
import VEProjectionCard from '@/src/features/volatilityEngine/components/VEProjectionCard';
import VEInvalidationCard from '@/src/features/volatilityEngine/components/VEInvalidationCard';
import VEBreakoutPanel from '@/src/features/volatilityEngine/components/VEBreakoutPanel';
import VETrapAlert from '@/src/features/volatilityEngine/components/VETrapAlert';
import VERegimeTimeline from '@/src/features/volatilityEngine/components/VERegimeTimeline';
import VEVolatilityPhaseCard from '@/src/features/volatilityEngine/components/VEVolatilityPhaseCard';
import DataFreshnessBadge from '@/components/market/DataFreshnessBadge';
import EvidenceStack from '@/components/market/EvidenceStack';
import MarketStatusStrip from '@/components/market/MarketStatusStrip';
import RiskFlagPanel, { type RiskFlag } from '@/components/market/RiskFlagPanel';
import { buildMarketDataProviderStatus } from '@/lib/scanner/providerStatus';

const QUICK_SYMBOLS = ['BTC', 'ETH', 'AAPL', 'TSLA', 'NVDA', 'SPX', 'GOLD'];

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-base">{icon}</span>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-400">{title}</h2>
    </div>
  );
}

function evidenceStatus(value: boolean) {
  return value ? 'supportive' as const : 'conflicting' as const;
}

function riskSeverity(label: string): RiskFlag['severity'] {
  const lower = label.toLowerCase();
  if (lower.includes('detected') || lower.includes('extreme') || lower.includes('climax') || lower.includes('unavailable')) return 'critical';
  if (lower.includes('candidate') || lower.includes('high') || lower.includes('missing') || lower.includes('warning')) return 'warning';
  return 'info';
}

export default function VolatilityEnginePage() {
  const [symbol, setSymbol] = useState('');
  const [reading, setReading] = useState<DVEReading | null>(null);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cached, setCached] = useState(false);

  const analyze = useCallback(async (sym?: string) => {
    const s = (sym || symbol).trim().toUpperCase();
    if (!s) { setError('Enter a symbol'); return; }
    if (sym) setSymbol(s);
    setLoading(true);
    setError('');
    setReading(null);
    setCurrentPrice(0);
    setCached(false);
    try {
      const res = await fetch(`/api/dve?symbol=${encodeURIComponent(s)}`);
      const json: DVEApiResponse = await res.json();
      if (!json.success || !json.data) {
        setError(json.error || 'Analysis failed');
        return;
      }
      setReading(json.data);
      setCurrentPrice(json.price ?? 0);
      setCached(!!json.cached);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') analyze();
  };

  const dveProviderStatus = reading ? buildMarketDataProviderStatus({
    source: 'dve',
    provider: cached ? 'dve cached result' : 'dve live calculation',
    stale: cached,
    degraded: reading.dataQuality.score < 80 || reading.dataQuality.missing.length > 0 || reading.dataQuality.warnings.length > 0,
    warnings: [
      cached ? 'DVE result served from cache.' : null,
      reading.dataQuality.score < 80 ? `DVE data quality ${reading.dataQuality.score.toFixed(0)}%.` : null,
      ...reading.dataQuality.missing.map((item) => `Missing input: ${item}.`),
      ...reading.dataQuality.warnings,
    ].filter(Boolean) as string[],
  }) : null;
  const dveMarketStatusItems = reading ? [
    {
      label: 'DVE',
      status: dveProviderStatus,
      source: cached ? 'cache' : 'calculation',
      coverageScore: Math.round(reading.dataQuality.score),
      warnings: reading.dataQuality.warnings,
    },
    {
      label: 'Inputs',
      status: buildMarketDataProviderStatus({
        source: 'dve-inputs',
        provider: 'DVE input stack',
        degraded: reading.dataQuality.missing.length > 0,
        warnings: reading.dataQuality.missing.map((item) => `Missing input: ${item}.`),
      }),
      coverageScore: Math.max(0, 100 - (reading.dataQuality.missing.length * 20)),
    },
    {
      label: 'Projection',
      status: buildMarketDataProviderStatus({
        source: 'dve-projection',
        provider: 'DVE projection model',
        degraded: reading.projection.projectionQuality === 'low' || Boolean(reading.projection.projectionWarning),
        warnings: reading.projection.projectionWarning ? [reading.projection.projectionWarning] : [],
      }),
      coverageScore: reading.projection.projectionQualityScore ?? null,
    },
  ] : [];
  const dveEvidenceItems = reading ? [
    {
      label: 'Volatility Regime',
      value: reading.volatility.regime.toUpperCase(),
      status: evidenceStatus(reading.volatility.regimeConfidence >= 50),
      detail: `${reading.volatility.regimeConfidence.toFixed(0)}% confluence with BBWP ${reading.volatility.bbwp.toFixed(0)}.`
    },
    {
      label: 'Directional Pressure',
      value: reading.direction.bias.toUpperCase(),
      status: evidenceStatus(reading.direction.confidence >= 40),
      detail: `${reading.direction.confidence.toFixed(0)}% confluence, score ${reading.direction.score.toFixed(0)}.`
    },
    {
      label: 'Phase State',
      value: reading.phasePersistence.contraction.active ? 'CONTRACTION' : reading.phasePersistence.expansion.active ? 'EXPANSION' : 'MIXED',
      status: reading.phasePersistence.contraction.active || reading.phasePersistence.expansion.active ? 'supportive' as const : 'neutral' as const,
      detail: `Contraction exit ${reading.phasePersistence.contraction.exitProbability.toFixed(0)}%, expansion exit ${reading.phasePersistence.expansion.exitProbability.toFixed(0)}%.`
    },
    {
      label: 'Signal Projection',
      value: (reading.projection.projectionQuality ?? 'unavailable').toUpperCase(),
      status: reading.projection.projectionQuality === 'high' ? 'supportive' as const : reading.projection.projectionQuality === 'low' ? 'conflicting' as const : 'neutral' as const,
      detail: reading.projection.projectionWarning || `${reading.projection.projectionQualityScore ?? 0}/100 projection quality score.`
    },
  ] : [];
  const dveRiskFlags = reading ? [
    reading.trap.detected ? 'Volatility trap detected.' : reading.trap.candidate ? 'Volatility trap candidate.' : null,
    reading.exhaustion.label === 'HIGH' || reading.exhaustion.label === 'EXTREME' ? `Exhaustion ${reading.exhaustion.label}.` : null,
    reading.flags.includes('CLIMAX_WARNING') ? 'Climax warning active.' : null,
    reading.dataQuality.missing.length > 0 ? `${reading.dataQuality.missing.length} missing DVE input${reading.dataQuality.missing.length === 1 ? '' : 's'}.` : null,
    reading.invalidation.priceInvalidation == null && reading.invalidation.phaseInvalidation == null ? 'Invalidation level unavailable.' : null,
    ...reading.dataQuality.warnings.slice(0, 3),
  ].filter(Boolean).map((label) => ({
    label: label as string,
    severity: riskSeverity(label as string),
    detail: 'Limits confidence in this DVE read until resolved or confirmed by later data.',
  })) : [];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--msp-bg)] text-slate-100">
      {/* Header */}
      <header className="border-b border-white/10 bg-white/[0.02] px-4 py-4">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3">
          <span className="text-xl">⚡</span>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-white">Phase Intelligence Console</h1>
            <p className="text-[0.62rem] text-white/40">Directional Volatility Engine — 5-Layer Analysis</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-4 pb-24">
        {/* Search */}
        <div className="mx-auto mt-8 max-w-lg">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1.5">
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="Enter symbol (e.g. BTC, AAPL, TSLA)"
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
            <p className="text-sm text-white/50">Computing 5-layer volatility analysis…</p>
          </div>
        )}

        {!reading && !loading && !error && (
          <div className="mt-20 text-center">
            <p className="text-sm text-white/40">Enter a symbol above to generate a phase intelligence analysis</p>
          </div>
        )}

        {/* Results */}
        {reading && (
          <div className="mt-8 space-y-8">
            {/* Meta bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-white">{reading.symbol}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[0.62rem] font-bold text-white/50">
                  {reading.label}
                </span>
                {cached && (
                  <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[0.55rem] font-bold text-blue-400">CACHED</span>
                )}
              </div>
              <DataFreshnessBadge status={dveProviderStatus} label={`Data ${reading.dataQuality.score.toFixed(0)}%`} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <EvidenceStack title="DVE Evidence Stack" items={dveEvidenceItems} />
              <RiskFlagPanel title="DVE Risk Flags" flags={dveRiskFlags} emptyText="No active DVE trap, exhaustion, invalidation, or data-quality flags." />
            </div>

            <MarketStatusStrip items={dveMarketStatusItems} className="md:grid-cols-3" />

            {/* Trap Alert (conditional) */}
            <VETrapAlert trap={reading.trap} />

            <VEVolatilityPhaseCard
              volatility={reading.volatility}
              phase={reading.phasePersistence}
              breakout={reading.breakout}
              trap={reading.trap}
              exhaustion={reading.exhaustion}
              invalidation={reading.invalidation}
              flags={reading.flags}
              dataQuality={reading.dataQuality}
            />

            {/* LAYER 1: Volatility State */}
            <section>
              <SectionTitle icon="🌡️" title="Layer 1 — Volatility State" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <VEHeatmapGauge vol={reading.volatility} />
                <VEBreakoutPanel breakout={reading.breakout} missingInputs={reading.dataQuality.missing} />
              </div>
            </section>

            {/* LAYER 2: Directional Bias */}
            <section>
              <SectionTitle icon="🧭" title="Layer 2 — Directional Bias" />
              <VEDirectionalCompass dir={reading.direction} missingInputs={reading.dataQuality.missing} />
            </section>

            {/* LAYER 3: Phase Persistence */}
            <section>
              <SectionTitle icon="⏱️" title="Layer 3 — Phase Persistence" />
              <VEPhasePanel phase={reading.phasePersistence} />
            </section>

            {/* LAYER 4: Signal + Invalidation */}
            <section>
              <SectionTitle icon="📡" title="Layer 4 — Signal &amp; Invalidation" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <VESignalCard
                signal={reading.signal}
                volatility={reading.volatility}
                direction={reading.direction}
                exhaustion={reading.exhaustion}
              />
                <VEInvalidationCard inv={reading.invalidation} />
              </div>
            </section>

            {/* LAYER 5: Outcome Projection */}
            <section>
              <SectionTitle icon="📊" title="Layer 5 — Outcome Projection" />
              <VEProjectionCard
                proj={reading.projection}
                volatility={reading.volatility}
                phase={reading.phasePersistence}
                currentPrice={currentPrice}
              />
            </section>

            {/* Supporting: Regime Outlook */}
            <section>
              <SectionTitle icon="🎯" title="Supporting Analysis" />
              <VERegimeTimeline
                transition={reading.transition}
                exhaustion={reading.exhaustion}
                flags={reading.flags}
                summary={reading.summary}
                volatility={reading.volatility}
                phase={reading.phasePersistence}
              />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
