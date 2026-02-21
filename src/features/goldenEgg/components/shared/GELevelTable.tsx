type GELevelTableProps = {
  rows: Array<{ label?: string; price: number; kind?: string; note?: string; rMultiple?: number }>;
};

export default function GELevelTable({ rows }: GELevelTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/5">
      {rows.map((row, idx) => (
        <div key={`${row.label || row.kind}-${row.price}-${idx}`} className="grid grid-cols-2 gap-2 border-b border-white/5 px-3 py-2 text-sm last:border-b-0 sm:grid-cols-4">
          <div className="text-slate-300">{row.label || row.kind || 'Level'}</div>
          <div className="font-semibold text-slate-100">{row.price.toFixed(2)}</div>
          <div className="text-slate-300">{typeof row.rMultiple === 'number' ? `${row.rMultiple.toFixed(1)}R` : '—'}</div>
          <div className="text-slate-400">{row.note || '—'}</div>
        </div>
      ))}
    </div>
  );
}
