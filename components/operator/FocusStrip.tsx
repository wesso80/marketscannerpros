type FocusStripProps = {
  focus: {
    primary: string | null;
    reason: string;
    horizon: 'NOW' | 'TODAY' | 'SWING';
    lockedUntilTs?: string;
    pinned?: boolean;
  };
  onAction: (kind: 'create_alert' | 'prepare_plan' | 'snooze' | 'pin') => void;
  disabled?: boolean;
  chips?: Array<{ id: string; label: string; value: string; tone: 'good' | 'warn' | 'bad' }>;
};

export default function FocusStrip({ focus, onAction, disabled, chips = [] }: FocusStripProps) {
  const lockLabel = focus.lockedUntilTs
    ? new Date(focus.lockedUntilTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-emerald-300">Focus</div>
          <div className="text-sm font-semibold text-emerald-100">
            {focus.primary ?? '—'} · {focus.horizon}
            {focus.pinned ? <span className="ml-2 rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-200">PINNED</span> : null}
          </div>
          <div className="text-xs text-emerald-100/85">{focus.reason}</div>
          {lockLabel ? <div className="text-[11px] text-emerald-200/75">Locked until {lockLabel}</div> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button disabled={disabled} onClick={() => onAction('create_alert')} className="rounded border border-emerald-400/40 px-2 py-1 text-xs">Create Alert</button>
          <button disabled={disabled} onClick={() => onAction('prepare_plan')} className="rounded border border-cyan-400/40 px-2 py-1 text-xs">Draft Plan</button>
          <button disabled={disabled} onClick={() => onAction('snooze')} className="rounded border border-amber-400/40 px-2 py-1 text-xs">Snooze 20m</button>
          <button disabled={disabled} onClick={() => onAction('pin')} className="rounded border border-violet-400/40 px-2 py-1 text-xs">Pin 60m</button>
        </div>
      </div>

      {chips.length ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          {chips.map((chip) => (
            <div key={chip.id} className="rounded border border-slate-700 bg-slate-900/40 px-2 py-1 text-xs">
              <span className="text-slate-400">{chip.label}: </span>
              <span className={chip.tone === 'bad' ? 'text-rose-300' : chip.tone === 'warn' ? 'text-amber-300' : 'text-emerald-300'}>{chip.value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
