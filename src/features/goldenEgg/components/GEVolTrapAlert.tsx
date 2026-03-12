'use client';

import type { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type VolatilityData = GoldenEggPayload['layer3']['structure']['volatility'];

export default function GEVolTrapAlert({ volatility }: { volatility: VolatilityData }) {
  if (!volatility.trapDetected) return null;

  const score = volatility.trapScore ?? 0;

  return (
    <div
      className="animate-pulse rounded-xl border border-red-500/40 px-5 py-4"
      style={{
        background: 'linear-gradient(90deg, rgba(220,38,38,0.15), rgba(217,119,6,0.15))',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">⚠️</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold tracking-wide text-red-400">
            VOLATILITY TRAP DETECTED{' '}
            <span className="text-amber-400">— Score: {score.toFixed(0)}/100</span>
          </p>
          <p className="mt-0.5 text-[0.68rem] text-white/50">
            Compression + gamma clustering + time alignment suggest an imminent high-volatility
            event. Size positions accordingly.
          </p>
        </div>
      </div>
    </div>
  );
}
