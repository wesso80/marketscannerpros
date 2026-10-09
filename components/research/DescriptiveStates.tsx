'use client';
import type { DescriptiveState } from '@/lib/research/descriptiveStates';

/** Each state beside its definition (Phase 4: descriptive states instead of grades or scores). */
export default function DescriptiveStates({ states }: { states: DescriptiveState[] }) {
  return (
    <dl data-descriptive-states className="grid min-w-0 grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
      {states.map((s) => (
        <div key={s.id} data-state={s.id} className="min-w-0 rounded-md bg-[var(--msp-panel-2)] px-2 py-1.5">
          <dt className="text-[10px] uppercase text-slate-500">{s.label}</dt>
          <dd className="break-words font-semibold text-slate-100">{s.state}</dd>
          <dd className="break-words text-[10px] text-slate-500">{s.definition}</dd>
        </div>
      ))}
    </dl>
  );
}
