import { MiniScore } from '@/components/time/atoms';
import { TimePermission } from '@/components/time/types';

type TimeGateBarProps = {
  permission: TimePermission;
  gateScore: number;
  timeConfluenceScore: number;
  reasons: string[];
};

export default function TimeGateBar(props: TimeGateBarProps) {
  const tone =
    props.permission === 'ALLOW'
      ? 'border-emerald-500/25 bg-emerald-500/10'
      : props.permission === 'WAIT'
      ? 'border-amber-500/25 bg-amber-500/10'
      : 'border-rose-500/25 bg-rose-500/10';

  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-300">TIME DEPLOYMENT STATUS</div>
          <div className="mt-1 text-lg font-semibold text-slate-100">Permission: {props.permission}</div>
        </div>

        <div className="flex items-center gap-3">
          <MiniScore label="Gate" value={props.gateScore} />
          <MiniScore label="Time" value={props.timeConfluenceScore} />
          <button className="h-9 rounded-lg bg-white/5 px-4 text-sm font-semibold text-slate-200 ring-1 ring-white/10 hover:bg-white/10">
            Set Alert on Close
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {props.reasons.slice(0, 6).map((reason) => (
          <div key={reason} className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 ring-1 ring-white/10">
            • {reason}
          </div>
        ))}
      </div>
    </div>
  );
}
