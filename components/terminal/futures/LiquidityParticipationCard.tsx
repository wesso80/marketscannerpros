import type { FuturesLiquidityParticipation } from '@/lib/terminal/futures/liquidityParticipation';

type LiquidityParticipationCardProps = {
  estimate: FuturesLiquidityParticipation;
};

function fmtScore(value: number): string {
  return `${Math.round(value)}/100`;
}

function regimeLabel(value: FuturesLiquidityParticipation['regime']): string {
  return value.replace(/_/g, ' ');
}

function confidenceClass(value: FuturesLiquidityParticipation['confidence']): string {
  if (value === 'moderate') {
    return 'text-emerald-200 border-emerald-400/40 bg-emerald-500/10';
  }
  return 'text-amber-200 border-amber-400/40 bg-amber-500/10';
}

export default function LiquidityParticipationCard({ estimate }: LiquidityParticipationCardProps) {
  return (
    <section className="rounded-lg border border-indigo-500/30 bg-slate-950/50 p-3" aria-label="Futures liquidity and participation estimate">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded border border-indigo-400/40 bg-indigo-400/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-indigo-200">Liquidity and Participation</span>
        <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-slate-300">{regimeLabel(estimate.regime)}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded border border-white/10 bg-slate-900/60 p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Liquidity</div>
          <div className="mt-1 text-sm font-black text-indigo-200">{fmtScore(estimate.liquidityScore)}</div>
        </div>
        <div className="rounded border border-white/10 bg-slate-900/60 p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Participation</div>
          <div className="mt-1 text-sm font-black text-emerald-200">{fmtScore(estimate.participationScore)}</div>
        </div>
        <div className="rounded border border-white/10 bg-slate-900/60 p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Confidence</div>
          <div className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-sm font-black uppercase ${confidenceClass(estimate.confidence)}`}>
            {estimate.confidence}
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-300">{estimate.summary}</p>

      <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
        {estimate.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
