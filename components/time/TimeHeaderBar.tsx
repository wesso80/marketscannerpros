import { Direction, TimePermission } from '@/components/time/types';

type TimeHeaderBarProps = {
  symbol: string;
  permission: TimePermission;
  gateScore: number;
  timeConfluenceScore: number;
  direction: Direction;
};

export default function TimeHeaderBar(props: TimeHeaderBarProps) {
  const badge =
    props.permission === 'ALLOW'
      ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
      : props.permission === 'WAIT'
      ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'
      : 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30';

  return (
    <div className="border-b border-white/5 bg-[#070d18]">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <div>
          <div className="text-sm text-slate-400">Time Confluence Scanner</div>
          <div className="mt-1 text-xl font-semibold">{props.symbol}</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-white/10">
            Direction: <span className="text-slate-200">{props.direction}</span>
          </div>

          <div className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${badge}`}>
            {props.permission} • Gate {props.gateScore}
          </div>

          <div className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-white/10">
            Time Score {props.timeConfluenceScore}
          </div>
        </div>
      </div>
    </div>
  );
}
