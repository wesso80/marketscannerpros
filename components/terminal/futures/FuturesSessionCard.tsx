import type { FuturesSessionState } from '@/lib/terminal/futures/futuresSessionEngine';

type FuturesSessionCardProps = {
  session: FuturesSessionState;
};

function fmtMinutes(minutes: number): string {
  if (minutes <= 0) return 'NOW';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function toLabel(value: FuturesSessionState['currentSession']): string {
  return value.replace(/_/g, ' ');
}

export default function FuturesSessionCard({ session }: FuturesSessionCardProps) {
  return (
    <section className="rounded-lg border border-cyan-500/30 bg-slate-950/50 p-3" aria-label="Futures session state">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-cyan-200">Futures Session Map</span>
        <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-slate-300">{session.exchange}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-white/10 bg-slate-900/60 p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Current Session</div>
          <div className="mt-1 text-sm font-black capitalize text-cyan-200">{toLabel(session.currentSession)}</div>
        </div>
        <div className="rounded border border-white/10 bg-slate-900/60 p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Next Event</div>
          <div className="mt-1 text-sm font-black uppercase text-emerald-300">{session.nextSessionEvent.replace(/_/g, ' ')}</div>
        </div>
        <div className="rounded border border-white/10 bg-slate-900/60 p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Countdown</div>
          <div className="mt-1 text-sm font-black text-white">{fmtMinutes(session.minutesToNextSessionEvent)}</div>
        </div>
        <div className="rounded border border-white/10 bg-slate-900/60 p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Timezone</div>
          <div className="mt-1 text-sm font-black text-white">{session.timezone}</div>
        </div>
      </div>
      <div className="mt-2 grid gap-2 text-[11px] text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-white/10 bg-slate-900/40 px-2 py-1">Globex: {session.sessionOpenET} - {session.sessionCloseET} ET</div>
        <div className="rounded border border-white/10 bg-slate-900/40 px-2 py-1">Maintenance: {session.maintenanceStartET} - {session.maintenanceEndET} ET</div>
        <div className="rounded border border-white/10 bg-slate-900/40 px-2 py-1">RTH context: 09:30 - 16:00 ET</div>
        <div className="rounded border border-white/10 bg-slate-900/40 px-2 py-1">Maintenance break is respected in this path.</div>
      </div>
    </section>
  );
}
