'use client';

import type { BreakoutReadiness } from '@/src/features/volatilityEngine/types';

function scoreColor(score: number): string {
  if (score >= 60) return '#10B981';
  if (score >= 40) return '#D97706';
  return '#EF4444';
}

const BARS: { key: keyof BreakoutReadiness['components']; label: string; max: number; color: string }[] = [
  { key: 'volCompression', label: 'Vol Compression', max: 40, color: '#3B82F6' },
  { key: 'timeAlignment', label: 'Time Alignment', max: 30, color: '#8B5CF6' },
  { key: 'gammaWall', label: 'Gamma Wall', max: 20, color: '#F59E0B' },
  { key: 'adxRising', label: 'ADX Rising', max: 10, color: '#10B981' },
];

// Map missing data sources to which breakout component keys become N/A
const MISSING_MAP: Record<string, string[]> = {
  options: ['gammaWall'],
  time: ['timeAlignment'],
};

export default function VEBreakoutPanel({ breakout, missingInputs = [] }: { breakout: BreakoutReadiness; missingInputs?: string[] }) {
  const total = breakout.score;
  const color = scoreColor(total);

  // Breakout probability: sigmoid-based mapping from score
  // Score 0 → ~10%, Score 50 → ~50%, Score 100 → ~90%
  const probability = Math.min(95, Math.max(5, 10 + (total * 0.85)));
  const probColor = probability >= 60 ? '#10B981' : probability >= 35 ? '#D97706' : '#EF4444';

  // Build set of component keys that are N/A due to missing inputs
  const naKeys = new Set<string>();
  for (const m of missingInputs) {
    for (const key of (MISSING_MAP[m] ?? [])) naKeys.add(key);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🎯</span>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Breakout Readiness
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xl font-black" style={{ color }}>{total.toFixed(0)}</span>
            <span className="text-[0.6rem] text-white/30">/100</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase" style={{ background: color + '22', color }}>
              {breakout.label}
            </span>
            <span className="mt-0.5 text-[0.6rem] font-semibold" style={{ color: probColor }}>
              {probability.toFixed(0)}% prob
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        {BARS.map(({ key, label, max, color: barColor }) => {
          const value = breakout.components[key];
          const isNA = naKeys.has(key) && value === 0;
          const pct = isNA ? 0 : max > 0 ? Math.min(100, (value / max) * 100) : 0;
          return (
            <div key={key} className="space-y-0.5">
              <div className="flex items-center justify-between text-[0.65rem]">
                <span className={isNA ? 'text-white/25' : 'text-white/60'}>{label}</span>
                {isNA ? (
                  <span className="text-[0.6rem] text-white/20">N/A</span>
                ) : (
                  <span className="font-semibold text-white/80">{value.toFixed(0)}/{max}</span>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                {!isNA && (
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {breakout.componentDetails.length > 0 && (
        <div className="mt-3 space-y-0.5 border-t border-white/10 pt-2">
          {breakout.componentDetails.slice(0, 3).map((d, i) => (
            <p key={i} className="text-[0.6rem] text-white/40">{d}</p>
          ))}
        </div>
      )}
    </div>
  );
}
