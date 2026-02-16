import type { ReactNode } from 'react';
import SectionCard from './SectionCard';

interface DecisionCockpitProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  className?: string;
}

export default function DecisionCockpit({ left, center, right, className = '' }: DecisionCockpitProps) {
  return (
    <section className={`mb-4 grid grid-cols-1 gap-3 lg:grid-cols-12 ${className}`}>
      <SectionCard className="lg:col-span-4" kicker="Command" title="Bias & Regime">
        {left}
      </SectionCard>
      <SectionCard className="lg:col-span-4" kicker="Decision" title="Setup Status">
        {center}
      </SectionCard>
      <SectionCard className="lg:col-span-4" kicker="Execution" title="Risk & Trigger">
        {right}
      </SectionCard>
    </section>
  );
}
