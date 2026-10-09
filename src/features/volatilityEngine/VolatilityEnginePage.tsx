'use client';
import { useSearchParams } from 'next/navigation';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { PublicDveReading as DVEReading, DVEApiResponse } from '@/src/features/volatilityEngine/types';
import VEHeatmapGauge from '@/src/features/volatilityEngine/components/VEHeatmapGauge';
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
import PriceEvidencePanel from '@/components/research/PriceEvidencePanel';
import { bbwpBasisNote, type PriceEvidence } from '@/lib/research/priceEvidence';
import { bbwpDisplay, measuredBbwp, breakoutConditions, phaseDuration, projectionStudy, stretchDescription } from '@/lib/research/volatilityDescriptions';

const QUICK_SYMBOLS = ['BTC', 'ETH', 'AAPL', 'TSLA', 'NVDA', 'SPX', 'GOLD'];

function SectionTitle({ code }: { code: string }) {
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="shrink-0 whitespace-nowrap rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[0.62rem] font-semibold text-amber-300">{volatilityBadgeLabel(code)}</span>
      <h2 className="min-w-0 text-xs font-semibold text-amber-300">{volatilityHeadingLabel(code)}</h2>
    </div>
  );
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
  const [priceEvidence, setPriceEvidence] = useState<PriceEvidence | null>(null);

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
    setPriceEvidence(null);
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
      setPriceEvidence(json.priceEvidence ?? null);
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

  // W3 DVE v2: factual availability per input instead of the engine's weighted coverage score.
  const notCollected = reading ? reading.availability.inputs.filter((i) => i.status === 'not collected' || i.status === 'partial') : [];
  const applicable = reading ? reading.availability.inputs.filter((i) => i.status !== 'not applicable') : [];
  const collectedCount = applicable.filter((i) => i.status === 'collected').length;
  const study = reading ? projectionStudy(reading.projection) : null;
  const dveEvidenceItems = reading ? [
    {
      label: 'Volatility Regime',
      value: reading.volatility.regime ? reading.volatility.regime.toUpperCase() : 'NOT AVAILABLE',
      status: 'neutral' as const,
      detail: (() => { const b = bbwpDisplay(reading.volatility); return b.value == null ? (b.note ?? 'BBWP not available.') : `BBWP ${b.value}.${b.note ? ` ${b.note}` : ''}`; })()
    },
    {
      label: 'Phase State',
      value: !reading.phasePersistence ? 'NOT AVAILABLE' : reading.phasePersistence.contraction.active ? 'CONTRACTION' : reading.phasePersistence.expansion.active ? 'EXPANSION' : 'MIXED',
      status: 'neutral' as const,
      detail: !reading.phasePersistence ? 'Phase lengths need BBWP, which is not available.' : reading.phasePersistence.contraction.active ? phaseDuration('contraction', reading.phasePersistence.contraction.stats) : reading.phasePersistence.expansion.active ? phaseDuration('expansion', reading.phasePersistence.expansion.stats) : 'No contraction or expansion phase is active.'
    },
    {
      label: 'Past-case study (historical returns)',
      value: reading.projection.signalType === 'none' ? 'NO RECORDED RULE' : `${reading.projection.sampleSize} CASES`,
      status: 'neutral' as const,
      detail: study ? study.lines[0] : 'No recorded rule, so no past-case study.'
    },
  ] : [];
  const dveRiskFlags = reading ? [
    reading.volatility.bbwp == null ? 'BBWP not available: regime, phase and BBWP conditions are not measured.' : null,
    ...notCollected.map((i) => `${i.input} not fully collected: ${i.detail}.`),
    ...reading.availability.warnings.slice(0, 3),
  ].filter(Boolean).map((label) => ({
    label: label as string,
    severity: riskSeverity(label as string),
    detail: 'Limits what this reading can show until the input is collected.',
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
              <StatCard label="BBWP percentile" value={bbwpDisplay(reading.volatility).value ?? 'Not available'} />
              <StatCard label="Regime" value={reading.volatility.regime ? volatilityText(reading.volatility.regime) : 'Not available'} />
              <StatCard label="Breakout setting" value={(() => { const known = breakoutConditions(reading.breakout).conditions.filter((c) => c.present !== null); return known.length ? `${known.filter((c) => c.present).length} of ${known.length} conditions` : 'Not collected'; })()} />
              <StatCard label="Inputs collected" value={`${collectedCount} of ${applicable.length}`} />
            </div>
            {(notCollected.length > 0 || reading.availability.warnings.length > 0 || freshness.dataFreshness !== 'fresh') && <p className="text-xs text-amber-300">{freshness.dataFreshness === 'stale' ? 'Price bars are stale. ' : freshness.dataFreshness === 'delayed' ? 'Price bars are delayed. ' : freshness.dataFreshness === 'unknown' ? 'Price bar date not collected. ' : ''}{notCollected.length > 0 ? `Not fully collected: ${notCollected.map((i) => i.input).join(', ')}. ` : ''}{reading.availability.warnings.map(volatilityText).join(' ')}</p>}
            <div data-volatility-chart><VEHeatmapGauge vol={reading.volatility} /></div>
            <CollapsibleSection title="Evidence and limits" summary={`${collectedCount} of ${applicable.length} inputs collected · ${dveRiskFlags.length} limits`}>
              <div className="space-y-3 text-sm">{dveEvidenceItems.map(item=><p key={item.label}><strong>{volatilityText(item.label)}:</strong> {volatilityText(item.value)} · {volatilityText(item.detail)}</p>)}
              {dveRiskFlags.length ? <ul className="list-disc pl-4">{dveRiskFlags.map((flag,i)=><li key={i}>{volatilityText(flag.label)}</li>)}</ul> : <p>Every input this reading uses was collected.</p>}
              <ul data-input-availability className="space-y-1">{reading.availability.inputs.map((i)=><li key={i.input} className="break-words"><strong>{i.input}:</strong> {i.status} · {i.detail}</li>)}</ul></div>
            </CollapsibleSection>
            <CollapsibleSection title="Phase detail" summary={`${reading.volatility.regime ? volatilityText(reading.volatility.regime) : 'BBWP not available'} · ${stretchDescription(reading.stretch)}`}>
              <VETrapAlert pinned={reading.pinnedCompression} />
              <VEVolatilityPhaseCard volatility={reading.volatility} phase={reading.phasePersistence} breakout={reading.breakout} pinned={reading.pinnedCompression} stretch={reading.stretch} invalidation={reading.invalidation} availability={reading.availability} />
            </CollapsibleSection>

            {/* LAYER 1: Volatility State */}
            <CollapsibleSection title="Breakout evidence" summary={breakoutConditions(reading.breakout).headline.split('.')[0]}>
              <SectionTitle code="VOL" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <VEBreakoutPanel breakout={reading.breakout} />
              </div>
            </CollapsibleSection>

            {/* W3: the engine's directional pressure (a points total and its sign) is not published. */}

            {/* LAYER 3: Phase Persistence */}
            <CollapsibleSection title="Phase persistence" summary={!reading.phasePersistence ? 'Not available (needs BBWP)' : reading.phasePersistence.contraction.active ? 'Contraction' : reading.phasePersistence.expansion.active ? 'Expansion' : 'No active phase'}>
              <SectionTitle code="PH" />
              {reading.phasePersistence ? <VEPhasePanel phase={reading.phasePersistence} /> : <p className="text-sm text-white/50">Phase lengths come from the BBWP series, which is not available for this symbol.</p>}
            </CollapsibleSection>

            {/* LAYER 4: Signal + Invalidation */}
            <CollapsibleSection title="Signal and invalidation" summary={reading.signal.type === 'none' ? 'No active signal' : `${volatilityText(reading.signal.type)} · ${volatilityText(reading.signal.state)}`}>
              <SectionTitle code="SIG" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <VESignalCard signal={reading.signal} />
                <VEInvalidationCard inv={reading.invalidation} />
              </div>
            </CollapsibleSection>

            {/* LAYER 5: Outcome Projection */}
            <CollapsibleSection title="Projection" summary={reading.projection.signalType === 'none' ? 'Daily range size · no recorded rule' : `Historical returns · ${reading.projection.sampleSize} past cases${reading.projection.period ? ` · ${reading.projection.period.from ?? '?'} to ${reading.projection.period.to ?? '?'}` : ''}`}>
              <SectionTitle code="PROJ" />
              <VEProjectionCard
                proj={reading.projection}
                volatility={reading.volatility}
                phase={reading.phasePersistence ?? undefined}
                currentPrice={currentPrice}
              />
            </CollapsibleSection>

            {/* Supporting: Regime Outlook */}
            <CollapsibleSection title="Regime context" summary={`${reading.regime.current ? volatilityText(reading.regime.current) : 'Not available'}${reading.regime.observation ? ` · ${volatilityText(reading.regime.observation)}` : ''}`}>
              <SectionTitle code="SUP" />
              <VERegimeTimeline
                regime={reading.regime}
                stretch={reading.stretch}
                summary={reading.summary}
                volatility={reading.volatility}
                phase={reading.phasePersistence}
              />
            </CollapsibleSection>
            {priceEvidence && (
              <CollapsibleSection title="Measured price and volatility (shared with Symbol)" summary={priceEvidence.summary[0] ?? `Completed bar ${priceEvidence.basis.lastCompletedBar ?? 'n/a'}`}>
                {(() => { const note = bbwpBasisNote(measuredBbwp(reading.volatility), priceEvidence); return note ? <p data-bbwp-basis-note className="mb-2 text-xs text-amber-300">{note}</p> : null; })()}
                <PriceEvidencePanel e={priceEvidence} />
              </CollapsibleSection>
            )}
            <SourceLine source="Volatility calculation" asOf={freshness.dataAsOf?.includes('T') ? freshness.dataAsOf : undefined} tradingDay={freshness.dataAsOf ? `Price bar session ${freshness.dataAsOf}` : 'Price bar date not collected'} basis={cached ? 'Cached reading; freshness based on price bars' : 'Calculated from price bars'} />
          </div>
        )}
        <p className="mt-4 text-xs text-slate-400">General information only, not financial advice.</p>
      </main>
    </div>
  );
}
