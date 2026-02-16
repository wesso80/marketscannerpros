import type { ReactNode } from 'react';

interface TrapDoorProps {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}

export default function TrapDoor({ title, subtitle, open, onToggle, children, className = '' }: TrapDoorProps) {
  return (
    <section className={`rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 p-3 text-left md:p-4"
      >
        <div>
          <div className="text-sm font-extrabold text-[var(--msp-text)]">{title}</div>
          {subtitle ? <div className="msp-muted text-xs">{subtitle}</div> : null}
        </div>
        <span className="msp-muted text-xs font-bold uppercase">{open ? 'Collapse' : 'Expand'}</span>
      </button>
      {open ? <div className="border-t border-[var(--msp-divider)] p-3 md:p-4">{children}</div> : null}
    </section>
  );
}
