import Card from '@/components/msp/core/Card';
import CardHeader from '@/components/msp/core/CardHeader';
import MetricRow from '@/components/msp/core/MetricRow';

type Props = { payload: any };

export default function TimeWindowCard({ payload }: Props) {
  return (
    <Card>
      <CardHeader title="Time Window Status" />
      <div className="space-y-2">
        <MetricRow label="Permission" value={(payload?.timeGate?.permission || 'WAIT').toUpperCase()} />
        <MetricRow label="Time Quality" value={payload?.timeGate?.quality !== undefined ? `${payload.timeGate.quality}%` : '—'} />
        <MetricRow label="Time Fit" value={payload?.scores?.timeWindowFit !== undefined ? Number(payload.scores.timeWindowFit).toFixed(2) : '—'} />
      </div>
    </Card>
  );
}
