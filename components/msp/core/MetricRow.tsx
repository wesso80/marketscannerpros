type MetricRowProps = {
  label: string;
  value: string;
};

export default function MetricRow({ label, value }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--msp-muted)]">{label}</span>
      <span className="font-semibold text-[var(--msp-text)]">{value}</span>
    </div>
  );
}
