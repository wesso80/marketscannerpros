import React from 'react';

type TerminalPageHeaderProps = {
  badge?: string;
  title: string;
  subtitle?: string;
  icon?: string;
  image?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
};

function headerCode(title: string, badge?: string) {
  const source = (badge || title).replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const code = parts.slice(0, 2).map((part) => part[0]).join('') || 'MSP';
  return code.toUpperCase();
}

export default function TerminalPageHeader({
  badge,
  title,
  subtitle,
  icon,
  image,
  actions,
  meta,
  className,
}: TerminalPageHeaderProps) {
  const code = headerCode(title, badge);

  return (
    <section className={`msp-elite-panel ${className || ''}`.trim()} style={{ padding: 12, borderRadius: 8, background: 'linear-gradient(135deg, rgba(15,23,42,0.98), rgba(8,13,24,0.98))' }}>
      <div className="msp-grid-12 items-start" style={{ rowGap: '10px' }}>
        <div className="col-span-12 lg:col-span-8">
          <div className="flex items-start gap-2.5">
            {image ? (
              <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-md border border-[var(--msp-border-strong)] bg-[var(--msp-panel-2)]">
                <img src={image} alt="" className="h-full w-full object-contain p-1" />
              </div>
            ) : icon ? (
              <div className="grid h-8 w-8 place-items-center rounded-md border border-[var(--msp-border-strong)] bg-[var(--msp-panel-2)] text-[10px] font-black uppercase tracking-[0.04em] text-[var(--msp-accent)]" title={icon}>
                {code}
              </div>
            ) : null}
            <div>
              {badge ? (
                <div className="mb-1 inline-flex items-center rounded-md border border-[var(--msp-border-strong)] bg-[var(--msp-panel-2)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-accent)]">
                  {badge}
                </div>
              ) : null}
              <h1 className="text-[1.08rem] font-black tracking-normal text-[var(--msp-text)] md:text-[1.2rem]">{title}</h1>
              {subtitle ? <p className="mt-0.5 max-w-3xl text-xs leading-5 text-[var(--msp-text-muted)]">{subtitle}</p> : null}
              {meta ? <div className="mt-1.5">{meta}</div> : null}
            </div>
          </div>
        </div>

        <div className="col-span-12 flex flex-wrap items-center justify-start gap-1.5 lg:col-span-4 lg:justify-end">
          {actions}
        </div>
      </div>
    </section>
  );
}
