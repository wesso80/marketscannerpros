type Props = {
  label: string;
  value: string | number;
  valueColor?: string;
};

export default function DataRow({ label, value, valueColor }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-white/55">{label}</span>
      <span className={`font-medium ${valueColor || "text-white/90"}`}>{value}</span>
    </div>
  );
}
