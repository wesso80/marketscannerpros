'use client';

import type { VolatilityTrap } from '@/src/features/volatilityEngine/types';

export default function VETrapAlert({ trap }: { trap: VolatilityTrap }) {
  if (!trap.detected && !trap.candidate) return null;

  const isTrap = trap.detected;

  return (
    <div
      className={`rounded-xl border px-5 py-4 ${isTrap ? 'animate-pulse border-red-500/40' : 'border-amber-500/30'}`}
      style={{
        background: isTrap
          ? 'linear-gradient(90deg, rgba(220,38,38,0.15), rgba(217,119,6,0.15))'
          : 'linear-gradient(90deg, rgba(217,119,6,0.08), rgba(217,119,6,0.04))',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{isTrap ? '⚠️' : '🔍'}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold tracking-wide ${isTrap ? 'text-red-400' : 'text-amber-400'}`}>
            {isTrap ? 'VOLATILITY TRAP DETECTED' : 'TRAP CANDIDATE'}{' '}
            <span className="text-amber-400">— Score: {trap.score.toFixed(0)}/100</span>
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {trap.components.map((c, i) => (
              <span key={i} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.6rem] text-white/50">
                {c}
              </span>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[0.62rem] text-white/40">
            <span>Compression: {trap.compressionLevel.toFixed(0)}%</span>
            <span>Gamma Lock: {trap.gammaLockDetected ? 'Yes' : 'No'}</span>
            <span>Time Cluster: {trap.timeClusterApproaching ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
