import type { ReactNode } from 'react';

interface SectionCardProps {
  title?: string;
  kicker?: string;
  children: ReactNode;
  className?: string;
  rightSlot?: ReactNode;
}

export default function SectionCard({ title, kicker, children, className = '', rightSlot }: SectionCardProps) {
  return (
    <section className={`msp-panel rounded-xl border border-[var(--msp-border)] p-3 md:p-4 ${className}`}>
      {(title || kicker || rightSlot) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            {kicker ? <div className="msp-muted text-[11px] font-bold uppercase tracking-[0.06em]">{kicker}</div> : null}
            {title ? <h3 className="text-sm font-extrabold text-[var(--msp-text)] md:text-base">{title}</h3> : null}
          </div>
          {rightSlot}
        </div>
      )}
      {children}
    </section>
  );
}
