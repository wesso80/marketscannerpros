'use client';

import type { PhasePersistence, ZoneDurationStats } from '@/src/features/volatilityEngine/types';

function ageLabel(pct: number): { text: string; color: string } {
  if (pct >= 80) return { text: 'STRETCHED', color: '#EF4444' };
  if (pct >= 50) return { text: 'MATURE', color: '#D97706' };
  return { text: 'YOUNG', color: '#10B981' };
}

function PhaseBlock({ label, active, prob, exitProb, stats }: {
  label: string;
  active: boolean;
  prob: number;
  exitProb: number;
  stats: ZoneDurationStats;
}) {
  const age = ageLabel(stats.agePercentile);
  return (
    <div className={`rounded-lg border p-4 ${active ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 bg-white/5'}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[0.72rem] font-bold uppercase text-white/80">
          {label} {active ? '(Active)' : '(Inactive)'}
        </span>
        {active && (
          <span className="rounded-full px-2 py-0.5 text-[0.55rem] font-bold uppercase" style={{ background: age.color + '22', color: age.color }}>
            {age.text}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[0.68rem]">
        <div className="text-white/50">Current: <span className="font-bold text-white/80">{stats.currentBars} bars</span></div>
        <div className="text-white/50">Median: <span className="font-bold text-white/80">{stats.medianBars.toFixed(1)} bars</span></div>
        <div className="text-white/50">Average: <span className="font-bold text-white/80">{stats.averageBars.toFixed(1)} bars</span></div>
        <div className="text-white/50">Max: <span className="font-bold text-white/80">{stats.maxBars} bars</span></div>
        <div className="text-white/50">Episodes: <span className="font-bold text-white/80">{stats.episodeCount}</span></div>
        <div className="text-white/50">Percentile: <span className="font-bold text-white/80">{stats.agePercentile.toFixed(0)}%</span></div>
      </div>

      {active && (
        <div className="mt-3 space-y-1.5">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[0.62rem]">
              <span className="text-white/50">Continuation</span>
              <span className="font-semibold text-white/80">{prob.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${prob}%` }} />
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[0.62rem]">
              <span className="text-white/50">Exit Probability</span>
              <span className="font-semibold text-white/80">{exitProb.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${exitProb}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VEPhasePanel({ phase }: { phase: PhasePersistence }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-base">⏱️</span>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
          Phase Persistence
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PhaseBlock
          label="Contraction"
          active={phase.contraction.active}
          prob={phase.contraction.continuationProbability}
          exitProb={phase.contraction.exitProbability}
          stats={phase.contraction.stats}
        />
        <PhaseBlock
          label="Expansion"
          active={phase.expansion.active}
          prob={phase.expansion.continuationProbability}
          exitProb={phase.expansion.exitProbability}
          stats={phase.expansion.stats}
        />
      </div>
    </div>
  );
}
