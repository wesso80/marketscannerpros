type BadgeTone = 'neutral' | 'good' | 'warn' | 'bad';

type BadgeProps = {
  children: string;
  tone?: BadgeTone;
};

const toneClass: Record<BadgeTone, string> = {
  neutral: 'border-[var(--msp-border)] text-[var(--msp-muted)] bg-[var(--msp-panel-2)]',
  good: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
  warn: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
  bad: 'border-red-500/40 text-red-300 bg-red-500/10',
};

export default function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${toneClass[tone]}`}>{children}</span>;
}
