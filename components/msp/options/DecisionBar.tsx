import Button from '@/components/msp/core/Button';

type DecisionState = 'allow' | 'wait' | 'block';

type DecisionBarProps = {
  payload: any;
};

function toDecisionState(state?: string): DecisionState {
  if ((state || '').toLowerCase() === 'allow') return 'allow';
  if ((state || '').toLowerCase() === 'block') return 'block';
  return 'wait';
}

export default function DecisionBar({ payload }: DecisionBarProps) {
  const state = toDecisionState(payload?.permission?.state ?? 'wait');
  const confidence = payload?.scores?.confidence ?? 67;
  const quality = payload?.scores?.quality ?? 'medium';
  const context = payload?.scores?.context ?? 74;
  const setup = payload?.scores?.setup ?? 83;
  const execution = payload?.scores?.execution ?? 64;
  const reasons: string[] = payload?.permission?.blockers?.length
    ? payload.permission.blockers
    : payload?.permission?.warnings?.length
      ? payload.permission.warnings
      : ['setup strong but execution weaker'];

  const stateClass = state === 'allow'
    ? 'border-emerald-500/40 bg-emerald-500/10'
    : state === 'block'
      ? 'border-red-500/40 bg-red-500/10'
      : 'border-amber-500/40 bg-amber-500/10';

  return (
    <section className={`rounded-2xl border p-6 ${stateClass}`}>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wide text-[var(--msp-muted)]">MSP Deployment Status</div>
          <div className="text-sm text-[var(--msp-text)]">Permission: <span className="font-bold uppercase">{state}</span></div>
          <div className="text-sm text-[var(--msp-text)]">Confidence: <span className="font-bold">{confidence}%</span> • Quality: <span className="font-bold uppercase">{quality}</span></div>
          <div className="text-sm text-[var(--msp-text)]">Context/Setup/Execution: <span className="font-bold">{context}/{setup}/{execution}</span></div>
          <div className="space-y-1 pt-1 text-sm text-[var(--msp-muted)]">
            {reasons.slice(0, 3).map((reason, index) => (
              <div key={index}>• {String(reason).replaceAll('_', ' ')}</div>
            ))}
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-3 lg:items-end">
          <Button tone="primary" disabled={state === 'block'}>Deploy Strategy</Button>
          <Button>Set Alert</Button>
          <Button>Add to Watchlist</Button>
        </div>
      </div>
    </section>
  );
}
