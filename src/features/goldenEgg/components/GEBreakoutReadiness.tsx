'use client';

import type { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type VolatilityData = GoldenEggPayload['layer3']['structure']['volatility'];

function scoreLabel(score: number): { text: string; color: string } {
  if (score >= 60) return { text: 'HIGH', color: '#10B981' };
  if (score >= 40) return { text: 'MODERATE', color: '#D97706' };
  return { text: 'LOW', color: '#EF4444' };
}

interface BarProps {
  label: string;
  value: number;
  max: number;
  color: string;
}

function ReadinessBar({ label, value, max, color }: BarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[0.68rem]">
        <span className="text-white/60">{label}</span>
        <span className="font-semibold text-white/80">{value.toFixed(0)}/{max}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default function GEBreakoutReadiness({ volatility }: { volatility: VolatilityData }) {
  if (volatility.breakoutScore == null) return null;

  const total = volatility.breakoutScore;
  const { text, color } = scoreLabel(total);

  // Use real component breakdown from DVE engine if available, otherwise estimate
  const comps = volatility.breakoutComponents;
  const volComp = comps?.volCompression ?? Math.min(40, total * 0.4);
  const timeAlign = comps?.timeAlignment ?? Math.min(30, total * 0.3);
  const gammaWall = comps?.gammaWall ?? Math.min(20, total * 0.2);
  const adxRising = comps?.adxRising ?? Math.min(10, total * 0.1);

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
          <span className="text-xl font-black" style={{ color }}>
            {total.toFixed(0)}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase"
            style={{ background: color + '22', color }}
          >
            {text}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <ReadinessBar label="Vol Compression" value={volComp} max={40} color="#3B82F6" />
        <ReadinessBar label="Time Alignment" value={timeAlign} max={30} color="#8B5CF6" />
        <ReadinessBar label="Gamma Wall" value={gammaWall} max={20} color="#F59E0B" />
        <ReadinessBar label="ADX Rising" value={adxRising} max={10} color="#10B981" />
      </div>

      {volatility.breakoutComponentDetails && volatility.breakoutComponentDetails.length > 0 && (
        <div className="mt-3 space-y-0.5 border-t border-white/10 pt-2">
          {volatility.breakoutComponentDetails.slice(0, 3).map((d, i) => (
            <p key={i} className="text-[0.6rem] text-white/40">{d}</p>
          ))}
        </div>
      )}
    </div>
  );
}
