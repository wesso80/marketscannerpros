import type { FuturesLiquidityParticipation } from '@/lib/terminal/futures/liquidityParticipation';

type LiquidityParticipationCardProps = {
  estimate: FuturesLiquidityParticipation;
};

function regimeLabel(value: FuturesLiquidityParticipation['regime']): string {
  return value.replace(/_/g, ' ');
}

export default function LiquidityParticipationCard({ estimate }: LiquidityParticipationCardProps) {
  return (
    <section className="rounded-lg border border-indigo-500/30 bg-slate-950/50 p-3" aria-label="Futures liquidity and participation estimate">
      <p className="mb-2 text-xs text-slate-400">Session-based estimates, not measured volume or order-book liquidity.</p>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded border border-indigo-400/40 bg-indigo-400/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-indigo-200">Liquidity and Participation</span>
        <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-slate-300">{regimeLabel(estimate.regime)}</span>
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
