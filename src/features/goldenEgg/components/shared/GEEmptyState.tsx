type GEEmptyStateProps = {
  title: string;
  body: string;
};

export default function GEEmptyState({ title, body }: GEEmptyStateProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-3">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      <div className="mt-1 text-sm text-slate-300">{body}</div>
    </div>
  );
}
