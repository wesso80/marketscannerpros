import { DecompositionTFRow, Direction } from '@/components/time/types';
import { pct } from '@/components/time/scoring';

type DecompositionMatrixProps = {
  rows: DecompositionTFRow[];
  primaryDirection: Direction;
};

export default function DecompositionMatrix({ rows, primaryDirection }: DecompositionMatrixProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/2 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Decomposition Alignment Matrix</div>
        <div className="text-xs text-slate-400">Primary: {primaryDirection}</div>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/5">
        <div className="grid grid-cols-5 gap-0 bg-white/5 px-3 py-2 text-xs text-slate-300">
          <div>TF</div>
          <div>State</div>
          <div>Bias</div>
          <div>Strength</div>
          <div>Aligned</div>
        </div>

        {rows.map((row) => (
          <div key={row.tfLabel} className="grid grid-cols-5 gap-0 px-3 py-2 text-xs text-slate-200">
            <div className="font-semibold">{row.tfLabel}</div>
            <div className="text-slate-300">{row.state}</div>
            <div className="text-slate-200">{row.closeBias}</div>
            <div className="text-slate-200">{pct(row.strength)}%</div>
            <div>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${
                  row.alignedToPrimary
                    ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/25'
                    : 'bg-rose-500/15 text-rose-200 ring-rose-500/25'
                }`}
              >
                {row.alignedToPrimary ? 'YES' : 'NO'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
