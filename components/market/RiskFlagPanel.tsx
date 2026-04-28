export type RiskFlag = {
  label: string;
  severity?: 'info' | 'warning' | 'critical';
  detail?: string;
};

function flagTone(severity: RiskFlag['severity']) {
  if (severity === 'critical') return 'border-red-500/35 bg-red-500/10 text-red-100';
  if (severity === 'warning') return 'border-amber-500/35 bg-amber-500/10 text-amber-100';
  return 'border-slate-700 bg-slate-900/40 text-slate-300';
}

type RiskFlagPanelProps = {
  title?: string;
  flags: RiskFlag[];
  emptyText?: string;
};

export default function RiskFlagPanel({ title = 'Risk Flags', flags, emptyText = 'No active risk flags.' }: RiskFlagPanelProps) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">{title}</div>
      {flags.length === 0 ? (
        <div className="text-xs text-slate-500">{emptyText}</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {flags.map((flag) => (
            <span key={`${flag.label}-${flag.detail ?? ''}`} title={flag.detail} className={`rounded-md border px-2 py-1 text-[11px] font-bold uppercase ${flagTone(flag.severity)}`}>
              {flag.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
