import type { ReactNode } from 'react';
import ScoreBadge from '@/components/msp/core/ScoreBadge';

type LayerTone = 'context' | 'setup' | 'execution';

type LayerSectionProps = {
  tone: LayerTone;
  title: string;
  subtitle?: string;
  score?: number;
  children: ReactNode;
  rightSlot?: ReactNode;
};

const toneClass: Record<LayerTone, string> = {
  context: 'border-blue-500/25 bg-blue-500/[0.04]',
  setup: 'border-teal-500/25 bg-teal-500/[0.04]',
  execution: 'border-purple-500/25 bg-purple-500/[0.04]',
};

export default function LayerSection({ tone, title, subtitle, score, children, rightSlot }: LayerSectionProps) {
  return (
    <section className={`rounded-2xl border p-6 ${toneClass[tone]}`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--msp-text)]">{title}</h3>
          {subtitle && <p className="text-sm text-[var(--msp-muted)]">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {typeof score === 'number' && <ScoreBadge label={`${title} Score`} score={score} tone={tone} />}
          {rightSlot}
        </div>
      </div>
      {children}
    </section>
  );
}
