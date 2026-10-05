type PaginationBarProps = {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  onShowAll?: () => void;
};

export default function PaginationBar({
  page,
  pageSize,
  total,
  onChange,
  onShowAll,
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/5 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
      <span>
        {page}/{totalPages} · {total} records
      </span>
      <div className="flex gap-2">
        {onShowAll && (
          <button
            type="button"
            onClick={onShowAll}
            className="rounded border border-slate-600 px-2 py-1 text-xs"
          >
            {pageSize === 10 ? `Show all ${total}` : "Show first 10"}
          </button>
        )}
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded bg-white/10 px-2 py-1 disabled:opacity-40"
        >
          Prev
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="rounded bg-white/10 px-2 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
