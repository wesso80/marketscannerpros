import Card from '@/components/msp/core/Card';
import CardHeader from '@/components/msp/core/CardHeader';

type Props = { payload: any };

const rows = ['Trend', 'Momentum', 'Flow', 'Structure', 'TF Sync'];

export default function StructureAlignmentCard({ payload }: Props) {
  const strength = payload?.scores?.tfConfluenceScore ?? 0;
  return (
    <Card>
      <CardHeader title="Structure Alignment" subtitle="Directional + multi-TF validation" />
      <div className="space-y-1.5 text-sm">
        {rows.map((row, idx) => {
          const ok = strength >= 45 + idx * 5;
          return (
            <div key={row} className="flex items-center justify-between rounded-md bg-[var(--msp-panel-2)] px-3 py-1.5">
              <span className="text-[var(--msp-muted)]">{row}</span>
              <span className={ok ? 'text-emerald-300' : 'text-amber-300'}>{ok ? '✔' : '✖'}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
