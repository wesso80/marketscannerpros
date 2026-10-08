'use client';

import type { PublicPhase as PhasePersistence, ZoneDurationStats } from '@/src/features/volatilityEngine/types';
import { volatilityBadgeLabel } from '@/lib/presentation/volatilityLayerLabel';
import { phaseDuration } from '@/lib/research/volatilityDescriptions';

function ageLabel(pct: number): { text: string; color: string } {
  if (pct >= 80) return { text: 'Stretched', color: 'var(--msp-bear)' };
  if (pct >= 50) return { text: 'Mature', color: 'var(--msp-warn)' };
  return { text: 'Young', color: 'var(--msp-bull)' };
}

function PhaseBlock({ label, active, stats }: {
  label: string;
  active: boolean;
  stats: ZoneDurationStats;
}) {
  const age = ageLabel(stats.agePercentile);
  return (
    <div className={`rounded-lg border p-4 ${active ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 bg-white/5'}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[0.72rem] font-bold text-white/80">
          {label} {active ? '(Active)' : '(Inactive)'}
        </span>
        {active && (
          <span className="rounded-full px-2 py-0.5 text-[0.65rem] font-bold" style={{ background: age.color + '22', color: age.color }}>
            {age.text}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-y-1 text-[0.75rem] sm:grid-cols-2 sm:gap-x-4">
        <div className="text-white/50">Current: <span className="font-bold text-white/80">{stats.currentBars} bars</span></div>
        <div className="text-white/50">Median: <span className="font-bold text-white/80">{stats.medianBars.toFixed(1)} bars</span></div>
        <div className="text-white/50">Average: <span className="font-bold text-white/80">{stats.averageBars.toFixed(1)} bars</span></div>
        <div className="text-white/50">Max: <span className="font-bold text-white/80">{stats.maxBars} bars</span></div>
        <div className="text-white/50">Episodes: <span className="font-bold text-white/80">{stats.episodeCount}</span></div>
        <div className="text-white/50">This long or shorter: <span className="font-bold text-white/80">{stats.agePercentile.toFixed(0)}% of past phases</span></div>
      </div>

      {/* Phase 4: duration facts instead of continuation / exit "probabilities" (additive heuristic points). */}
      <p data-phase-duration className="mt-3 text-[0.7rem] leading-relaxed text-white/60">{phaseDuration(label.toLowerCase(), stats)}</p>
    </div>
  );
}

export default function VEPhasePanel({ phase }: { phase: PhasePersistence }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex min-w-0 flex-wrap items-center gap-2">
        <span className="shrink-0 whitespace-nowrap rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[0.62rem] font-semibold text-amber-300">{volatilityBadgeLabel('PH')}</span>
        <h3 className="text-xs font-semibold tracking-widest text-amber-400">
          Phase Persistence
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PhaseBlock
          label="Contraction"
          active={phase.contraction.active}
          stats={phase.contraction.stats}
        />
        <PhaseBlock
          label="Expansion"
          active={phase.expansion.active}
          stats={phase.expansion.stats}
        />
      </div>
    </div>
  );
}
