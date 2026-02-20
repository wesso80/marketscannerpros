import { ExecutionPlanModel, PermissionState } from '@/types/optionsScanner';

type ExecutionPlanCardProps = {
  plan: ExecutionPlanModel;
  permission: PermissionState;
  onCopyPlan: () => void;
  onSendToJournal: () => void;
  compact?: boolean;
};

export default function ExecutionPlanCard({ plan, permission, onCopyPlan, onSendToJournal, compact = false }: ExecutionPlanCardProps) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950/35 p-3 shadow-sm">
      {permission === 'BLOCK' ? (
        <div className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">Do not execute. Wait for flip conditions.</div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Entry</div>
              <div className="text-sm font-semibold text-slate-100">{plan.entry}</div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Stop</div>
              <div className="text-sm font-semibold text-slate-100">{plan.stop}</div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Target</div>
              <div className="text-sm font-semibold text-slate-100">{plan.targets.join(' · ') || 'N/A'}</div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-2.5 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">R:R</div>
                <div className="text-sm font-semibold text-slate-100">{plan.rPreview}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-2.5 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Risk %</div>
                <div className="text-sm font-semibold text-slate-100">{compact ? 'N/A' : '1.0%'}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-2.5 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Size</div>
                <div className="text-sm font-semibold text-slate-100">{plan.positionSuggestion || 'N/A'}</div>
              </div>
            </div>

            {!compact && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2 text-xs text-slate-300">
                Capital Allocation: {plan.positionSuggestion || 'N/A'}
              </div>
            )}

            <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2 text-xs text-slate-400">
              Risk Governor: {plan.riskGovernor}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <button onClick={onCopyPlan} className="w-full rounded-xl border border-slate-700 bg-slate-200/10 px-4 py-2 text-sm font-semibold text-slate-100">Deploy</button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onCopyPlan} className="rounded-xl border border-slate-800 bg-slate-200/5 px-3 py-2 text-xs font-semibold text-slate-100">Set Alert</button>
              <button onClick={onSendToJournal} className="rounded-xl border border-slate-800 bg-slate-200/5 px-3 py-2 text-xs font-semibold text-slate-100">Journal</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
