type ScoreTone = 'context' | 'setup' | 'execution';

export type ScoreBadgeProps = {
  label: string;
  score: number;
  tone?: ScoreTone;
};

const toneClass: Record<ScoreTone, string> = {
  context: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  setup: 'border-teal-500/40 bg-teal-500/10 text-teal-200',
  execution: 'border-purple-500/40 bg-purple-500/10 text-purple-200',
};

export default function ScoreBadge({ label, score, tone = 'context' }: ScoreBadgeProps) {
  return (
    <div className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${toneClass[tone]}`}>
      {label}: {Math.max(0, Math.min(100, Math.round(score)))}
    </div>
  );
}
