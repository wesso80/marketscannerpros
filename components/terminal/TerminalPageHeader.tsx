import React from 'react';

type TerminalPageHeaderProps = {
  badge?: string;
  title: string;
  subtitle?: string;
  icon?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
};

export default function TerminalPageHeader({
  badge,
  title,
  subtitle,
  icon,
  actions,
  meta,
  className,
}: TerminalPageHeaderProps) {
  return (
    <section className={`msp-elite-panel ${className || ''}`.trim()}>
      <div className="msp-grid-12 items-start" style={{ rowGap: '12px' }}>
        <div className="col-span-12 lg:col-span-8">
          <div className="flex items-start gap-3">
            {icon ? (
              <div className="grid h-[40px] w-[40px] place-items-center rounded-[12px] border border-[var(--msp-border-strong)] bg-[var(--msp-panel-2)] text-[20px] leading-none text-[var(--msp-accent)]">
                {icon}
              </div>
            ) : null}
            <div>
              {badge ? (
                <div className="mb-1 inline-flex items-center rounded-full border border-[var(--msp-border-strong)] bg-[var(--msp-panel-2)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--msp-accent)]">
                  {badge}
                </div>
              ) : null}
              <h1 className="text-[1.3rem] font-semibold tracking-[0.01em] text-[var(--msp-text)]">{title}</h1>
              {subtitle ? <p className="mt-1 text-[0.82rem] text-[var(--msp-text-muted)]">{subtitle}</p> : null}
              {meta ? <div className="mt-2">{meta}</div> : null}
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-wrap items-center justify-start gap-2 lg:justify-end">
          {actions}
        </div>
      </div>
    </section>
  );
}
