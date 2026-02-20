import CardHeader from '@/components/msp/core/CardHeader';
import MetricRow from '@/components/msp/core/MetricRow';

type Props = { payload: any };

export default function MarketRegimeCard({ payload }: Props) {
  return (
    <div className="rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-4">
      <CardHeader title="Market Regime" />
      <div className="space-y-1.5">
        <MetricRow label="Direction" value={(payload?.bias?.direction || 'neutral').toUpperCase()} />
        <MetricRow label="Trend State" value={payload?.context?.trendState || 'Normal'} />
        <MetricRow label="TF Snapshot" value={payload?.scores?.tfAlignment ? `${payload.scores.tfAlignment}/4` : '—'} />
      </div>
    </div>
  );
}
