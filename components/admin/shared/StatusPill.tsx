type Props = {
  label: string;
  tone?: "neutral" | "green" | "yellow" | "red" | "blue" | "purple";
};

const toneMap = {
  neutral: "bg-white/10 text-white/80 border-white/10",
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  yellow: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  red: "bg-red-500/15 text-red-300 border-red-500/20",
  blue: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  purple: "bg-violet-500/15 text-violet-300 border-violet-500/20",
};

export default function StatusPill({ label, tone = "neutral" }: Props) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${toneMap[tone]}`}>
      {label}
    </span>
  );
}
