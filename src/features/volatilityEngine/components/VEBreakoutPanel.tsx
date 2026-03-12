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

export default function VEBreakoutPanel({ breakout }: { breakout: BreakoutReadiness }) {
  const total = breakout.score;
  const color = scoreColor(total);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🎯</span>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Breakout Readiness
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl font-black" style={{ color }}>{total.toFixed(0)}</span>
          <span className="rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase" style={{ background: color + '22', color }}>
            {breakout.label}
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        {BARS.map(({ key, label, max, color: barColor }) => {
          const value = breakout.components[key];
          const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
          return (
            <div key={key} className="space-y-0.5">
              <div className="flex items-center justify-between text-[0.65rem]">
                <span className="text-white/60">{label}</span>
                <span className="font-semibold text-white/80">{value.toFixed(0)}/{max}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
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
