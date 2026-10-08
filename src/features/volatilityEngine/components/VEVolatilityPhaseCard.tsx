'use client';
import { breakoutConditions, phaseDuration, pinnedCompressionDescription, stretchDescription } from '@/lib/research/volatilityDescriptions';
import { volatilityText } from '../displayText';

import type {
  PublicBreakout,
  PublicDveReading,
  PublicInvalidation,
  PublicPhase,
  PublicPinnedCompression,
  PublicStretch,
  PublicVolatility,
} from '@/src/features/volatilityEngine/types';

type PhaseCardProps = {
  volatility: PublicVolatility;
  phase: PublicPhase | null;
  breakout: PublicBreakout;
  pinned: PublicPinnedCompression;
  stretch: PublicStretch;
  invalidation: PublicInvalidation;
  availability: PublicDveReading['availability'];
};

function phaseTone(regime: string | null) {
  if (regime === 'compression') return { border: 'border-slate-500/35', bg: 'bg-slate-500/10', text: 'text-slate-100' };
  if (regime === 'expansion') return { border: 'border-amber-500/35', bg: 'bg-amber-500/10', text: 'text-amber-100' };
  if (regime === 'climax') return { border: 'border-red-500/40', bg: 'bg-red-500/10', text: 'text-red-100' };
  return { border: 'border-slate-700', bg: 'bg-slate-900/40', text: 'text-slate-100' };
}

function activePhase(phase: PublicPhase | null) {
  if (!phase) return null;
  if (phase.contraction.active) return { label: 'Contraction', ...phase.contraction };
  if (phase.expansion.active) return { label: 'Expansion', ...phase.expansion };
  return null;
}

function Fact({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-slate-950/35 p-3">
      <div className="text-[0.66rem] font-black tracking-[0.09em] text-slate-500">{label}</div>
      <div className="mt-1 break-words text-lg font-black text-slate-100">{value}</div>
      {detail && <div className="mt-1 break-words text-xs leading-5 text-slate-400">{detail}</div>}
    </div>
  );
}

/**
 * Volatility phase read (W3 DVE v2): the measured regime, phase length, setting conditions and observations. No risk
 * level, "stretched / mature" age word, trap verdict or exhaustion label: those were points totals or buckets of them.
 */
export default function VEVolatilityPhaseCard({ volatility, phase, breakout, pinned, stretch, invalidation, availability }: PhaseCardProps) {
  const tone = phaseTone(volatility.regime);
  const active = activePhase(phase);
  const b = breakoutConditions(breakout);
  const known = b.conditions.filter((c) => c.present !== null);
  const notCollected = availability.inputs.filter((i) => i.status === 'not collected' || i.status === 'partial');
  const invalidationText = invalidation.phaseInvalidation != null
    ? `Rule stops applying at BBWP ${invalidation.phaseInvalidation.toFixed(0)}`
    : 'No rule invalidation recorded';

  return (
    <section className={`rounded-lg border ${tone.border} ${tone.bg} p-4 ${tone.text}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 text-xs font-black tracking-[0.14em] opacity-70">Volatility phase</div>
          <div className="text-3xl font-black tracking-tight md:text-4xl">{volatility.regime ? volatilityText(volatility.regime) : 'BBWP not available'}</div>
          <p data-phase-duration className="mt-3 max-w-3xl text-xs leading-5 text-slate-300">
            {!phase ? 'Phase lengths need BBWP, which is not available for this symbol.' : active ? phaseDuration(active.label.toLowerCase(), active.stats) : 'No contraction or expansion phase is active.'}
          </p>
        </div>

        <div className="grid min-w-[min(100%,520px)] gap-3 md:grid-cols-3">
          <Fact label="Breakout setting" value={known.length ? `${known.filter((c) => c.present).length} of ${known.length} conditions` : 'Not collected'} detail="Setting only; not a breakout or a signal." />
          <Fact label="Compression near a large OI strike" value={pinned.conditions.compressed === null ? 'Not collected' : pinned.conditions.compressed && pinned.conditions.nearLargeOiStrike ? 'Both present' : 'Not both present'} detail={pinnedCompressionDescription(pinned)} />
          <Fact label="Stretch observations" value={`${stretch.observations.length}`} detail={stretchDescription(stretch)} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
        <div className="min-w-0 rounded-md border border-white/10 bg-slate-950/25 p-3 text-xs leading-5 text-slate-300">
          <div className="mb-1 font-black tracking-[0.09em] text-slate-400">Rule invalidation</div>
          <div className="font-semibold text-slate-100">{volatilityText(invalidationText)}</div>
          {invalidation.ruleSet.length > 0 && <div className="mt-1 text-slate-400">{volatilityText(invalidation.ruleSet.slice(0, 2).join(' · '))}</div>}
        </div>

        <div className="min-w-0 rounded-md border border-white/10 bg-slate-950/25 p-3 text-xs leading-5 text-slate-300">
          <div className="mb-1 font-black tracking-[0.09em] text-slate-400">Inputs not fully collected</div>
          {notCollected.length ? notCollected.map((i) => `${i.input}: ${i.detail}`).join(' · ') : 'Every input this reading uses was collected.'}
        </div>
      </div>
    </section>
  );
}
