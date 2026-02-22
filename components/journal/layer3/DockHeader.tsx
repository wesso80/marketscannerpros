import { JournalDockSummaryModel } from '@/types/journal';

type DockHeaderProps = {
  summary: JournalDockSummaryModel;
  onExpandAll: () => void;
  onCollapseAll: () => void;
};

export default function DockHeader({ summary, onExpandAll, onCollapseAll }: DockHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/5 bg-slate-900/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-100">
        <span className="font-semibold">Journal Intelligence Dock</span>
        <span className="rounded-full bg-white/10 px-2 py-1 text-xs">Open {summary.openTrades}</span>
        <span className={`rounded-full px-2 py-1 text-xs ${summary.missingStops > 0 ? 'bg-rose-500/20 text-rose-200' : 'bg-emerald-500/20 text-emerald-200'}`}>
          {summary.missingStops > 0 ? `Missing Stops ${summary.missingStops}` : 'Stops ✓'}
        </span>
        <span className={`rounded-full px-2 py-1 text-xs ${summary.missingOutcomes > 0 ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/20 text-emerald-200'}`}>
          {summary.missingOutcomes > 0 ? `Missing Outcomes ${summary.missingOutcomes}` : 'Outcomes ✓'}
        </span>
        {summary.reviewQueue > 0 && (
          <span className="rounded-full bg-white/10 px-2 py-1 text-xs">Review Queue {summary.reviewQueue}</span>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={onExpandAll} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-slate-100">Expand all</button>
        <button onClick={onCollapseAll} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-slate-100">Collapse all</button>
      </div>
    </div>
  );
}
