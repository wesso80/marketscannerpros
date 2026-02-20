import Card from '@/components/msp/core/Card';
import CardHeader from '@/components/msp/core/CardHeader';

type Props = { payload: any };

export default function StrikeMatrixTable({ payload }: Props) {
  const legs = payload?.evidence?.optionsCandidate?.legs || [];
  return (
    <Card>
      <CardHeader title="Strike Matrix" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="text-[var(--msp-muted)]">
            <tr>
              <th className="py-2">Strike</th>
              <th>OI</th>
              <th>Volume</th>
              <th>IV</th>
              <th>Delta</th>
              <th>Spread%</th>
            </tr>
          </thead>
          <tbody className="text-[var(--msp-text)]">
            {legs.length === 0 && (
              <tr><td className="py-2" colSpan={6}>No candidate legs</td></tr>
            )}
            {legs.map((leg: any, idx: number) => (
              <tr key={idx} className="border-t border-[var(--msp-border)]">
                <td className="py-2">{leg.strike}</td>
                <td>{leg.openInterest ?? '—'}</td>
                <td>{leg.volume ?? '—'}</td>
                <td>{leg.iv ?? '—'}</td>
                <td>{leg.delta ?? '—'}</td>
                <td>{leg.bid && leg.ask && leg.mid ? (((leg.ask - leg.bid) / leg.mid) * 100).toFixed(2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
