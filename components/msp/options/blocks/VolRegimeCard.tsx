import CardHeader from '@/components/msp/core/CardHeader';
import MetricRow from '@/components/msp/core/MetricRow';

type Props = { payload: any };

export default function VolRegimeCard({ payload }: Props) {
  return (
    <div className="rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-4">
      <CardHeader title="Volatility Regime" />
      <div className="space-y-1.5">
        <MetricRow label="IV Rank" value={typeof payload?.features?.context?.ivRankNorm === 'number' ? `${Math.round(payload.features.context.ivRankNorm * 100)}%` : '—'} />
        <MetricRow label="Term Slope" value={payload?.context?.termSlope || 'N/A'} />
        <MetricRow label="Regime" value={payload?.context?.volRegime || 'Normal'} />
      </div>
    </div>
  );
}
