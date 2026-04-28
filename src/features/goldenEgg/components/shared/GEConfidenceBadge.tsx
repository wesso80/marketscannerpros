import { PublicAssessment } from '@/src/features/goldenEgg/types';

type GEConfidenceBadgeProps = {
  confidence: number;
  grade: 'A' | 'B' | 'C' | 'D';
  assessment: PublicAssessment;
};

export default function GEConfidenceBadge({ confidence, grade, assessment }: GEConfidenceBadgeProps) {
  const tone =
    assessment === 'ALIGNED'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : assessment === 'WATCH'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-rose-500/30 bg-rose-500/10 text-rose-200';

  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="text-xs uppercase tracking-wide">Confluence</div>
      <div className="text-2xl font-semibold">{confidence}%</div>
      <div className="text-sm">Grade {grade}</div>
    </div>
  );
}
