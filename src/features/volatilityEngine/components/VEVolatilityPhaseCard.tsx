'use client';
import { breakoutConditions, exhaustionDescription, phaseDuration, trapDescription } from '@/lib/research/volatilityDescriptions';
import { volatilityText } from '../displayText';

import type {
  BreakoutReadiness,
  DVEDataQuality,
  DVEFlag,
  DVEInvalidation,
  ExhaustionRisk,
  PhasePersistence,
  VolatilityState,
  VolatilityTrap,
} from '@/src/features/volatilityEngine/types';

type PhaseCardProps = {
  volatility: VolatilityState;
  phase: PhasePersistence;
  breakout: BreakoutReadiness;
  trap: VolatilityTrap;
  exhaustion: ExhaustionRisk;
  invalidation: DVEInvalidation;
  flags: DVEFlag[];
  dataQuality: DVEDataQuality;
};

function phaseTone(regime: string) {
  if (regime === 'compression') return { border: 'border-slate-500/35', bg: 'bg-slate-500/10', text: 'text-slate-100', accent: 'var(--msp-text-muted)' };
  if (regime === 'expansion') return { border: 'border-amber-500/35', bg: 'bg-amber-500/10', text: 'text-amber-100', accent: 'var(--msp-warn)' };
  if (regime === 'climax') return { border: 'border-red-500/40', bg: 'bg-red-500/10', text: 'text-red-100', accent: 'var(--msp-bear)' };
  if (regime === 'transition') return { border: 'border-slate-500/35', bg: 'bg-slate-500/10', text: 'text-slate-100', accent: '#94A3B8' };
  return { border: 'border-slate-700', bg: 'bg-slate-900/40', text: 'text-slate-100', accent: 'var(--msp-flat)' };
}

function activePhase(phase: PhasePersistence) {
  if (phase.contraction.active) return { label: 'Contraction', ...phase.contraction };
  if (phase.expansion.active) return { label: 'Expansion', ...phase.expansion };
  const fallback = phase.contraction.stats.currentBars >= phase.expansion.stats.currentBars ? phase.contraction : phase.expansion;
  return { label: 'No Dominant Phase', ...fallback };
}

function ageLabel(percentile: number) {
  if (percentile >= 80) return 'Stretched';
  if (percentile >= 55) return 'Mature';
  return 'Early';
}

function riskLevel(args: { trap: VolatilityTrap; exhaustion: ExhaustionRisk; breakout: BreakoutReadiness; flags: DVEFlag[] }) {
  if (args.trap.detected || args.exhaustion.label === 'EXTREME' || args.flags.includes('CLIMAX_WARNING')) return 'High Friction';
  if (args.trap.candidate || args.exhaustion.label === 'HIGH') return 'Elevated';
  if (args.exhaustion.label === 'MEDIUM') return 'Moderate';
  return 'Low';
}

function Fact({ label, value, detail, tone = 'text-slate-100' }: { label: string; value: string; detail?: string; tone?: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/35 p-3">
      <div className="text-[0.66rem] font-black tracking-[0.09em] text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-black ${tone}`}>{value}</div>
      {detail && <div className="mt-1 text-xs leading-5 text-slate-400">{detail}</div>}
    </div>
  );
}


export default function VEVolatilityPhaseCard({ volatility, phase, breakout, trap, exhaustion, invalidation, flags, dataQuality }: PhaseCardProps) {
  const tone = phaseTone(volatility.regime);
  const active = activePhase(phase);
  const age = ageLabel(active.stats.agePercentile);
  const risk = riskLevel({ trap, exhaustion, breakout, flags });
  const hardWarnings = [
    trap.detected ? 'Volatility trap detected' : trap.candidate ? 'Trap candidate' : null,
    exhaustion.label === 'HIGH' || exhaustion.label === 'EXTREME' ? `Exhaustion ${volatilityText(exhaustion.label)}` : null,
    dataQuality.missing.length ? `${dataQuality.missing.length} missing input${dataQuality.missing.length === 1 ? '' : 's'}` : null,
    ...dataQuality.warnings.slice(0, 2),
  ].filter(Boolean) as string[];
  const invalidationText = invalidation.priceInvalidation != null
    ? `$${invalidation.priceInvalidation.toFixed(2)} ${invalidation.invalidationMode} invalidation`
    : invalidation.phaseInvalidation != null
      ? `${invalidation.phaseInvalidation.toFixed(0)} phase invalidation`
      : 'No price invalidation level returned';

  return (
    <section className={`rounded-lg border ${tone.border} ${tone.bg} p-4 ${tone.text}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 text-xs font-black tracking-[0.14em] opacity-70">Volatility Phase Read</div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-3xl font-black tracking-tight md:text-4xl">{volatilityText(volatility.regime)}</div>
            <span className="rounded-md border border-current/20 bg-slate-950/25 px-2 py-1 text-[11px] font-black tracking-[0.08em]">
              {active.label} / {age}
            </span>
            <span className="rounded-md border border-current/20 bg-slate-950/25 px-2 py-1 text-[11px] font-black tracking-[0.08em]">
              Risk: {risk}
            </span>
          </div>
          {/* Phase 4: duration facts, not continuation / exit "probabilities" (additive heuristic points). */}
          <p data-phase-duration className="mt-3 max-w-3xl text-xs leading-5 text-slate-300">{phaseDuration(active.label.toLowerCase(), active.stats)}</p>
        </div>

        <div className="grid min-w-[min(100%,520px)] gap-3 md:grid-cols-3">
          {(() => { const b = breakoutConditions(breakout, dataQuality.missing); const known = b.conditions.filter((c) => c.present !== null); return <Fact label="Breakout setting" value={`${known.filter((c) => c.present).length} of ${known.length} conditions`} detail="Setting only; not a breakout or a signal." />; })()}
          <Fact label="Trap" value={trap.detected ? 'Detected' : trap.candidate ? 'Candidate' : 'Clear'} detail={trapDescription(trap)} tone={trap.detected ? 'text-red-200' : trap.candidate ? 'text-amber-200' : 'text-emerald-200'} />
          <Fact label="Exhaustion" value={volatilityText(exhaustion.label)} detail={exhaustion.signals.length ? exhaustionDescription(exhaustion) : 'No exhaustion observations recorded.'} tone={exhaustion.level >= 70 ? 'text-red-200' : exhaustion.level >= 40 ? 'text-amber-200' : 'text-emerald-200'} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-md border border-white/10 bg-slate-950/25 p-3 text-xs leading-5 text-slate-300">
          <div className="mb-1 font-black tracking-[0.09em] text-slate-400">Invalidation</div>
          <div className="font-semibold text-slate-100">{volatilityText(invalidationText)}</div>
          {invalidation.ruleSet.length > 0 && <div className="mt-1 text-slate-400">{volatilityText(invalidation.ruleSet.slice(0, 2).join(' · '))}</div>}
        </div>

        <div className="rounded-md border border-white/10 bg-slate-950/25 p-3 text-xs leading-5 text-slate-300">
          <div className="mb-1 font-black tracking-[0.09em] text-slate-400">Read Limits</div>
          {hardWarnings.length ? hardWarnings.join(' · ') : 'No hard trap, exhaustion, or missing-input warning returned by the current DVE payload.'}
        </div>
      </div>
    </section>
  );
}
