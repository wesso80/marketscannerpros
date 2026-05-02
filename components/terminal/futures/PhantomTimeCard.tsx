import type { PhantomTimeState } from '@/lib/terminal/futures/phantomTimeEngine';

type PhantomTimeCardProps = {
  phantomTime?: PhantomTimeState;
};

function zoneLabel(zone: PhantomTimeState['phantomZone']): string {
  return zone.replace(/_/g, ' ');
}

export default function PhantomTimeCard({ phantomTime }: PhantomTimeCardProps) {
  if (!phantomTime) {
    return (
      <section className="rounded-lg border border-slate-700 bg-slate-950/50 p-3" aria-label="Phantom time status">
        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Phantom Time</div>
        <p className="mt-1 text-xs text-slate-500">No bridge mapping for this contract. Use session and close-calendar context.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-fuchsia-500/25 bg-slate-950/50 p-3" aria-label="Phantom time analysis">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-fuchsia-200">Phantom Time</span>
        <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-slate-300">{zoneLabel(phantomTime.phantomZone)}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-white/10 bg-slate-900/60 p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Charge Score</div>
          <div className="mt-1 text-sm font-black text-fuchsia-200">{phantomTime.phantomChargeScore}/100</div>
        </div>
        <div className="rounded border border-white/10 bg-slate-900/60 p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Cash Gap Risk</div>
          <div className="mt-1 text-sm font-black uppercase text-amber-200">{phantomTime.cashGapRisk}</div>
        </div>
        <div className="rounded border border-white/10 bg-slate-900/60 p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Active Instruments</div>
          <div className="mt-1 text-sm font-black text-emerald-200">{phantomTime.activeInstruments.join(', ') || 'None'}</div>
        </div>
        <div className="rounded border border-white/10 bg-slate-900/60 p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Inactive Instruments</div>
          <div className="mt-1 text-sm font-black text-slate-300">{phantomTime.inactiveInstruments.join(', ') || 'None'}</div>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-300">{phantomTime.interpretation}</p>
    </section>
  );
}
