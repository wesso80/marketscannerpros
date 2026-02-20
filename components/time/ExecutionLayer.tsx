import ExecutionChecklist from '@/components/time/ExecutionChecklist';
import LayerSection from '@/components/time/LayerSection';
import { MiniScore } from '@/components/time/atoms';
import { TimeConfluenceV2Output, TimeExecutionInputs } from '@/components/time/types';

function ExecutionSummary({ execution, permission }: { execution: TimeExecutionInputs; permission: TimeConfluenceV2Output['permission'] }) {
  const tone =
    permission === 'ALLOW'
      ? 'border-emerald-500/20 bg-emerald-500/10'
      : permission === 'WAIT'
      ? 'border-amber-500/20 bg-amber-500/10'
      : 'border-rose-500/20 bg-rose-500/10';

  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="text-sm font-semibold text-slate-100">Execution Status</div>
      <div className="mt-2 text-sm text-slate-200">
        Close: <span className="font-semibold">{execution.closeConfirmation}</span>
      </div>
      <div className="mt-1 text-sm text-slate-200">
        Risk: <span className="font-semibold">{execution.riskState}</span>
      </div>
      <div className="mt-1 text-sm text-slate-200">
        Note: <span className="text-slate-100">{execution.notes?.[0] ?? '—'}</span>
      </div>
    </div>
  );
}

export default function ExecutionLayer({ execution, out }: { execution: TimeExecutionInputs; out: TimeConfluenceV2Output }) {
  return (
    <LayerSection title="Layer 3 — Execution (Timing Validity)" tone="execution" right={<MiniScore label="Exec" value={out.executionScore} />}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExecutionChecklist execution={execution} />
        <ExecutionSummary execution={execution} permission={out.permission} />
      </div>
    </LayerSection>
  );
}
