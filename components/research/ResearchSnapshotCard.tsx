'use client';
import Link from 'next/link';
import type { ResearchSnapshot, SectionStatus } from '@/lib/research/researchSnapshot';

const STATUS_STYLE: Record<SectionStatus['status'], string> = {
  available: 'border-emerald-400/30 text-emerald-300',
  partial: 'border-amber-400/40 text-amber-300',
  missing: 'border-red-400/40 text-red-300',
  'not applicable': 'border-slate-500/40 text-slate-400',
};
const fmtWhen = (v: string | null) => (!v ? 'Not recorded' : /T\d{2}:\d{2}/.test(v) ? `${v.slice(0, 10)} ${v.slice(11, 16)} UTC` : v);

/** Top of the Symbol page: factual summary, observation dates, section data status and the specialist views. */
export default function ResearchSnapshotCard({ s, links }: { s: ResearchSnapshot; links: Array<{ href: string; label: string }> }) {
  return (
    <section data-research-snapshot aria-label="Research snapshot" className="min-w-0 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-card)] p-3 sm:p-4">
      <h2 className="!text-xs font-semibold uppercase tracking-wide text-slate-400">Research snapshot</h2>
      <p data-snapshot-summary className="mt-1 break-words text-sm leading-6 text-slate-100">{s.summary.join(' ')}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs lg:grid-cols-3">
        {s.dates.map((d) => (
          <div key={d.id} data-observation-date={d.id} className="min-w-0 rounded-md bg-[var(--msp-panel-2)] px-2 py-1.5">
            <dt className="text-[10px] uppercase text-slate-500">{d.label}</dt>
            <dd className="break-words font-mono text-slate-100">{fmtWhen(d.value)}</dd>
            <dd className="break-words text-[10px] text-slate-500">{d.basis}</dd>
          </div>
        ))}
      </dl>
      <ul aria-label="Data status by section" className="mt-3 flex flex-wrap gap-1.5">
        {s.sections.map((x) => (
          <li key={x.id} data-section-status={x.id} title={x.note} className={`max-w-full break-words rounded border px-2 py-0.5 text-[11px] ${STATUS_STYLE[x.status]}`}>
            {x.label}: {x.status}
          </li>
        ))}
      </ul>
      {s.sections.some((x) => x.status === 'partial' || x.status === 'missing') && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-slate-400">
          {s.sections.filter((x) => x.status === 'partial' || x.status === 'missing').map((x) => <li key={x.id} className="break-words">{x.label}: {x.note}</li>)}
        </ul>
      )}
      {links.length > 0 && (
        <nav aria-label="Specialist views" className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          <span className="text-slate-500">Deeper views:</span>
          {links.map((l) => <Link key={l.href} href={l.href} className="text-emerald-400 hover:underline">{l.label} ›</Link>)}
        </nav>
      )}
    </section>
  );
}
