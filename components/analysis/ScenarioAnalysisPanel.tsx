'use client';

/**
 * ScenarioAnalysisPanel — educational scenario framing (Stage 5).
 *
 * Presents Golden Egg's setup as EDUCATIONAL scenario analysis: why interesting,
 * supporting vs contradicting evidence, a primary conditional scenario, an
 * explicit alternative scenario, the structural invalidation level, reference
 * zones, and hypothetical structure. Conditional, non-instructional language.
 */

import type { ScenarioAnalysis } from '@/lib/analysis';

function dirClass(direction: ScenarioAnalysis['primaryScenario']['direction']): string {
  if (direction === 'bullish') return 'border-emerald-500/30 bg-emerald-500/[0.06]';
  if (direction === 'bearish') return 'border-rose-500/30 bg-rose-500/[0.06]';
  return 'border-amber-500/30 bg-amber-500/[0.06]';
}

function dirText(direction: ScenarioAnalysis['primaryScenario']['direction']): string {
  if (direction === 'bullish') return 'text-emerald-300';
  if (direction === 'bearish') return 'text-rose-300';
  return 'text-amber-300';
}

export default function ScenarioAnalysisPanel({ analysis }: { analysis: ScenarioAnalysis }) {
  return (
    <div className="space-y-4">
      {/* Why interesting */}
      <div>
        <div className="mb-1 text-[11px] font-black uppercase tracking-widest text-slate-500">Why this is interesting</div>
        <p className="text-sm leading-6 text-slate-300">{analysis.whyInteresting}</p>
      </div>

      {/* Supporting vs contradicting evidence */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
          <div className="mb-1 text-[11px] font-black uppercase tracking-widest text-emerald-300/80">Supporting evidence</div>
          {analysis.supporting.length ? (
            <ul className="list-disc pl-4 text-xs text-slate-300">
              {analysis.supporting.map((s) => <li key={s}>{s}</li>)}
            </ul>
          ) : <p className="text-xs text-slate-500">None currently identified.</p>}
        </div>
        <div className="rounded-md border border-rose-500/20 bg-rose-500/[0.04] p-3">
          <div className="mb-1 text-[11px] font-black uppercase tracking-widest text-rose-300/80">Contradicting evidence</div>
          {analysis.contradicting.length ? (
            <ul className="list-disc pl-4 text-xs text-slate-300">
              {analysis.contradicting.map((s) => <li key={s}>{s}</li>)}
            </ul>
          ) : <p className="text-xs text-slate-500">None currently identified.</p>}
        </div>
      </div>

      {/* Primary + alternative scenarios */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className={`rounded-md border p-3 ${dirClass(analysis.primaryScenario.direction)}`}>
          <div className={`mb-1 text-xs font-black uppercase tracking-wider ${dirText(analysis.primaryScenario.direction)}`}>{analysis.primaryScenario.title}</div>
          <p className="text-xs leading-5 text-slate-300">{analysis.primaryScenario.text}</p>
        </div>
        <div className={`rounded-md border p-3 ${dirClass(analysis.alternativeScenario.direction)}`}>
          <div className={`mb-1 text-xs font-black uppercase tracking-wider ${dirText(analysis.alternativeScenario.direction)}`}>{analysis.alternativeScenario.title}</div>
          <p className="text-xs leading-5 text-slate-300">{analysis.alternativeScenario.text}</p>
        </div>
      </div>

      {/* Structural invalidation */}
      <div className="rounded-md border border-amber-500/25 bg-amber-500/[0.05] p-3">
        <div className="mb-1 text-[11px] font-black uppercase tracking-widest text-amber-300/80">{analysis.thesisInvalidation.label}</div>
        <p className="text-xs leading-5 text-slate-300">{analysis.thesisInvalidation.text}</p>
      </div>

      {/* Reference zones */}
      {analysis.referenceZones.length ? (
        <div>
          <div className="mb-1 text-[11px] font-black uppercase tracking-widest text-slate-500">Reference / reaction zones</div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {analysis.referenceZones.map((z, i) => (
              <li key={`${z.label}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs">
                <span className="text-slate-400">{z.label}{z.note ? ` · ${z.note}` : ''}</span>
                <span className="font-bold text-slate-200">{z.price}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Illustrative structure */}
      {analysis.illustrativeStructure ? (
        <p className="text-[11px] italic leading-5 text-slate-500">{analysis.illustrativeStructure}</p>
      ) : null}
    </div>
  );
}
