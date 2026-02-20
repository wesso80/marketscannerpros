import { EquityCurveModel } from '@/types/journal';

type EquityCurveCardProps = {
  equityCurve?: EquityCurveModel;
};

export default function EquityCurveCard({ equityCurve }: EquityCurveCardProps) {
  const points = equityCurve?.points || [];
  const latest = points[points.length - 1]?.value || 0;

  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4">
      <div className="text-sm font-semibold text-slate-100">Equity Curve</div>
      <div className="mt-2 text-xs text-slate-400">{points.length} points</div>
      <div className="mt-2 text-lg font-semibold text-slate-100">${latest.toFixed(2)}</div>
      <div className="mt-3 space-y-1">
        {points.slice(-6).map((point) => (
          <div key={`${point.ts}_${point.value}`} className="flex items-center justify-between rounded bg-white/5 px-2 py-1 text-xs text-slate-300">
            <span>{new Date(point.ts).toLocaleDateString()}</span>
            <span>${point.value.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
