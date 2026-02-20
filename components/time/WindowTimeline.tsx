import { TimeSetupInputs } from '@/components/time/types';
import { pct } from '@/components/time/scoring';

export default function WindowTimeline({ window }: { window: TimeSetupInputs['window'] }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/2 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Active Window Timeline</div>
        <div className="text-xs text-slate-400">Status: {window.status}</div>
      </div>

      <div className="rounded-lg border border-white/5 bg-white/3 p-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="text-slate-300">
            Time Remaining: <span className="font-semibold text-slate-100">{window.timeRemainingMinutes ?? '—'}m</span>
          </div>
          <div className="text-slate-300">
            Window Strength: <span className="font-semibold text-slate-100">{pct(window.strength)}%</span>
          </div>
          <div className="text-slate-300">
            Cluster Integrity: <span className="font-semibold text-slate-100">{pct(window.clusterIntegrity)}%</span>
          </div>
        </div>

        <div className="mt-3 h-3 w-full rounded-full bg-white/5">
          <div className="h-3 rounded-full bg-teal-500/60" style={{ width: `${pct(window.strength)}%` }} />
        </div>
      </div>
    </div>
  );
}
