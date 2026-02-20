import type { ReactNode } from 'react';

type CardHeaderProps = {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
};

export default function CardHeader({ title, subtitle, rightSlot }: CardHeaderProps) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-[var(--msp-text)]">{title}</div>
        {subtitle && <div className="text-xs text-[var(--msp-muted)]">{subtitle}</div>}
      </div>
      {rightSlot}
    </div>
  );
}
