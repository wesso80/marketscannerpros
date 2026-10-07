'use client';
import type { VolatilityEvidence } from '@/lib/research/volatilityEvidence';

/** Realised and options-implied volatility with their bases, and the release reading in words. No score. */
export default function VolatilityEvidencePanel({ v }: { v: VolatilityEvidence }) {
  return (
    <div data-volatility-evidence className="min-w-0 space-y-2 text-sm">
      {v.summary.map((s) => <p key={s} className="break-words">{s}</p>)}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {v.rows.map((r) => (
          <div key={r.id} data-volatility-row={r.id} className="flex min-w-0 flex-wrap justify-between gap-2 border-b border-white/5 py-1">
            <dt className="text-slate-400">{r.label}</dt>
            <dd className="min-w-0 text-right">{r.value}<span className="block break-words text-xs text-slate-500">{r.basis}</span></dd>
          </div>
        ))}
      </dl>
      {v.notes.map((n) => <p key={n} className="break-words text-xs text-amber-300">{n}</p>)}
      <p className="text-xs text-slate-500">Implied volatility and the implied move describe option prices on their quote date; they are not forecasts of direction.</p>
    </div>
  );
}
