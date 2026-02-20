import { RiskModuleModel } from '@/types/journal';

export default function RiskModule({ data }: { data: RiskModuleModel }) {
  return (
    <div className="space-y-2 text-sm text-slate-200">
      <div>Missing stops: {data.missingStops}</div>
      <div>Oversize flags: {data.oversizeFlags}</div>
      <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-rose-100">{data.blocker}</div>
    </div>
  );
}
