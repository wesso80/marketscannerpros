import { MetricCard, SectionCard } from '@/components/time/atoms';
import { pct } from '@/components/time/scoring';
import { TimeSetupInputs } from '@/components/time/types';

export default function ClusterStrengthCard({ window }: { window: TimeSetupInputs['window'] }) {
  return (
    <SectionCard>
      <div className="text-sm font-semibold text-slate-200">Cluster Strength</div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <MetricCard label="Alignment Count" value={`${window.alignmentCount}/${window.tfCount}`} />
        <MetricCard label="Direction Consistency" value={`${pct(window.directionConsistency)}%`} />
        <MetricCard label="Cluster Integrity" value={`${pct(window.clusterIntegrity)}%`} />
        <MetricCard label="Window Strength" value={`${pct(window.strength)}%`} />
      </div>
    </SectionCard>
  );
}
