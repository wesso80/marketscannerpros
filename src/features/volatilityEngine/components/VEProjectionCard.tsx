'use client';

import type { SignalProjection } from '@/src/features/volatilityEngine/types';

export default function VEProjectionCard({ proj }: { proj: SignalProjection }) {
  if (proj.signalType === 'none') {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-base">📊</span>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Outcome Projection
          </h3>
        </div>
        <p className="text-[0.75rem] text-white/40">No active signal — projection unavailable.</p>
      </div>
    );
  }

  const isUp = proj.signalType.includes('up');
  const moveColor = isUp ? '#10B981' : '#EF4444';
  const hitColor = proj.hitRate >= 60 ? '#10B981' : proj.hitRate >= 40 ? '#D97706' : '#EF4444';

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-base">📊</span>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
          Outcome Projection
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
          <div className="text-[0.6rem] uppercase text-white/40">Expected Move</div>
          <div className="mt-1 text-xl font-black" style={{ color: moveColor }}>
            {proj.expectedMovePct >= 0 ? '+' : ''}{proj.expectedMovePct.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
          <div className="text-[0.6rem] uppercase text-white/40">Hit Rate</div>
          <div className="mt-1 text-xl font-black" style={{ color: hitColor }}>
            {proj.hitRate.toFixed(0)}%
          </div>
          <div className="text-[0.55rem] text-white/30">{proj.sampleSize} samples</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
          <div className="text-[0.6rem] uppercase text-white/40">Median Move</div>
          <div className="mt-1 text-lg font-bold text-white/80">
            {proj.medianMovePct >= 0 ? '+' : ''}{proj.medianMovePct.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
          <div className="text-[0.6rem] uppercase text-white/40">Avg Bars</div>
          <div className="mt-1 text-lg font-bold text-white/80">
            {proj.averageBarsToMove.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="mt-3 text-[0.6rem] text-white/30 text-center">
        Max historical: {proj.maxHistoricalMovePct >= 0 ? '+' : ''}{proj.maxHistoricalMovePct.toFixed(1)}%
      </div>
    </div>
  );
}
