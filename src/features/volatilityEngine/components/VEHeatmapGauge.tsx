'use client';
import { volatilityText } from '../displayText';
import { volatilityBadgeLabel } from '@/lib/presentation/volatilityLayerLabel';

import type { PublicVolatility as VolatilityState } from '@/src/features/volatilityEngine/types';
import { bbwpDisplay } from '@/lib/research/volatilityDescriptions';

const ZONES = [
  { max: 15, label: 'COMPRESSION', color: 'var(--msp-panel)', text: 'var(--msp-text-muted)' },
  { max: 70, label: 'NEUTRAL',     color: 'var(--msp-text-muted)', text: 'var(--msp-flat)' },
  { max: 90, label: 'EXPANSION',   color: 'var(--msp-warn)', text: 'var(--msp-warn)' },
  { max: 100, label: 'CLIMAX',     color: 'var(--msp-bear)', text: 'var(--msp-bear)' },
] as const;

function getZone(bbwp: number) {
  return ZONES.find(z => bbwp <= z.max) ?? ZONES[ZONES.length - 1];
}

function regimeColor(regime: string | null): string {
  switch (regime) {
    case 'compression': return 'var(--msp-text-muted)';
    case 'expansion': return 'var(--msp-warn)';
    case 'climax': return 'var(--msp-bear)';
    case 'transition': return '#94A3B8';
    default: return 'var(--msp-flat)';
  }
}

export default function VEHeatmapGauge({ vol }: { vol: VolatilityState }) {
  const bbwp = vol.bbwp;
  const shown = bbwpDisplay(vol);
  const zone = bbwp == null ? { label: 'NOT AVAILABLE', color: 'var(--msp-panel)', text: 'var(--msp-text-muted)' } : getZone(bbwp);

  // SVG semicircle gauge — identical geometry to GE gauge
  const radius = 72;
  const stroke = 10;
  const cx = 90;
  const cy = 85;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
      <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
        <span className="shrink-0 whitespace-nowrap rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[0.62rem] font-semibold text-amber-300">{volatilityBadgeLabel('VOL')}</span>
        <h3 className="text-xs font-semibold tracking-widest text-amber-400">
          BBWP Gauge
        </h3>
      </div>

      <div className="flex flex-col items-center">
        {/* Semicircle gauge */}
        <svg viewBox="0 0 180 100" className="h-auto w-full max-w-[160px]">
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
          {/* Needle (none when BBWP could not be computed; the public reading has it as null) */}
          {bbwp != null && (() => {
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
        <div className="-mt-1 text-center">
          <span className="text-lg font-black sm:text-xl" style={{ color: shown.value != null ? zone.text : undefined }}>
            {shown.value ?? 'Not available'}
          </span>
          <span className="ml-1 text-[11px] text-white/40">BBWP</span>
        </div>

        {/* Regime label */}
        <div
          className="mt-1 rounded-full px-3 py-0.5 text-[0.65rem] font-bold tracking-widest"
          style={{ background: regimeColor(vol.regime) + '33', color: regimeColor(vol.regime) }}
        >
          {vol.regime ? volatilityText(vol.regime) : 'Regime not available'}
        </div>

        {/* Stats */}
        <div className="mt-2 space-y-0.5 text-center text-[0.7rem] text-white/50">
          <div>5-bar mean: <span className="font-semibold text-white/70">{vol.bbwpSma5 == null ? 'not available' : vol.bbwpSma5.toFixed(1)}</span></div>
          <div>
            Rate: {vol.rateSmoothed == null ? <span className="font-semibold text-white/70">not available</span> : <><span className="font-semibold text-white/70">{vol.rateSmoothed > 0 ? '+' : ''}{vol.rateSmoothed.toFixed(1)}</span>{' '}
            <span className="text-white/40">({vol.rateDirection})</span></>}
          </div>
          <div title={vol.squeeze.definition}>
            Squeeze: <span className="font-semibold text-white/70">
              {vol.squeeze.inSqueeze === null ? 'not collected' : vol.squeeze.inSqueeze ? 'present' : 'not present'}
            </span>
          </div>
          {vol.extremeAlert && (
            <div className={`font-semibold ${vol.extremeAlert === 'low' ? 'text-slate-400' : 'text-red-400'}`}>
              {vol.extremeAlert === 'low' ? 'BBWP at an extreme low' : 'BBWP at an extreme high'}
            </div>
          )}
          {shown.note && <div data-bbwp-note className="text-amber-300/90">{shown.note}</div>}
        </div>
      </div>
    </div>
  );
}
