type PaginationBarProps = {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
};

export default function PaginationBar({ page, pageSize, total, onChange }: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
      <span>Page {page} of {totalPages} • {total} trades</span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded bg-white/10 px-3 py-1 disabled:opacity-40">Prev</button>
        <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="rounded bg-white/10 px-3 py-1 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
