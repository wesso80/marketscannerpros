'use client';

/**
 * LeverageStatePanel — crypto leverage/participation state (Stage 6).
 *
 * Presents a single interpretable state fused from price / open interest /
 * funding / liquidations / volatility, with the observed drivers and an
 * evidence-quality grade. Educational description of market structure — not a
 * prediction and not a trade instruction.
 */

import type { LeverageAssessment, LeverageState } from '@/lib/analysis';

const STATE_CLASS: Record<LeverageState, string> = {
  HEALTHY_TREND_PARTICIPATION: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/[0.06]',
  LEVERAGE_BUILDING: 'text-amber-300 border-amber-500/40 bg-amber-500/[0.06]',
  CROWDED_LONG: 'text-orange-300 border-orange-500/40 bg-orange-500/[0.06]',
  CROWDED_SHORT: 'text-sky-300 border-sky-500/40 bg-sky-500/[0.06]',
  SHORT_COVERING: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/[0.06]',
  LONG_LIQUIDATION: 'text-rose-300 border-rose-500/40 bg-rose-500/[0.06]',
  DELEVERAGING: 'text-slate-300 border-slate-500/40 bg-slate-500/[0.06]',
  COMPRESSION: 'text-indigo-300 border-indigo-500/40 bg-indigo-500/[0.06]',
  EXPANSION: 'text-fuchsia-300 border-fuchsia-500/40 bg-fuchsia-500/[0.06]',
  MIXED: 'text-slate-400 border-slate-600/40 bg-slate-700/[0.06]',
};

export default function LeverageStatePanel({ assessment, symbol }: { assessment: LeverageAssessment; symbol?: string }) {
  return (
    <div className={`rounded-lg border p-4 ${STATE_CLASS[assessment.state]}`}>
      <div className="flex flex-wrap items-center gap-2">
        {symbol ? <span className="text-xs font-black uppercase tracking-widest text-slate-400">{symbol}</span> : null}
        <span className="text-lg font-black">{assessment.label}</span>
        <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">Evidence {assessment.evidence.level}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-300">{assessment.interpretation}</p>
      {assessment.signals.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {assessment.signals.map((s, i) => (
            <span key={i} className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[11px] text-slate-400">{s}</span>
          ))}
        </div>
      ) : null}
      <p className="mt-2 text-[11px] italic text-slate-500">Describes observable positioning structure. Not a prediction of a guaranteed outcome.</p>
    </div>
  );
}
