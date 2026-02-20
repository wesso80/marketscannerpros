type GEKpiPillProps = {
  label: string;
  value: string;
};

export default function GEKpiPill({ label, value }: GEKpiPillProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}
