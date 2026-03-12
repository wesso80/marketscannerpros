'use client';

import type { DVEInvalidation } from '@/src/features/volatilityEngine/types';

export default function VEInvalidationCard({ inv }: { inv: DVEInvalidation }) {
  const statusColor = inv.invalidated ? '#EF4444' : '#10B981';
  const statusText = inv.invalidated ? 'INVALIDATED' : 'VALID';
  const statusIcon = inv.invalidated ? '❌' : '✅';

  return (
    <div className={`rounded-xl border p-5 ${inv.invalidated ? 'border-red-500/30 bg-red-500/5' : 'border-white/10 bg-white/5'}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🛡️</span>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Invalidation Levels
          </h3>
        </div>
        <span className="flex items-center gap-1 text-[0.65rem] font-bold" style={{ color: statusColor }}>
          {statusIcon} {statusText}
        </span>
      </div>

      <div className="space-y-2 text-[0.72rem]">
        {inv.priceInvalidation != null && (
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span className="text-white/50">Price Level</span>
            <span className="font-bold text-white/80">${inv.priceInvalidation.toFixed(2)}</span>
          </div>
        )}
        {inv.phaseInvalidation != null && (
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span className="text-white/50">Phase (BBWP)</span>
            <span className="font-bold text-white/80">{inv.phaseInvalidation.toFixed(1)}</span>
          </div>
        )}
        {inv.smoothedPhaseInvalidation != null && (
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span className="text-white/50">Smooth (SMA5)</span>
            <span className="font-bold text-white/80">{inv.smoothedPhaseInvalidation.toFixed(1)}</span>
          </div>
        )}
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <span className="text-white/50">Mode</span>
          <span className="font-bold uppercase text-white/80">{inv.invalidationMode}</span>
        </div>
      </div>

      {inv.ruleSet.length > 0 && (
        <div className="mt-3 space-y-0.5 border-t border-white/10 pt-2">
          {inv.ruleSet.map((r, i) => (
            <p key={i} className="text-[0.6rem] text-white/40">• {r}</p>
          ))}
        </div>
      )}
    </div>
  );
}
