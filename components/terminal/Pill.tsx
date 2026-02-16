import type { ReactNode } from 'react';

type PillTone = 'neutral' | 'accent' | 'bull' | 'bear' | 'warn';

interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
}

const toneMap: Record<PillTone, string> = {
  neutral: 'text-[var(--msp-text-muted)] border-[var(--msp-border)] bg-[var(--msp-panel-2)]',
  accent: 'text-[var(--msp-accent)] border-[var(--msp-border-strong)] bg-[var(--msp-panel)]',
  bull: 'text-[var(--msp-bull)] border-[color:rgba(47,179,110,0.35)] bg-[var(--msp-bull-tint)]',
  bear: 'text-[var(--msp-bear)] border-[color:rgba(228,103,103,0.35)] bg-[var(--msp-bear-tint)]',
  warn: 'text-[var(--msp-warn)] border-[color:rgba(216,162,67,0.35)] bg-[var(--msp-warn-tint)]',
};

export default function Pill({ children, tone = 'neutral', className = '' }: PillProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${toneMap[tone]} ${className}`}>
      {children}
    </span>
  );
}
