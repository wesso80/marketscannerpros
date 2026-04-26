'use client';

import type { SignalProjection, VolatilityState, PhasePersistence } from '@/src/features/volatilityEngine/types';

interface ProjectionCardProps {
  proj: SignalProjection;
  volatility?: VolatilityState;
  phase?: PhasePersistence;
  currentPrice?: number;
}

export default function VEProjectionCard({ proj, volatility, phase, currentPrice }: ProjectionCardProps) {
  if (proj.signalType === 'none') {
    // Show expected move range bands based on current volatility when no signal
    const hasVolData = volatility && currentPrice && currentPrice > 0;
    const atr = volatility?.atr;
    const bbwp = volatility?.bbwp ?? 50;

    // Estimate expected move from ATR or BBWP-implied volatility
    let expectedPct = 0;
    if (atr && currentPrice && currentPrice > 0) {
      expectedPct = (atr / currentPrice) * 100;
    } else {
      // Fallback: BBWP-implied estimate (low bbwp = low expected, high bbwp = high expected)
      expectedPct = 0.5 + (bbwp / 100) * 3.5; // 0.5% to 4% range
    }

    const upTarget = hasVolData ? currentPrice! * (1 + expectedPct / 100) : 0;
    const downTarget = hasVolData ? currentPrice! * (1 - expectedPct / 100) : 0;
    const upExtended = hasVolData ? currentPrice! * (1 + (expectedPct * 1.5) / 100) : 0;
    const downExtended = hasVolData ? currentPrice! * (1 - (expectedPct * 1.5) / 100) : 0;

    // Phase context
    const activePhase = phase?.contraction.active ? 'contraction' : phase?.expansion.active ? 'expansion' : null;
    const exitProb = activePhase === 'contraction' ? phase?.contraction.exitProbability : activePhase === 'expansion' ? phase?.expansion.exitProbability : null;

    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-base">📊</span>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Outcome Projection
          </h3>
        </div>
        {hasVolData ? (
          <div className="space-y-4">
            <p className="text-[0.7rem] text-white/40">No active signal — showing expected move range based on current volatility</p>

            {/* Expected range bands */}
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-2 text-[11px] uppercase text-white/40">Expected Move Range (1 ATR)</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <div className="text-[11px] text-red-400/60">Downside</div>
                  <div className="text-sm font-bold text-red-400">${downTarget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className="text-[0.55rem] text-white/25">-{expectedPct.toFixed(1)}%</div>
                </div>
                <div className="text-center">
                  <div className="text-[11px] text-emerald-400/60">Upside</div>
                  <div className="text-sm font-bold text-emerald-400">${upTarget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className="text-[0.55rem] text-white/25">+{expectedPct.toFixed(1)}%</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-2 text-[11px] uppercase text-white/40">Extended Range (1.5× ATR)</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <div className="text-[11px] text-red-400/40">Downside</div>
                  <div className="text-sm font-bold text-red-400/70">${downExtended.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className="text-[0.55rem] text-white/20">-{(expectedPct * 1.5).toFixed(1)}%</div>
                </div>
                <div className="text-center">
                  <div className="text-[11px] text-emerald-400/40">Upside</div>
                  <div className="text-sm font-bold text-emerald-400/70">${upExtended.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className="text-[0.55rem] text-white/20">+{(expectedPct * 1.5).toFixed(1)}%</div>
                </div>
              </div>
            </div>

            {/* Phase context */}
            <div className="flex items-center justify-between text-[0.65rem] text-white/40">
              <span>BBWP: {bbwp.toFixed(1)} • {volatility!.regime}</span>
              {activePhase && exitProb != null && (
                <span>{activePhase} exit probability: {exitProb.toFixed(0)}%</span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-[0.75rem] text-white/40">No active signal — projection unavailable.</p>
        )}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
          <div className="text-[0.7rem] uppercase text-white/40">Expected Move</div>
          <div className="mt-1 text-xl font-black" style={{ color: moveColor }}>
            {proj.expectedMovePct >= 0 ? '+' : ''}{proj.expectedMovePct.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
          <div className="text-[0.7rem] uppercase text-white/40">Hit Rate</div>
          <div className="mt-1 text-xl font-black" style={{ color: hitColor }}>
            {proj.hitRate.toFixed(0)}%
          </div>
          <div className="text-[0.65rem] text-white/30">{proj.sampleSize} samples</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
          <div className="text-[0.7rem] uppercase text-white/40">Median Move</div>
          <div className="mt-1 text-lg font-bold text-white/80">
            {proj.medianMovePct >= 0 ? '+' : ''}{proj.medianMovePct.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
          <div className="text-[0.7rem] uppercase text-white/40">Avg Bars</div>
          <div className="mt-1 text-lg font-bold text-white/80">
            {proj.averageBarsToMove.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="mt-3 text-[0.7rem] text-white/30 text-center">
        Max historical: {proj.maxHistoricalMovePct >= 0 ? '+' : ''}{proj.maxHistoricalMovePct.toFixed(1)}%
      </div>
    </div>
  );
}
