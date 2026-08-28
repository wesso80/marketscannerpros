'use client';

/**
 * ScannerInsightStrip — compact, educational insight badges for a scanner row.
 *
 * Surfaces the independent-factor model from the Scanner rework: setup stage,
 * extension state, relative strength, evidence quality, and (expandable) the
 * "why it ranked" reasons + cautions. Educational context only — never advice,
 * never a probability.
 */

import { useState } from 'react';
import type { ScannerInsight, SetupStage, ExtensionState } from '@/lib/analysis';

const STAGE_CLASS: Record<SetupStage, string> = {
  DORMANT: 'bg-slate-500/10 text-slate-400 border-slate-600/40',
  BUILDING: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  CONFIRMING: 'bg-teal-500/15 text-teal-300 border-teal-500/40',
  EXPANDING: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  EXTENDED: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  FADING: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
};

const EXT_CLASS: Record<ExtensionState, string> = {
  EARLY: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  NORMAL: 'bg-slate-500/10 text-slate-400 border-slate-600/30',
  ELEVATED: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  EXTREME: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

const EQ_CLASS: Record<ScannerInsight['evidenceQuality']['level'], string> = {
  HIGH: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  MEDIUM: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  LOW: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  INSUFFICIENT: 'bg-slate-700/20 text-slate-500 border-slate-600/30',
};

function Chip({ className, children, title }: { className: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${className}`}>
      {children}
    </span>
  );
}

export default function ScannerInsightStrip({ insight, compact = false }: { insight: ScannerInsight; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { setupStage, extensionState, relativeStrength, evidenceQuality, confluence, whyRanked, cautions } = insight;

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip className={STAGE_CLASS[setupStage]} title="Setup stage — describes observable behaviour, not a trade instruction">{setupStage}</Chip>
        <Chip className={EXT_CLASS[extensionState]} title="Extension state — how far the move has already run">{extensionState}</Chip>
        {relativeStrength ? (
          <Chip className={relativeStrength.ratio >= 1.03 ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : relativeStrength.ratio <= 0.97 ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' : 'bg-slate-500/10 text-slate-400 border-slate-600/30'} title="Relative strength vs benchmark">
            RS {relativeStrength.label}
          </Chip>
        ) : null}
        <Chip className={EQ_CLASS[evidenceQuality.level]} title="Evidence quality — caps the composite; poor/stale evidence cannot yield a high score">EV {evidenceQuality.level}</Chip>
        <Chip className="bg-slate-500/10 text-slate-400 border-slate-600/30" title="Independent factor groups that agree">
          {confluence.supportive}/{confluence.independentFactors} factors
        </Chip>
        {!compact && (whyRanked.length > 0 || cautions.length > 0) ? (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 hover:text-slate-200">
            {open ? 'Hide why' : 'Why ranked'}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-1.5 grid gap-2 rounded-md border border-white/5 bg-slate-950/40 p-2 sm:grid-cols-2">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300/70">Why it ranked</div>
            {whyRanked.length ? (
              <ul className="mt-0.5 list-disc pl-4 text-[11px] text-slate-300">
                {whyRanked.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            ) : <p className="text-[11px] text-slate-500">No standout supportive factors.</p>}
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-amber-300/70">Cautions</div>
            {cautions.length ? (
              <ul className="mt-0.5 list-disc pl-4 text-[11px] text-slate-300">
                {cautions.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            ) : <p className="text-[11px] text-slate-500">None flagged.</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
