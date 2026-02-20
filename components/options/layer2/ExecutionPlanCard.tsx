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
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4">
      <div className="text-sm font-semibold text-slate-100">Execution Plan</div>
      {permission === 'BLOCK' ? (
        <div className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">Do not execute. Wait for flip conditions.</div>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200">Entry: {plan.entry}</div>
            <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200">Stop: {plan.stop}</div>
            {!compact && (
              <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200">Targets: {plan.targets.join(' · ') || 'N/A'}</div>
            )}
            <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200">R Preview: {plan.rPreview}</div>
            <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200">Risk Governor: {plan.riskGovernor}</div>
            {!compact && <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200">Position: {plan.positionSuggestion}</div>}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={onCopyPlan} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-100">Copy Plan</button>
            <button onClick={onSendToJournal} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-100">Send to Journal</button>
          </div>
        </>
      )}
    </div>
  );
}
