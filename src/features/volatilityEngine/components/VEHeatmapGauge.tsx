'use client';

import type { VolatilityState } from '@/src/features/volatilityEngine/types';

const ZONES: { min: number; max: number; color: string; label: string }[] = [
  { min: 0, max: 15, color: '#1E3A5F', label: 'Compression' },
  { min: 15, max: 70, color: '#475569', label: 'Neutral' },
  { min: 70, max: 90, color: '#D97706', label: 'Expansion' },
  { min: 90, max: 100, color: '#DC2626', label: 'Climax' },
];

function regimeColor(regime: string): string {
  switch (regime) {
    case 'compression': return '#3B82F6';
    case 'expansion': return '#D97706';
    case 'climax': return '#DC2626';
    case 'transition': return '#8B5CF6';
    default: return '#64748B';
  }
}

export default function VEHeatmapGauge({ vol }: { vol: VolatilityState }) {
  const bbwp = vol.bbwp;
  const angle = -90 + (bbwp / 100) * 180;
  const R = 80;
  const CX = 90;
  const CY = 90;

  function arc(startPct: number, endPct: number) {
    const s = (-90 + (startPct / 100) * 180) * (Math.PI / 180);
    const e = (-90 + (endPct / 100) * 180) * (Math.PI / 180);
    const x1 = CX + R * Math.cos(s);
    const y1 = CY + R * Math.sin(s);
    const x2 = CX + R * Math.cos(e);
    const y2 = CY + R * Math.sin(e);
    const large = endPct - startPct > 50 ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
  }

  const needleRad = angle * (Math.PI / 180);
  const nx = CX + (R - 12) * Math.cos(needleRad);
  const ny = CY + (R - 12) * Math.sin(needleRad);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-base">🌡️</span>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
          BBWP Gauge
        </h3>
      </div>

      <div className="flex flex-col items-center">
        {/* Semicircle gauge */}
        <svg viewBox="0 0 180 100" className="h-auto w-full max-w-[220px]">
          {ZONES.map((z) => (
            <path
              key={z.label}
              d={arc(z.min, z.max)}
              fill="none"
              stroke={z.color}
              strokeWidth={10}
              strokeLinecap="butt"
              opacity={0.6}
            />
          ))}
          <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#FFF" strokeWidth={2} strokeLinecap="round" />
          <circle cx={CX} cy={CY} r={3} fill="#FFF" />
        </svg>

        {/* BBWP value */}
        <div className="-mt-2 text-center">
          <span className="text-3xl font-black text-white">{bbwp.toFixed(1)}</span>
          <span className="ml-1 text-xs text-white/40">BBWP</span>
        </div>

        {/* Regime label */}
        <div
          className="mt-1 rounded-full px-3 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest"
          style={{ background: regimeColor(vol.regime) + '33', color: regimeColor(vol.regime) }}
        >
          {vol.regime.toUpperCase()}
        </div>

        {/* Stats */}
        <div className="mt-3 space-y-1 text-center text-[0.72rem]">
          <div className="text-white/50">
            SMA5: <span className="font-bold text-white/80">{vol.bbwpSma5.toFixed(1)}</span>
          </div>
          <div className="text-white/50">
            Rate: <span className="font-bold text-white/80">{vol.rateSmoothed > 0 ? '+' : ''}{vol.rateSmoothed.toFixed(1)}</span>{' '}
            <span className="text-white/40">({vol.rateDirection})</span>
          </div>
          <div className="text-white/50">
            Squeeze: <span className={`font-bold ${vol.inSqueeze ? 'text-amber-400' : 'text-white/60'}`}>
              {vol.inSqueeze ? `Active (${vol.squeezeStrength.toFixed(2)})` : 'None'}
            </span>
          </div>
          {vol.extremeAlert && (
            <div className={`font-bold ${vol.extremeAlert === 'low' ? 'text-blue-400' : 'text-red-400'}`}>
              {vol.extremeAlert === 'low' ? '❄️ Extreme Low' : '🔥 Extreme High'}
            </div>
          )}
          <div className="text-white/50">
            Confidence: <span className="font-bold text-white/80">{vol.regimeConfidence.toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
