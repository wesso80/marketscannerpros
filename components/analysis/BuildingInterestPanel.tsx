'use client';

/**
 * BuildingInterestPanel — surfaces developing activity (Stage 4).
 *
 * Renders ranked Building/Early assessments. States describe observable market
 * behaviour (developing vs extended vs fading) — they are educational signals
 * for further research, never trade instructions, and the score is a composite
 * strength, not a probability.
 */

import { useState } from 'react';
import type { BuildingAssessment, BuildingState } from '@/lib/analysis';

const STATE_META: Record<BuildingState, { label: string; className: string }> = {
  BUILDING: { label: 'Building', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
  EXPANDING: { label: 'Expanding', className: 'bg-sky-500/15 text-sky-300 border-sky-500/40' },
  EXTENDED: { label: 'Extended', className: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  FADING: { label: 'Fading', className: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
  DORMANT: { label: 'Dormant', className: 'bg-slate-500/10 text-slate-400 border-slate-600/40' },
};

function pctColor(v: number): string {
  if (v > 0) return 'var(--msp-bull)';
  if (v < 0) return 'var(--msp-bear)';
  return 'var(--msp-text-muted)';
}

export default function BuildingInterestPanel({
  items,
  emptyText = 'No developing activity detected in the current sample.',
}: {
  items: Array<BuildingAssessment & { changePct?: number }>;
  emptyText?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (!items.length) {
    return <p className="text-sm text-slate-500">{emptyText}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {items.map((a) => {
        const meta = STATE_META[a.state];
        const isOpen = open === a.symbol;
        return (
          <li key={a.symbol} className="rounded-md border border-white/5 bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : a.symbol)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
            >
              <span className="flex items-center gap-2">
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${meta.className}`}>{meta.label}</span>
                <span className="text-sm font-bold text-slate-200">{a.symbol}</span>
              </span>
              <span className="flex items-center gap-3 text-xs">
                {typeof a.changePct === 'number' ? (
                  <span className="font-bold" style={{ color: pctColor(a.changePct) }}>{a.changePct >= 0 ? '+' : ''}{a.changePct.toFixed(2)}%</span>
                ) : null}
                <span className="text-slate-400">Strength {a.score.value}</span>
                <span className="text-slate-600">{isOpen ? '−' : '+'}</span>
              </span>
            </button>
            {isOpen ? (
              <div className="border-t border-white/5 px-3 py-2">
                <p className="text-xs leading-5 text-slate-400">{a.interpretation}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span className="rounded border border-white/10 px-1.5 py-0.5">Evidence: {a.evidence.level}</span>
                  <span>{Math.round(a.evidence.completeness * 100)}% of layers</span>
                  <span className="text-slate-600">{a.score.label} {a.score.value}/100 — not a probability</span>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
