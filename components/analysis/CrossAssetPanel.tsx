'use client';

/**
 * CrossAssetPanel — high-value cross-asset relationships (Stage 6).
 *
 * Renders a small set of relationship readings (association, not causation) and
 * an optional volatility-regime band. Divergences are highlighted for attention
 * with the explicit caveat that short-term divergence does not imply
 * convergence.
 */

import type { CrossAssetReading, VixRegimeReading } from '@/lib/analysis';

function movementClass(r: CrossAssetReading): string {
  if (r.diverging) return 'border-amber-500/40 bg-amber-500/[0.06]';
  if (r.coMovement === 'aligned') return 'border-emerald-500/25 bg-emerald-500/[0.04]';
  if (r.coMovement === 'diverging') return 'border-sky-500/25 bg-sky-500/[0.04]';
  return 'border-white/5 bg-white/[0.02]';
}

export default function CrossAssetPanel({
  readings,
  vix,
}: {
  readings: CrossAssetReading[];
  vix?: VixRegimeReading;
}) {
  if (!readings.length && !vix) {
    return <p className="text-sm text-slate-500">Cross-asset data unavailable.</p>;
  }
  return (
    <div className="space-y-2">
      {readings.map((r) => (
        <div key={r.pair} className={`rounded-md border p-3 ${movementClass(r)}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-200">{r.pair}</span>
            <span className={`text-xs font-black ${r.diverging ? 'text-amber-300' : 'text-slate-400'}`}>{r.label}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">{r.interpretation}</p>
        </div>
      ))}
      {vix ? (
        <div className="rounded-md border border-white/5 bg-white/[0.02] p-3">
          <div className="text-sm font-bold text-slate-200">{vix.label}</div>
          <p className="mt-1 text-xs leading-5 text-slate-400">{vix.interpretation}</p>
        </div>
      ) : null}
      <p className="text-[11px] italic text-slate-500">Relationships are associations observed across markets, not causal links, and do not imply future convergence.</p>
    </div>
  );
}
