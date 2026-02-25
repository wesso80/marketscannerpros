import { JournalHeaderActions, JournalHeaderModel } from '@/types/journal';
import TerminalPageHeader from '@/components/terminal/TerminalPageHeader';

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
  const headerActions = (
    <>
      <button onClick={actions.onNewTrade} className="rounded-lg border border-emerald-500/30 bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-200">+ New Trade</button>
      <button onClick={actions.onExport} className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-100">Export CSV</button>
      {actions.onImport && (
        <button onClick={actions.onImport} className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-100">Import</button>
      )}
      {actions.onClear && (
        <button onClick={actions.onClear} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">Clear All</button>
      )}
      <button onClick={onToggleViewMode} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">{viewMode === 'normal' ? 'Compact' : 'Normal'}</button>
    </>
  );

  const headerMeta = (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${healthTone(header?.health)}`}>
      Data Health: {header?.health || 'ok'}
    </span>
  );

  return (
    <TerminalPageHeader
      badge="TRADE JOURNAL"
      title={header?.title || 'Trade Journal'}
      subtitle={header?.subtitle || 'Learning loop + truth source for scanner, options, and time.'}
      icon="🧾"
      actions={headerActions}
      meta={headerMeta}
      className="bg-slate-900/40"
    />
  );
}
