type GEKeyValueRowProps = {
  label: string;
  value: string;
};

export default function GEKeyValueRow({ label, value }: GEKeyValueRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm text-slate-100">{value}</span>
    </div>
  );
}
