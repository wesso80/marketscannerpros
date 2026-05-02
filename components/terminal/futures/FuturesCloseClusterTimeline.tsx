import type { FuturesCloseCalendarResponse } from '@/lib/terminal/futures/futuresCloseCalendar';

type FuturesCloseClusterTimelineProps = {
  closeCalendar: FuturesCloseCalendarResponse;
};

export default function FuturesCloseClusterTimeline({ closeCalendar }: FuturesCloseClusterTimelineProps) {
  return (
    <section className="rounded-lg border border-emerald-500/25 bg-slate-950/50 p-3" aria-label="Futures close calendar timeline">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="rounded border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-200">Close Calendar</span>
        <span className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Anchor Mode: {closeCalendar.anchorMode.replace('_', ' ')}</span>
      </div>

      <div className="mb-3 grid gap-1 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
        {closeCalendar.timeline.map((line) => (
          <div key={line} className="rounded border border-white/10 bg-slate-900/40 px-2 py-1">{line}</div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] uppercase tracking-[0.1em] text-slate-500">
              <th className="py-1.5 pr-3">Timeframe</th>
              <th className="py-1.5 pr-3">Category</th>
              <th className="py-1.5 pr-3">Minutes</th>
              <th className="py-1.5 pr-3">Next Close (UTC)</th>
              <th className="py-1.5 pr-3">Weight</th>
            </tr>
          </thead>
          <tbody>
            {closeCalendar.schedule.slice(0, 18).map((row) => (
              <tr key={row.timeframe} className="border-b border-slate-800/60">
                <td className="py-1.5 pr-3 font-semibold text-emerald-200">{row.timeframe}</td>
                <td className="py-1.5 pr-3 uppercase text-slate-300">{row.category}</td>
                <td className="py-1.5 pr-3 font-mono text-cyan-200">{row.minutesToClose}</td>
                <td className="py-1.5 pr-3 font-mono text-slate-300">{row.nextCloseISO}</td>
                <td className="py-1.5 pr-3 text-slate-400">{row.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {closeCalendar.clusters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {closeCalendar.clusters.slice(0, 6).map((cluster) => (
            <div key={`${cluster.timeISO}-${cluster.label}`} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5">
              <div className="text-[11px] font-bold text-emerald-200">{cluster.timeEtLabel} ET</div>
              <div className="text-[11px] text-slate-300">{cluster.timeframes.join(', ')}</div>
              <div className="text-[11px] text-slate-500">Score {cluster.clusterScore}</div>
            </div>
          ))}
        </div>
      )}

      {closeCalendar.warnings.length > 0 && (
        <div className="mt-3 rounded border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-100">
          {closeCalendar.warnings.join(' ')}
        </div>
      )}
    </section>
  );
}
