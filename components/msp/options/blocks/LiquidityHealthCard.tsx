import CardHeader from '@/components/msp/core/CardHeader';
import MetricRow from '@/components/msp/core/MetricRow';

type Props = { payload: any };

export default function LiquidityHealthCard({ payload }: Props) {
  const liq = payload?.features?.context?.liquidityHealth;
  return (
    <div className="rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-4">
      <CardHeader title="Liquidity Health" />
      <div className="space-y-1.5">
        <MetricRow label="Chain Depth" value={liq !== undefined ? liq.toFixed(2) : '—'} />
        <MetricRow label="Spread Env" value={payload?.execution?.spreadState || 'Moderate'} />
      </div>
    </div>
  );
}
