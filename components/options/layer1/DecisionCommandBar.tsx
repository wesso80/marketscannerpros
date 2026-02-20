import { DecisionActions, DecisionModel } from '@/types/optionsScanner';

type DecisionCommandBarProps = {
  decision: DecisionModel;
  actions: DecisionActions;
  viewMode: 'normal' | 'compact';
  onToggleViewMode: () => void;
};

function tone(permission: DecisionModel['permission']) {
  if (permission === 'GO') return 'border-emerald-500/30 bg-emerald-500/10';
  if (permission === 'WAIT') return 'border-amber-500/30 bg-amber-500/10';
  return 'border-rose-500/30 bg-rose-500/10';
}

export default function DecisionCommandBar({ decision, actions, viewMode, onToggleViewMode }: DecisionCommandBarProps) {
  return (
    <div className={`rounded-2xl border p-4 ${tone(decision.permission)}`}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-white/10 px-2 py-1 font-semibold">{decision.permission}</span>
            <span className="rounded-full bg-white/10 px-2 py-1">{decision.direction}</span>
            <span className="rounded-full bg-white/10 px-2 py-1">Conf {decision.confidence}</span>
            <span className="rounded-full bg-white/10 px-2 py-1">{decision.quality}</span>
          </div>
          <div className="text-sm text-slate-100"><span className="text-slate-400">Driver:</span> {decision.primaryDriver}</div>
          <div className="text-sm text-slate-100"><span className="text-slate-400">Blocker:</span> {decision.primaryBlocker || '—'}</div>
        </div>
        <div className="lg:col-span-5 space-y-2">
          <div className="text-sm text-slate-100"><span className="text-slate-400">Flip:</span> {decision.flipTrigger}</div>
          <div className="text-sm text-slate-100"><span className="text-slate-400">Catalyst:</span> {decision.catalystWindow || '—'}</div>
          <div className="text-sm text-slate-100"><span className="text-slate-400">Validity:</span> {decision.validityLabel}</div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button disabled={!actions.deployEnabled} onClick={actions.onDeploy} className="rounded-lg bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-200 disabled:opacity-40">Deploy Plan</button>
            <button disabled={!actions.alertEnabled} onClick={actions.onAlert} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-100 disabled:opacity-40">Set Alert</button>
            <button disabled={!actions.watchlistEnabled} onClick={actions.onWatchlist} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-100 disabled:opacity-40">Watchlist</button>
            <button disabled={!actions.journalEnabled} onClick={actions.onJournal} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-100 disabled:opacity-40">Journal</button>
            <button onClick={onToggleViewMode} className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100">{viewMode === 'normal' ? 'Compact' : 'Normal'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
