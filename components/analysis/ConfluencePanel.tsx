'use client';

/**
 * ConfluencePanel — probability-honest confluence transparency (Stage 3).
 *
 * Renders a GoldenEggConfluenceResult (from lib/analysis) so the user sees:
 *  - the composite score explicitly framed as "Composite Strength", not a
 *    probability, with a ScoreTypeBadge truth label;
 *  - which INDEPENDENT factor groups agree / disagree / are neutral (so four
 *    correlated trend indicators can never masquerade as four evidences);
 *  - an evidence-quality grade with reasons.
 *
 * Purely presentational and reusable across surfaces (Golden Egg now, Scanner
 * later). No advice language, no probabilities.
 */

import ScoreTypeBadge, { deriveScoreType } from '@/components/ui/ScoreTypeBadge';
import {
  FACTOR_GROUP_LABEL,
  STANCE_LABEL,
  type GoldenEggConfluenceResult,
  type FactorSignal,
} from '@/lib/analysis';

function signalMeta(signal: FactorSignal): { label: string; className: string } {
  switch (signal) {
    case 'bullish': return { label: 'Bullish', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' };
    case 'bearish': return { label: 'Bearish', className: 'bg-rose-500/10 text-rose-300 border-rose-500/30' };
    case 'neutral': return { label: 'Neutral', className: 'bg-slate-500/10 text-slate-300 border-slate-500/30' };
    default: return { label: 'Unknown', className: 'bg-slate-700/20 text-slate-500 border-slate-600/30' };
  }
}

function agreementClass(agreement: GoldenEggConfluenceResult['confluence']['agreement']): string {
  switch (agreement) {
    case 'strong': return 'text-emerald-300';
    case 'moderate': return 'text-emerald-400/80';
    case 'weak': return 'text-amber-300';
    case 'conflicting': return 'text-rose-300';
    default: return 'text-slate-400';
  }
}

const EQ_CLASS: Record<GoldenEggConfluenceResult['evidence']['level'], string> = {
  HIGH: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  MEDIUM: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  LOW: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
  INSUFFICIENT: 'text-slate-400 border-slate-600/30 bg-slate-700/20',
};

export default function ConfluencePanel({ result }: { result: GoldenEggConfluenceResult }) {
  const { composite, confluence, evidence, factors } = result;

  const scoreType = deriveScoreType({
    isSimulated: evidence.reasons.some((r) => /simulated/i.test(r)),
    isStale: evidence.reasons.some((r) => /stale/i.test(r)),
    missingEvidence: evidence.level === 'LOW' || evidence.level === 'INSUFFICIENT',
    isLive: evidence.level === 'HIGH',
  });

  return (
    <div className="space-y-4">
      {/* Composite strength — explicitly NOT a probability */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-black text-slate-100">{composite.value}</span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">/ {composite.max} · {composite.label}</span>
        </div>
        <ScoreTypeBadge type={scoreType} />
      </div>
      <p className="text-[11px] leading-5 text-slate-500">
        {composite.note}{' '}
        <a href="/methodology" className="text-emerald-400/80 no-underline hover:underline">How scores work →</a>
      </p>

      {/* Analytical confluence summary */}
      <div>
        <div className={`text-sm font-bold ${agreementClass(confluence.agreement)}`}>
          {STANCE_LABEL[confluence.dominant]} · {confluence.agreement} agreement
        </div>
        <p className="mt-1 text-xs text-slate-400">{confluence.summary}</p>
      </div>

      {/* Independent factor groups */}
      {factors.length > 0 ? (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {factors.map((f) => {
            const meta = signalMeta(f.signal);
            return (
              <li key={f.group} className="flex items-center justify-between gap-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-1.5">
                <span className="text-xs font-medium text-slate-300">{FACTOR_GROUP_LABEL[f.group]}</span>
                <span className="flex items-center gap-1.5">
                  {f.caution ? <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">Caution</span> : null}
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${meta.className}`}>{meta.label}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Insufficient independent factors to assess confluence.</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {confluence.independentFactors} independent factor group{confluence.independentFactors === 1 ? '' : 's'} ·{' '}
          {confluence.supportive} supportive · {confluence.opposing} opposing · {confluence.neutral} neutral
          {confluence.cautions > 0 ? ` · ${confluence.cautions} caution` : ''}
        </span>
      </div>

      {/* Evidence quality */}
      <div className="rounded-md border border-white/5 bg-slate-950/40 p-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Evidence quality</span>
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${EQ_CLASS[evidence.level]}`}>{evidence.level}</span>
          <span className="text-[11px] text-slate-500">{Math.round(evidence.completeness * 100)}% of layers</span>
        </div>
        <ul className="mt-1.5 list-disc pl-5 text-[11px] text-slate-500">
          {evidence.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </div>
    </div>
  );
}
