import GESectionHeader from '@/src/features/goldenEgg/components/shared/GESectionHeader';
import { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type GEScoreBreakdownMiniProps = {
  rows: GoldenEggPayload['layer1']['scoreBreakdown'];
};

export default function GEScoreBreakdownMini({ rows }: GEScoreBreakdownMiniProps) {
  return (
    <div className="mt-3">
      <GESectionHeader title="Signal Breakdown" />
      <div className="mt-2 space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
            <div className="flex items-center justify-between text-sm text-slate-200">
              <span>{row.key}</span>
              <span>{row.value}/100 · {row.weight}%</span>
            </div>
            {row.note && <div className="mt-1 text-xs text-slate-400">{row.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
