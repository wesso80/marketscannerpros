'use client';
import type { EvidenceSummary } from '@/lib/research/evidenceSummary';

function Block({ title, items, empty, attr }: { title: string; items: string[]; empty: string; attr: string }) {
  return (
    <div data-evidence-block={attr} className="min-w-0">
      <h4 className="text-[11px] font-semibold uppercase text-slate-400">{title}</h4>
      {items.length ? <ul className="mt-1 space-y-0.5">{items.map((i) => <li key={i} className="break-words">• {i}</li>)}</ul> : <p className="mt-1 text-slate-500">{empty}</p>}
    </div>
  );
}

/** Observations by input, differences, missing data and what to check again. No score and no conclusion. */
export default function EvidenceSummaryPanel({ s }: { s: EvidenceSummary }) {
  return (
    <div data-evidence-summary className="min-w-0 space-y-3 text-xs text-slate-200">
      <div className="min-w-0">
        <h4 className="text-[11px] font-semibold uppercase text-slate-400">Observations by input</h4>
        {s.groups.length === 0 ? <p className="mt-1 text-slate-500">No observations recorded.</p> : (
          <dl className="mt-1 space-y-1.5">
            {s.groups.map((g) => (
              <div key={g.input} data-evidence-group={g.input} className="min-w-0 rounded-md bg-[var(--msp-panel-2)] px-2 py-1.5">
                <dt className="text-[10px] uppercase text-slate-500">{g.label}</dt>
                {g.observations.map((o) => <dd key={o} className="break-words">{o}</dd>)}
              </div>
            ))}
          </dl>
        )}
        <p className="mt-1 text-[11px] text-slate-400">{s.independenceNote}</p>
      </div>
      <Block attr="differences" title="Where methods or dates differ" items={s.differences} empty="No differences between methods or dates recorded." />
      <Block attr="missing" title="Missing or partial" items={s.missing} empty="Nothing recorded as missing." />
      <Block attr="recheck" title="Check again when new data arrives" items={s.recheck} empty="No scheduled update recorded." />
    </div>
  );
}
