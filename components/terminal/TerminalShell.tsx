import type { ReactNode } from 'react';

interface TerminalShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export default function TerminalShell({ title, subtitle, children, actions, className = '' }: TerminalShellProps) {
  return (
    <section className={`options-page-container min-h-screen bg-[var(--msp-bg)] text-[var(--msp-text)] px-2 py-3 md:px-4 md:py-6 ${className}`}>
      <div className="mx-auto w-full max-w-[1400px]">
        <header className="msp-surface mb-4 rounded-xl border border-[var(--msp-border)] p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-black tracking-tight text-[var(--msp-text)] md:text-3xl">{title}</h1>
              {subtitle ? <p className="msp-muted mt-1 text-sm md:text-base">{subtitle}</p> : null}
            </div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
          </div>
        </header>
        {children}
      </div>
    </section>
  );
}
