import { JournalHeaderActions, JournalHeaderModel } from '@/types/journal';

type JournalCommandBarProps = {
  header?: JournalHeaderModel;
  actions: JournalHeaderActions;
  viewMode: 'normal' | 'compact';
  onToggleViewMode: () => void;
};

function healthTone(health?: JournalHeaderModel['health']) {
  if (health === 'down') return 'bg-rose-500/20 text-rose-200';
  if (health === 'degraded') return 'bg-amber-500/20 text-amber-200';
  return 'bg-emerald-500/20 text-emerald-200';
}

export default function JournalCommandBar({ header, actions, viewMode, onToggleViewMode }: JournalCommandBarProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-100">Trade Journal</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs ${healthTone(header?.health)}`}>{header?.health || 'ok'}</span>
          </div>
          <p className="text-sm text-slate-300">{header?.subtitle || 'Learning loop + truth source for scanner, options, and time.'}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={actions.onNewTrade} className="rounded-lg bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-200">+ New Trade</button>
          <button onClick={actions.onExport} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-100">Export CSV</button>
          {actions.onImport && (
            <button onClick={actions.onImport} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-100">Import</button>
          )}
          <button onClick={onToggleViewMode} className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100">{viewMode === 'normal' ? 'Compact' : 'Normal'}</button>
        </div>
      </div>
    </div>
  );
}
