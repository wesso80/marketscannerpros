'use client';
import { useSearchParams } from 'next/navigation';

import { useState, useCallback, useEffect, useRef } from 'react';
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
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import StatCard from '@/components/visual/StatCard';
import SourceLine from '@/components/visual/SourceLine';
import { volatilityText } from './displayText';
import { volatilityBadgeLabel, volatilityHeadingLabel } from '@/lib/presentation/volatilityLayerLabel';
import { type RiskFlag } from '@/components/market/RiskFlagPanel';
import { buildMarketDataProviderStatus } from '@/lib/scanner/providerStatus';

const QUICK_SYMBOLS = ['BTC', 'ETH', 'AAPL', 'TSLA', 'NVDA', 'SPX', 'GOLD'];

function SectionTitle({ code }: { code: string }) {
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="shrink-0 whitespace-nowrap rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[0.62rem] font-semibold text-amber-300">{volatilityBadgeLabel(code)}</span>
      <h2 className="min-w-0 text-xs font-semibold text-amber-300">{volatilityHeadingLabel(code)}</h2>
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
  const params = useSearchParams();
  const requestedSymbol = params.get('symbol')?.toUpperCase() || 'SPY';
  const [symbol, setSymbol] = useState(requestedSymbol);
  const [reading, setReading] = useState<DVEReading | null>(null);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cached, setCached] = useState(false);
  const [freshness, setFreshness] = useState<Pick<DVEApiResponse, 'computedAt' | 'dataAsOf' | 'dataFreshness'>>({});

  const analyze = useCallback(async (sym?: string) => {
    const s = (sym || symbol).trim().toUpperCase();
    if (!s) { setError('Enter a symbol'); return; }
    if (sym) setSymbol(s);
    setLoading(true);
    setError('');
    setReading(null);
    setCurrentPrice(0);
    setCached(false);
    setFreshness({});
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
      setFreshness({ computedAt: json.computedAt, dataAsOf: json.dataAsOf, dataFreshness: json.dataFreshness });
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') analyze();
  };

  // A ?symbol= link (e.g. from Golden Egg or the Terminal) runs the analysis, instead of only filling the box (RS-18).
  const analyzeRef = useRef(analyze);
  analyzeRef.current = analyze;
  useEffect(() => {
    setSymbol(requestedSymbol);
    setReading(null);
    if (requestedSymbol) void analyzeRef.current(requestedSymbol);
  }, [requestedSymbol]);

  // Stale comes from the age of the price bars (session-aware, from the API), not from a cache hit: a result cached
  // inside the 3-minute TTL is as current as the bars it was computed from.
  const barsAsOf = freshness.dataAsOf ? ` (last bar ${freshness.dataAsOf.slice(0, 16).replace('T', ' ')})` : '';
  const dveProviderStatus = reading ? buildMarketDataProviderStatus({
    source: 'dve',
    provider: cached ? `dve cached result${freshness.computedAt ? `, computed ${new Date(freshness.computedAt).toLocaleTimeString()}` : ''}` : 'dve live calculation',
    stale: freshness.dataFreshness === 'stale',
    degraded: reading.dataQuality.score < 80 || reading.dataQuality.missing.length > 0 || reading.dataQuality.warnings.length > 0,
    warnings: [
      freshness.dataFreshness === 'stale' ? `Price data is stale${barsAsOf}.` : null,
      freshness.dataFreshness === 'delayed' ? `Price data is delayed${barsAsOf}.` : null,
      freshness.dataFreshness === 'unknown' ? 'Price bar time unavailable; freshness unknown.' : null,
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
      coverageScore: Math.round(reading.dataQuality.score),
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
    <div data-volatility-page className="min-w-0 bg-[var(--msp-bg)] text-slate-100 [&_button]:min-h-10 [&_summary]:min-h-10">
      <header className="border-b border-white/10 px-4 py-3"><div className="mx-auto max-w-[1280px]"><h1 className="text-xl font-bold">Volatility</h1><p data-volatility-verdict className="mt-1 text-sm">{loading ? 'Collecting volatility evidence…' : error ? 'Volatility reading not collected' : reading ? `${reading.symbol} · ${volatilityText(reading.label)}` : 'Choose a symbol to collect a reading'}</p></div></header>

      <main className="mx-auto w-full max-w-[1280px] px-4 pb-24">
        {/* Search */}
        <div className="mx-auto mt-3 max-w-lg">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1.5">
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="Enter symbol (e.g. BTC, AAPL, TSLA)"
              aria-label="Volatility symbol"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-white placeholder-white/40 outline-none"
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
            <p className="text-sm text-white/50">Collecting volatility evidence…</p>
          </div>
        )}

        {!reading && !loading && !error && (
          <div className="mt-20 text-center">
            <p className="text-sm text-white/40">Enter a symbol above to collect volatility evidence</p>
          </div>
        )}

        {/* Results */}
        {reading && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <StatCard label="BBWP percentile" value={reading.volatility.bbwp.toFixed(1)} />
              <StatCard label="Pressure score" value={reading.direction.score.toFixed(0)} />
              <StatCard label="Breakout score" value={`${reading.breakout.score.toFixed(0)}/100`} />
              <StatCard label="Data coverage" value={`${reading.dataQuality.score.toFixed(0)}%`} />
            </div>
            {(reading.dataQuality.missing.length > 0 || reading.dataQuality.warnings.length > 0 || freshness.dataFreshness !== 'fresh') && <p className="text-xs text-amber-300">{freshness.dataFreshness === 'stale' ? 'Price bars are stale. ' : freshness.dataFreshness === 'delayed' ? 'Price bars are delayed. ' : freshness.dataFreshness === 'unknown' ? 'Price bar date not collected. ' : ''}{reading.dataQuality.missing.length > 0 ? `${reading.dataQuality.missing.length} inputs not collected. ` : ''}{reading.dataQuality.warnings.map(volatilityText).join(' ')}</p>}
            <div data-volatility-chart><VEHeatmapGauge vol={reading.volatility} /></div>
            <CollapsibleSection title="Evidence and limits" summary={`${reading.dataQuality.score.toFixed(0)}% coverage · ${dveRiskFlags.length} flags`}>
              <div className="space-y-3 text-sm">{dveEvidenceItems.map(item=><p key={item.label}><strong>{volatilityText(item.label)}:</strong> {volatilityText(item.value)} · {volatilityText(item.detail)}</p>)}
              {dveRiskFlags.length ? <ul className="list-disc pl-4">{dveRiskFlags.map((flag,i)=><li key={i}>{volatilityText(flag.label)}</li>)}</ul> : <p>No trap, exhaustion or data-quality flags recorded.</p>}
              {dveMarketStatusItems.map(item=><p key={item.label}>{volatilityText(item.label)} · {item.coverageScore == null ? 'Coverage not collected' : `${Math.round(item.coverageScore)}% coverage`}</p>)}</div>
            </CollapsibleSection>
            <CollapsibleSection title="Phase detail" summary={`${volatilityText(reading.volatility.regime)} · ${reading.exhaustion.level.toFixed(0)}/100 exhaustion`}>
              <VETrapAlert trap={reading.trap} />
              <VEVolatilityPhaseCard volatility={reading.volatility} phase={reading.phasePersistence} breakout={reading.breakout} trap={reading.trap} exhaustion={reading.exhaustion} invalidation={reading.invalidation} flags={reading.flags} dataQuality={reading.dataQuality} />
            </CollapsibleSection>

            {/* LAYER 1: Volatility State */}
            <CollapsibleSection title="Breakout evidence" summary={`${reading.breakout.score.toFixed(0)}/100 · ${volatilityText(reading.breakout.label)}`}>
              <SectionTitle code="VOL" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <VEBreakoutPanel breakout={reading.breakout} missingInputs={reading.dataQuality.missing} />
              </div>
            </CollapsibleSection>

            {/* LAYER 2: Directional Bias */}
            <CollapsibleSection title="Directional pressure" summary={`${volatilityText(reading.direction.bias)} · ${reading.direction.confidence.toFixed(0)}% confluence`}>
              <SectionTitle code="DIR" />
              <VEDirectionalCompass dir={reading.direction} missingInputs={reading.dataQuality.missing} />
            </CollapsibleSection>

            {/* LAYER 3: Phase Persistence */}
            <CollapsibleSection title="Phase persistence" summary={`${reading.phasePersistence.contraction.active ? 'Contraction' : reading.phasePersistence.expansion.active ? 'Expansion' : 'No active phase'}`}>
              <SectionTitle code="PH" />
              <VEPhasePanel phase={reading.phasePersistence} />
            </CollapsibleSection>

            {/* LAYER 4: Signal + Invalidation */}
            <CollapsibleSection title="Signal and invalidation" summary={reading.signal.type === 'none' ? 'No active signal' : `${volatilityText(reading.signal.state)} · ${reading.signal.strength.toFixed(0)}/100`}>
              <SectionTitle code="SIG" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <VESignalCard
                signal={reading.signal}
                volatility={reading.volatility}
                direction={reading.direction}
                exhaustion={reading.exhaustion}
              />
                <VEInvalidationCard inv={reading.invalidation} />
              </div>
            </CollapsibleSection>

            {/* LAYER 5: Outcome Projection */}
            <CollapsibleSection title="Projection" summary={reading.projection.signalType === 'none' ? 'Volatility range · no active signal' : `${reading.projection.projectionQualityScore == null ? 'Quality not collected' : `${Math.round(reading.projection.projectionQualityScore)}/100 quality`}`}>
              <SectionTitle code="PROJ" />
              <VEProjectionCard
                proj={reading.projection}
                volatility={reading.volatility}
                phase={reading.phasePersistence}
                currentPrice={currentPrice}
              />
            </CollapsibleSection>

            {/* Supporting: Regime Outlook */}
            <CollapsibleSection title="Regime context" summary={`${volatilityText(reading.transition.from)} → ${volatilityText(reading.transition.to)}`}>
              <SectionTitle code="SUP" />
              <VERegimeTimeline
                transition={reading.transition}
                exhaustion={reading.exhaustion}
                flags={reading.flags}
                summary={reading.summary}
                volatility={reading.volatility}
                phase={reading.phasePersistence}
              />
            </CollapsibleSection>
            <SourceLine source="Volatility calculation" asOf={freshness.dataAsOf?.includes('T') ? freshness.dataAsOf : undefined} tradingDay={freshness.dataAsOf ? `Price bar session ${freshness.dataAsOf}` : 'Price bar date not collected'} basis={cached ? 'Cached reading; freshness based on price bars' : 'Calculated from price bars'} />
          </div>
        )}
        <p className="mt-4 text-xs text-slate-400">General information only, not financial advice.</p>
      </main>
    </div>
  );
}
