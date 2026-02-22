import { RiskModuleModel } from '@/types/journal';

export default function RiskModule({ data }: { data: RiskModuleModel }) {
  const hasIssues = data.missingStops > 0 || data.oversizeFlags > 0;

  return (
    <div className="space-y-2 text-sm text-slate-200">
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-lg border px-3 py-2 ${data.missingStops > 0 ? 'border-rose-500/25 bg-rose-500/10 text-rose-200' : 'border-white/5 bg-white/5 text-slate-300'}`}>
          <span className="text-xs text-slate-400">Missing Stops</span>
          <div className="text-base font-semibold">{data.missingStops}</div>
        </div>
        <div className={`rounded-lg border px-3 py-2 ${data.oversizeFlags > 0 ? 'border-amber-500/25 bg-amber-500/10 text-amber-200' : 'border-white/5 bg-white/5 text-slate-300'}`}>
          <span className="text-xs text-slate-400">Oversize Flags</span>
          <div className="text-base font-semibold">{data.oversizeFlags}</div>
        </div>
      </div>
      {hasIssues && data.blocker ? (
        <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-rose-100">{data.blocker}</div>
      ) : (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-emerald-200">All positions have stops. No oversize flags.</div>
      )}
    </div>
  );
}
