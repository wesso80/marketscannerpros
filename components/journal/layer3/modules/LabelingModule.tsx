import { LabelingModuleModel } from '@/types/journal';

export default function LabelingModule({ data }: { data: LabelingModuleModel }) {
  return (
    <div className="space-y-2 text-sm text-slate-200">
      <div>Missing outcomes: {data.missingOutcomes}</div>
      <div className="flex flex-wrap gap-2">
        {data.quickAssign.length === 0 ? (
          <span className="text-slate-400">No quick-assign items.</span>
        ) : (
          data.quickAssign.map((item) => (
            <span key={item.tradeId} className="rounded-full bg-white/10 px-2 py-1 text-xs">
              {item.symbol}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
