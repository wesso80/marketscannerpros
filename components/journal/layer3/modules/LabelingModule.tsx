import { LabelingModuleModel } from '@/types/journal';

export default function LabelingModule({ data }: { data: LabelingModuleModel }) {
  return (
    <div className="space-y-2 text-sm text-slate-200">
      <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
        data.missingOutcomes > 0
          ? 'border-amber-500/25 bg-amber-500/10 text-amber-200'
          : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
      }`}>
        <span className="text-xs">{data.missingOutcomes > 0 ? `${data.missingOutcomes} trades need labeling` : 'All trades labeled'}</span>
      </div>
      {data.quickAssign.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.quickAssign.map((item) => (
            <span key={item.tradeId} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
              {item.symbol}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
