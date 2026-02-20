type EvidenceDockHeaderProps = {
  confirmations: number;
  conflicts: number;
  signals: number;
  onExpandAll: () => void;
  onCollapseAll: () => void;
};

export default function EvidenceDockHeader({ confirmations, conflicts, signals, onExpandAll, onCollapseAll }: EvidenceDockHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-900/25 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm text-slate-100">
        <span className="font-semibold">Intelligence Stack</span>
        <span className="rounded-full bg-white/10 px-2 py-1 text-xs">{signals} signals</span>
        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">{confirmations} confirmations</span>
        <span className="rounded-full bg-rose-500/10 px-2 py-1 text-xs text-rose-200">{conflicts} conflicts</span>
      </div>
      <div className="flex gap-2">
        <button onClick={onExpandAll} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-slate-100">Expand all</button>
        <button onClick={onCollapseAll} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-slate-100">Collapse all</button>
      </div>
    </div>
  );
}
