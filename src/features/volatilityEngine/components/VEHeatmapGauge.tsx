'use client';

import type { VolatilityState } from '@/src/features/volatilityEngine/types';

const ZONES = [
  { max: 15, label: 'COMPRESSION', color: '#1E3A5F', text: '#60A5FA' },
  { max: 70, label: 'NEUTRAL',     color: '#475569', text: '#94A3B8' },
  { max: 90, label: 'EXPANSION',   color: '#D97706', text: '#FBBF24' },
  { max: 100, label: 'CLIMAX',     color: '#DC2626', text: '#F87171' },
] as const;

function getZone(bbwp: number) {
  return ZONES.find(z => bbwp <= z.max) ?? ZONES[ZONES.length - 1];
}

function regimeColor(regime: string): string {
  switch (regime) {
    case 'compression': return '#60A5FA';
    case 'expansion': return '#FBBF24';
    case 'climax': return '#F87171';
    case 'transition': return '#A78BFA';
    default: return '#94A3B8';
  }
}

export default function VEHeatmapGauge({ vol }: { vol: VolatilityState }) {
  const bbwp = vol.bbwp;
  const zone = getZone(bbwp);

  // SVG semicircle gauge — identical geometry to GE gauge
  const radius = 72;
  const stroke = 10;
  const cx = 90;
  const cy = 85;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-base">🌡️</span>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
          BBWP Gauge
        </h3>
      </div>

      <div className="flex flex-col items-center">
        {/* Semicircle gauge */}
        <svg viewBox="0 0 180 100" className="h-auto w-full max-w-[220px]">
          {/* Background arc */}
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          {/* Zone color segments */}
          {ZONES.map((z, i) => {
            const start = i === 0 ? 0 : ZONES[i - 1].max;
            const x1 = cx - radius * Math.cos(Math.PI - (start / 100) * Math.PI);
            const y1 = cy - radius * Math.sin(Math.PI - (start / 100) * Math.PI);
            const x2 = cx - radius * Math.cos(Math.PI - (z.max / 100) * Math.PI);
            const y2 = cy - radius * Math.sin(Math.PI - (z.max / 100) * Math.PI);
            const largeArc = (z.max - start) > 50 ? 1 : 0;
            return (
              <path
                key={z.label}
                d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`}
                fill="none"
                stroke={z.color}
                strokeWidth={stroke}
                strokeLinecap="butt"
                opacity={0.5}
              />
            );
          })}
          {/* Needle */}
          {(() => {
            const angle = Math.PI * (1 - bbwp / 100);
            const needleLen = radius - stroke;
            const nx = cx - needleLen * Math.cos(angle);
            const ny = cy - needleLen * Math.sin(angle);
            return (
              <line
                x1={cx} y1={cy} x2={nx} y2={ny}
                stroke={zone.text}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            );
          })()}
          {/* Center dot */}
          <circle cx={cx} cy={cy} r={4} fill={zone.text} />
        </svg>

        {/* BBWP value */}
        <div className="-mt-2 text-center">
          <span className="text-2xl font-black sm:text-3xl" style={{ color: zone.text }}>
            {bbwp.toFixed(1)}
          </span>
          <span className="ml-1 text-[0.65rem] text-white/40">BBWP</span>
        </div>

        {/* Regime label */}
        <div
          className="mt-1 rounded-full px-3 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest"
          style={{ background: regimeColor(vol.regime) + '33', color: regimeColor(vol.regime) }}
        >
          {vol.regime.toUpperCase()}
        </div>

        {/* Stats */}
        <div className="mt-2 space-y-0.5 text-center text-[0.7rem] text-white/50">
          <div>SMA5: <span className="font-semibold text-white/70">{vol.bbwpSma5.toFixed(1)}</span></div>
          <div>
            Rate: <span className="font-semibold text-white/70">{vol.rateSmoothed > 0 ? '+' : ''}{vol.rateSmoothed.toFixed(1)}</span>{' '}
            <span className="text-white/40">({vol.rateDirection})</span>
          </div>
          <div>
            Squeeze: <span className={`font-semibold ${vol.inSqueeze ? 'text-amber-400' : 'text-white/60'}`}>
              {vol.inSqueeze ? `Active (${vol.squeezeStrength.toFixed(2)})` : 'None'}
            </span>
          </div>
          {vol.extremeAlert && (
            <div className={`font-semibold ${vol.extremeAlert === 'low' ? 'text-blue-400' : 'text-red-400'}`}>
              {vol.extremeAlert === 'low' ? '❄️ Extreme Low' : '🔥 Extreme High'}
            </div>
          )}
          <div>Confidence: <span className="font-semibold text-white/70">{vol.regimeConfidence.toFixed(0)}%</span></div>
        </div>
      </div>
    </div>
  );
}
