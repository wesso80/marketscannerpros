type GEKeyValueRowProps = {
  label: string;
  value: string;
};

export default function GEKeyValueRow({ label, value }: GEKeyValueRowProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
      <span className="shrink-0 text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <span className="min-w-0 break-words text-sm text-slate-100">{value}</span>
    </div>
  );
}
