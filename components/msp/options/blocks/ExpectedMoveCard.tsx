import Card from '@/components/msp/core/Card';
import CardHeader from '@/components/msp/core/CardHeader';
import MetricRow from '@/components/msp/core/MetricRow';

type Props = { payload: any };

export default function ExpectedMoveCard({ payload }: Props) {
  return (
    <Card>
      <CardHeader title="Expected Move Analysis" />
      <div className="space-y-2">
        <MetricRow label="Expected Move %" value={payload?.evidence?.optionsCandidate?.expectedMovePct ? `${Number(payload.evidence.optionsCandidate.expectedMovePct).toFixed(2)}%` : '—'} />
        <MetricRow label="Breakeven Dist" value={payload?.features?.setup?.emBufferFit !== undefined ? `${Math.round(payload.features.setup.emBufferFit * 100)}% fit` : '—'} />
      </div>
    </Card>
  );
}
