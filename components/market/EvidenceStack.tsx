export type EvidenceStackItem = {
  label: string;
  value: string;
  status?: 'supportive' | 'neutral' | 'conflicting' | 'missing';
  detail?: string;
};

function evidenceTone(status: EvidenceStackItem['status']) {
  if (status === 'supportive') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
  if (status === 'conflicting') return 'border-rose-500/30 bg-rose-500/10 text-rose-100';
  if (status === 'missing') return 'border-slate-600 bg-slate-900/50 text-slate-300';
  return 'border-amber-500/25 bg-amber-500/10 text-amber-100';
}

type EvidenceStackProps = {
  title?: string;
  items: EvidenceStackItem[];
  emptyText?: string;
};

export default function EvidenceStack({ title = 'Evidence Stack', items, emptyText = 'No evidence items available.' }: EvidenceStackProps) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-slate-500">{emptyText}</div>
      ) : (
        <div className="grid gap-2">
          {items.map((item) => (
            <div key={`${item.label}-${item.value}`} className={`rounded-md border px-3 py-2 ${evidenceTone(item.status)}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-slate-100">{item.label}</span>
                <span className="font-black uppercase">{item.value}</span>
              </div>
              {item.detail && <div className="mt-1 text-[11px] leading-5 opacity-80">{item.detail}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
