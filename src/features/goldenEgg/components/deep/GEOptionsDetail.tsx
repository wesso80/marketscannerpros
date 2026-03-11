import type { DeepAnalysisData } from '@/src/features/goldenEgg/types';

type Props = { options: NonNullable<DeepAnalysisData['optionsData']> };

function sentimentColor(s: string) {
  if (s.toLowerCase().includes('bullish')) return 'text-emerald-400';
  if (s.toLowerCase().includes('bearish')) return 'text-rose-400';
  return 'text-amber-300';
}

export default function GEOptionsDetail({ options }: Props) {
  const stats = [
    { label: 'Put/Call Ratio', value: options.putCallRatio.toFixed(2) },
    { label: 'Max Pain', value: `$${options.maxPain.toFixed(2)}` },
    { label: 'Avg IV', value: `${(options.avgIV * 100).toFixed(1)}%` },
    { label: 'IV Rank', value: `${options.ivRank.toFixed(0)}%` },
    { label: 'Total Call OI', value: options.totalCallOI.toLocaleString() },
    { label: 'Total Put OI', value: options.totalPutOI.toLocaleString() },
  ];

  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400">
            Options Flow {options.expiryDate ? `(${options.expiryDate})` : ''}
          </h2>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${sentimentColor(options.sentiment)}`}>
          {options.sentiment}
        </span>
      </div>

      {/* Stat pills */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{s.label}</div>
            <div className="text-sm font-semibold text-white">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Highest OI call & put */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {options.highestOICall && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-400">Highest OI Call</div>
            <div className="text-lg font-bold text-white">${options.highestOICall.strike.toFixed(2)}</div>
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
              <span>OI: <span className="text-white">{options.highestOICall.openInterest.toLocaleString()}</span></span>
              <span>Vol: <span className="text-white">{options.highestOICall.volume.toLocaleString()}</span></span>
              <span>IV: <span className="text-white">{(options.highestOICall.iv * 100).toFixed(1)}%</span></span>
              {options.highestOICall.delta != null && (
                <span>Δ: <span className="text-white">{options.highestOICall.delta.toFixed(3)}</span></span>
              )}
              {options.highestOICall.gamma != null && (
                <span>Γ: <span className="text-white">{options.highestOICall.gamma.toFixed(4)}</span></span>
              )}
              {options.highestOICall.theta != null && (
                <span>Θ: <span className="text-white">{options.highestOICall.theta.toFixed(3)}</span></span>
              )}
            </div>
          </div>
        )}

        {options.highestOIPut && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-400">Highest OI Put</div>
            <div className="text-lg font-bold text-white">${options.highestOIPut.strike.toFixed(2)}</div>
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
              <span>OI: <span className="text-white">{options.highestOIPut.openInterest.toLocaleString()}</span></span>
              <span>Vol: <span className="text-white">{options.highestOIPut.volume.toLocaleString()}</span></span>
              <span>IV: <span className="text-white">{(options.highestOIPut.iv * 100).toFixed(1)}%</span></span>
              {options.highestOIPut.delta != null && (
                <span>Δ: <span className="text-white">{options.highestOIPut.delta.toFixed(3)}</span></span>
              )}
              {options.highestOIPut.gamma != null && (
                <span>Γ: <span className="text-white">{options.highestOIPut.gamma.toFixed(4)}</span></span>
              )}
              {options.highestOIPut.theta != null && (
                <span>Θ: <span className="text-white">{options.highestOIPut.theta.toFixed(3)}</span></span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Unusual activity */}
      {options.unusualActivity && options.unusualActivity.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Unusual Activity</div>
          <ul className="space-y-1 text-sm text-amber-300">
            {options.unusualActivity.map((item, i) => (
              <li key={i}>⚡ {item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
