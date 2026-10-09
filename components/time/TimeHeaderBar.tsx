import { Direction, TimePermission } from '@/components/time/types';

type TimeHeaderBarProps = {
  symbol: string;
  permission: TimePermission;
  gateScore: number;
  timeConfluenceScore: number;
  direction: Direction;
};

export default function TimeHeaderBar(props: TimeHeaderBarProps) {
  return (
    <div className="border-b border-white/5 bg-[#070d18]">
      <div className="mx-auto flex w-full max-w-none items-center justify-between px-4 py-4">
        <div>
          <div className="text-sm text-slate-400">Close timing Scanner</div>
          <div className="mt-1 text-xl font-semibold">{props.symbol}</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-white/10">
            Direction: <span className="text-slate-200">{props.direction}</span>
          </div>

          <div className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-white/10">
            What to check: close timing
          </div>
        </div>
      </div>
    </div>
  );
}
