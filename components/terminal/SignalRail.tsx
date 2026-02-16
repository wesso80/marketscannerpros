interface SignalRailItem {
  label: string;
  value: string;
  tone?: 'neutral' | 'bull' | 'bear' | 'warn' | 'accent';
}

interface SignalRailProps {
  items: SignalRailItem[];
  className?: string;
}

const toneMap: Record<NonNullable<SignalRailItem['tone']>, string> = {
  neutral: 'text-[var(--msp-text)] border-[var(--msp-border)] bg-[var(--msp-panel-2)]',
  bull: 'text-[var(--msp-bull)] border-[color:rgba(47,179,110,0.35)] bg-[var(--msp-bull-tint)]',
  bear: 'text-[var(--msp-bear)] border-[color:rgba(228,103,103,0.35)] bg-[var(--msp-bear-tint)]',
  warn: 'text-[var(--msp-warn)] border-[color:rgba(216,162,67,0.35)] bg-[var(--msp-warn-tint)]',
  accent: 'text-[var(--msp-accent)] border-[var(--msp-border-strong)] bg-[var(--msp-panel)]',
};

export default function SignalRail({ items, className = '' }: SignalRailProps) {
  return (
    <section className={`mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6 ${className}`}>
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-lg border px-2 py-2 ${toneMap[item.tone ?? 'neutral']}`}
        >
          <div className="msp-muted text-[10px] font-bold uppercase tracking-[0.06em]">{item.label}</div>
          <div className="text-xs font-extrabold md:text-sm">{item.value}</div>
        </div>
      ))}
    </section>
  );
}
