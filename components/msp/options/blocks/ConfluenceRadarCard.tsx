import Card from '@/components/msp/core/Card';
import CardHeader from '@/components/msp/core/CardHeader';

type Props = { payload: any };

export default function ConfluenceRadarCard({ payload }: Props) {
  const features = payload?.features?.setup || {};
  const points = [
    { label: 'Directional', value: features.directionalAgreement ?? 0 },
    { label: 'EM Fit', value: features.emBufferFit ?? 0 },
    { label: 'IV Fit', value: payload?.features?.context?.volFit ?? 0 },
    { label: 'Multi-TF', value: features.tfConfluenceScore ?? 0 },
    { label: 'Flow', value: features.pWinProxy ?? 0 },
  ];

  return (
    <Card>
      <CardHeader title="Confluence Radar" subtitle="Setup-weighted axes" />
      <div className="space-y-2 text-xs text-[var(--msp-muted)]">
        {points.map((point) => (
          <div key={point.label} className="flex items-center gap-2">
            <span className="w-24">{point.label}</span>
            <div className="h-2 flex-1 rounded-full bg-[var(--msp-panel-2)]">
              <div className="h-2 rounded-full bg-[var(--msp-accent)]" style={{ width: `${Math.max(0, Math.min(100, Math.round(Number(point.value || 0) * 100)))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
