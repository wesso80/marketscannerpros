import Card from '@/components/msp/core/Card';
import CardHeader from '@/components/msp/core/CardHeader';
import MetricRow from '@/components/msp/core/MetricRow';

type Props = { payload: any };

export default function StrategyBuilderCard({ payload }: Props) {
  const candidate = payload?.evidence?.optionsCandidate;
  return (
    <Card>
      <CardHeader title="Strategy Builder" />
      <div className="space-y-2">
        <MetricRow label="Strategy" value={candidate?.strategyType || 'CALL'} />
        <MetricRow label="Debit/Credit" value={candidate?.debit ? `Debit ${candidate.debit}` : candidate?.credit ? `Credit ${candidate.credit}` : '—'} />
        <MetricRow label="Breakeven" value={candidate?.breakeven ? `${candidate.breakeven}` : '—'} />
      </div>
    </Card>
  );
}
