import Card from '@/components/msp/core/Card';
import CardHeader from '@/components/msp/core/CardHeader';
import MetricRow from '@/components/msp/core/MetricRow';

type Props = { payload: any };

export default function MacroFlowCard({ payload }: Props) {
  return (
    <Card className="h-full">
      <CardHeader title="Macro & Flow Context" />
      <div className="space-y-2">
        <MetricRow label="Risk Mode" value={(payload?.context?.riskMode || 'neutral').toUpperCase()} />
        <MetricRow label="Breadth" value={payload?.context?.breadth || 'Mixed'} />
        <MetricRow label="Sector Bias" value={payload?.context?.sectorBias || 'Neutral'} />
        <MetricRow label="VIX State" value={payload?.context?.vixState || 'N/A'} />
      </div>
    </Card>
  );
}
