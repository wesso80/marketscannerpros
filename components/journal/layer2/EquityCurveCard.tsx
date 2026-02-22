import { EquityCurveModel } from '@/types/journal';

type EquityCurveCardProps = {
  equityCurve?: EquityCurveModel;
};

export default function EquityCurveCard({ equityCurve }: EquityCurveCardProps) {
  const points = equityCurve?.points || [];
  const latest = points[points.length - 1]?.value || 0;
  const peak = points.length ? Math.max(...points.map((p) => p.value)) : 0;
  const trough = points.length ? Math.min(...points.map((p) => p.value)) : 0;
  const range = peak - trough || 1;

  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-100">Equity Curve</div>
        <span className="text-[10px] text-slate-500">{points.length} closed trades</span>
      </div>

      <div className={`mt-2 text-lg font-semibold ${latest >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
        {latest >= 0 ? '+' : ''}{latest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
      </div>

      {/* Mini sparkline bar */}
      {points.length > 1 && (
        <div className="mt-3 flex h-10 items-end gap-[2px]">
          {points.slice(-20).map((point, i) => {
            const height = Math.max(4, ((point.value - trough) / range) * 100);
            return (
              <div
                key={`${point.ts}_${i}`}
                className={`flex-1 rounded-t-sm ${point.value >= 0 ? 'bg-emerald-500/60' : 'bg-rose-500/60'}`}
                style={{ height: `${height}%` }}
                title={`${new Date(point.ts).toLocaleDateString()}: $${point.value.toFixed(2)}`}
              />
            );
          })}
        </div>
      )}

      {/* Recent points */}
      <div className="mt-3 space-y-1">
        {points.slice(-6).map((point, idx) => (
          <div key={`${point.ts}_${point.value}_${idx}`} className="flex items-center justify-between rounded bg-white/5 px-2 py-1 text-xs text-slate-300">
            <span>{new Date(point.ts).toLocaleDateString()}</span>
            <span className={point.value >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
              {point.value >= 0 ? '+' : ''}{point.value.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
