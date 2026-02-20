import Card from '@/components/msp/core/Card';
import CardHeader from '@/components/msp/core/CardHeader';
import MetricRow from '@/components/msp/core/MetricRow';

type Props = { payload: any };

export default function RiskGeometryCard({ payload }: Props) {
  const candidate = payload?.evidence?.optionsCandidate;
  return (
    <Card>
      <CardHeader title="Risk Geometry" />
      <div className="space-y-2">
        <MetricRow label="Max Gain" value={candidate?.maxGain ? `${candidate.maxGain}` : '—'} />
        <MetricRow label="Max Loss" value={candidate?.maxLoss ? `${candidate.maxLoss}` : '—'} />
        <MetricRow label="R Multiple" value={candidate?.maxGain && candidate?.maxLoss ? `${(candidate.maxGain / Math.max(0.0001, candidate.maxLoss)).toFixed(2)}R` : '—'} />
      </div>
    </Card>
  );
}
