import { TimeExecutionInputs } from '@/components/time/types';
import { pct } from '@/components/time/scoring';

function ChecklistRow({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/2 px-3 py-2">
      <div className="text-sm text-slate-200">{label}</div>
      <div className={`text-xs font-semibold ${ok ? 'text-emerald-300' : 'text-rose-300'}`}>{ok ? 'PASS' : 'FAIL'}</div>
      {note ? <div className="ml-3 text-xs text-slate-400">{note}</div> : null}
    </div>
  );
}

export default function ExecutionChecklist({ execution }: { execution: TimeExecutionInputs }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/2 p-4">
      <div className="text-sm font-semibold text-slate-200">Execution Checklist</div>
      <div className="mt-3 space-y-2">
        <ChecklistRow label="Close Confirmation" ok={execution.closeConfirmation === 'CONFIRMED'} note={execution.closeConfirmation} />
        <ChecklistRow label="Close Strength" ok={execution.closeStrength >= 0.55} note={`${pct(execution.closeStrength)}%`} />
        <ChecklistRow label="Entry Window Quality" ok={execution.entryWindowQuality >= 0.6} note={`${pct(execution.entryWindowQuality)}%`} />
        <ChecklistRow label="Liquidity OK" ok={execution.liquidityOK} />
        <ChecklistRow label="Risk State" ok={execution.riskState === 'controlled'} note={execution.riskState} />
      </div>
    </div>
  );
}
