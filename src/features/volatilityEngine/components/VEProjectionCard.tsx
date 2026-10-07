'use client';

import type { SignalProjection, VolatilityState, PhasePersistence } from '@/src/features/volatilityEngine/types';
import { volatilityBadgeLabel } from '@/lib/presentation/volatilityLayerLabel';
import { projectionStudy } from '@/lib/research/volatilityDescriptions';
import { PROJECTION } from '@/lib/directionalVolatilityEngine.constants';

interface ProjectionCardProps {
  proj: SignalProjection;
  volatility?: VolatilityState;
  phase?: PhasePersistence;
  currentPrice?: number;
}

/**
 * Phase 4. Without a signal: the size of a typical daily range (1 ATR), not upside / downside targets, and never a
 * range invented from BBWP. With a signal: the engine's past-case study, described with its sample and limits, instead
 * of a "hit rate" and a quality score.
 */
export default function VEProjectionCard({ proj, volatility, currentPrice }: ProjectionCardProps) {
  const header = (
    <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
      <span className="shrink-0 whitespace-nowrap rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[0.62rem] font-semibold text-amber-300">{volatilityBadgeLabel('PROJ')}</span>
      <h3 className="text-xs font-semibold tracking-widest text-amber-400">{proj.signalType === 'none' ? 'Daily range size' : 'Past-case study'}</h3>
    </div>
  );
  if (proj.signalType === 'none') {
    const atr = volatility?.atr;
    const pct = atr && currentPrice && currentPrice > 0 ? (atr / currentPrice) * 100 : null;
    return (
      <div data-projection className="rounded-xl border border-white/10 bg-white/5 p-5">
        {header}
        {pct != null ? (
          <p className="text-[0.75rem] text-white/70">
            One ATR is {atr!.toLocaleString(undefined, { maximumFractionDigits: 2 })} ({pct.toFixed(1)}% of the latest price). It describes the size of a typical daily range; it is not a target or a direction.
          </p>
        ) : (
          <p className="text-[0.75rem] text-white/40">No active signal. ATR not available, so no range size is shown.</p>
        )}
      </div>
    );
  }
  const study = projectionStudy(proj, PROJECTION.FORWARD_BARS);
  return (
    <div data-projection className="rounded-xl border border-white/10 bg-white/5 p-5">
      {header}
      <div className="space-y-1.5 text-[0.75rem] text-white/70">
        {study?.lines.map((l) => <p key={l}>{l}</p>)}
      </div>
      {study && <p className="mt-3 text-[0.68rem] leading-relaxed text-white/40">{study.method}</p>}
    </div>
  );
}
