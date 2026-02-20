import Card from '@/components/msp/core/Card';
import CardHeader from '@/components/msp/core/CardHeader';
import MetricRow from '@/components/msp/core/MetricRow';

type Props = { payload: any };

export default function LiquidityFillCard({ payload }: Props) {
  return (
    <Card>
      <CardHeader title="Liquidity + Fill" />
      <div className="space-y-2">
        <MetricRow label="Spread Liquidity" value={payload?.features?.execution?.spreadLiquidity !== undefined ? payload.features.execution.spreadLiquidity.toFixed(2) : '—'} />
        <MetricRow label="Fill Quality" value={payload?.features?.execution?.fillQuality !== undefined ? payload.features.execution.fillQuality.toFixed(2) : '—'} />
      </div>
    </Card>
  );
}
