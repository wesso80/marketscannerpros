import { SetupModel } from '@/types/optionsScanner';

type SetupCardProps = {
  setup: SetupModel;
  compact?: boolean;
};

type RowStatus = 'ok' | 'warn' | 'fail';

function scoreFromText(value: string, fallback: number) {
  const numbers = String(value || '').match(/\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length === 0) return fallback;
  if (String(value).includes('/')) {
    const first = Number(numbers[0]);
    const second = Number(numbers[1] || 0);
    if (second > 0) {
      return Math.max(1, Math.min(99, Math.round((first / second) * 100)));
    }
  }
  const n = Number(numbers[0]);
  return Math.max(1, Math.min(99, Math.round(n)));
}

function statusFromScore(score: number): RowStatus {
  if (score >= 70) return 'ok';
  if (score >= 45) return 'warn';
  return 'fail';
}

function statusDot(status: RowStatus) {
  if (status === 'ok') return 'bg-emerald-400';
  if (status === 'warn') return 'bg-amber-400';
  return 'bg-rose-400';
}

function ConfluenceRow({ label, score, status }: { label: string; score: number; status: RowStatus }) {
  return (
    <div className="grid grid-cols-[1.2fr_2fr_56px_20px] items-center gap-2.5">
      <div className="text-xs text-slate-300">{label}</div>
      <div className="h-2.5 w-full rounded-full bg-slate-800">
        <div className="h-2.5 rounded-full bg-slate-500" style={{ width: `${score}%` }} />
      </div>
      <div className="text-right text-xs font-semibold text-slate-200">{score}%</div>
      <div className="flex justify-end">
        <div className={`h-2.5 w-2.5 rounded-full ${statusDot(status)}`} />
      </div>
    </div>
  );
}

export default function SetupCard({ setup, compact = false }: SetupCardProps) {
  const rows = [
    { label: 'Trend Alignment', score: scoreFromText(setup.timeframeAlignment, 62) },
    { label: 'Flow Strength', score: scoreFromText(setup.optionsRegime, 58) },
    { label: 'Liquidity + Greeks', score: scoreFromText(setup.volRegime, 55) },
    { label: 'IV Context', score: scoreFromText(setup.volRegime, 48) },
  ].map((row) => ({ ...row, status: statusFromScore(row.score) }));

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/25 p-3">
      <div className="space-y-3">
        {rows.map((row) => (
          <ConfluenceRow key={row.label} label={row.label} score={row.score} status={row.status} />
        ))}
      </div>
      {!compact && (
        <div className="mt-3 text-xs text-slate-500">
          Setup {setup.setupType} • Invalidation: {setup.invalidation}
        </div>
      )}
    </div>
  );
}
