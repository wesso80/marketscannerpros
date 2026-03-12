'use client';

import type { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type VolatilityData = GoldenEggPayload['layer3']['structure']['volatility'];

const ZONES = [
  { max: 15, label: 'COMPRESSION', color: '#1E3A5F', text: '#60A5FA' },
  { max: 70, label: 'NEUTRAL',     color: '#475569', text: '#94A3B8' },
  { max: 90, label: 'EXPANSION',   color: '#D97706', text: '#FBBF24' },
  { max: 100, label: 'CLIMAX',     color: '#DC2626', text: '#F87171' },
] as const;

function getZone(bbwp: number) {
  return ZONES.find(z => bbwp <= z.max) ?? ZONES[ZONES.length - 1];
}

function directionArrow(bias?: 'bullish' | 'bearish' | 'neutral') {
  if (bias === 'bullish') return { icon: '↑', color: '#10B981', label: 'Bullish' };
  if (bias === 'bearish') return { icon: '↓', color: '#EF4444', label: 'Bearish' };
  return { icon: '↔', color: '#94A3B8', label: 'Neutral' };
}

export default function GEVolatilityGauge({ volatility }: { volatility: VolatilityData }) {
  if (volatility.bbwp == null) return null;

  const bbwp = volatility.bbwp;
  const zone = getZone(bbwp);
  const dir = directionArrow(volatility.directionalBias);

  // SVG semicircle gauge
  const radius = 72;
  const stroke = 10;
  const cx = 90;
  const cy = 85;
  const circumference = Math.PI * radius; // half-circle
  const progress = (bbwp / 100) * circumference;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-base">📊</span>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
          Volatility Gauge
        </h3>
      </div>

      <div className="flex flex-col items-center">
        {/* Semicircle gauge */}
        <svg viewBox="0 0 180 100" className="h-auto w-full max-w-[220px]">
          {/* Background arc (full semicircle) */}
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
            const startAngle = Math.PI * (1 - start / 100);
            const endAngle = Math.PI * (1 - z.max / 100);
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
                opacity={0.4}
              />
            );
          })}
          {/* Needle indicator */}
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
          <span className="text-3xl font-black" style={{ color: zone.text }}>
            {bbwp.toFixed(1)}
          </span>
          <span className="ml-1 text-xs text-white/40">BBWP</span>
        </div>

        {/* Regime label */}
        <div
          className="mt-1 rounded-full px-3 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest"
          style={{ background: zone.color + '33', color: zone.text }}
        >
          {zone.label}
        </div>

        {/* Direction arrow */}
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-lg" style={{ color: dir.color }}>{dir.icon}</span>
          <span className="text-xs font-semibold" style={{ color: dir.color }}>
            {dir.label}
          </span>
          {volatility.directionalConfidence != null && (
            <span className="text-[0.65rem] text-white/40">
              ({volatility.directionalConfidence}%)
            </span>
          )}
        </div>

        {/* Subtitle lines */}
        <div className="mt-2 space-y-0.5 text-center text-[0.7rem] text-white/50">
          {volatility.bbwpSma5 != null && (
            <div>SMA5: <span className="font-semibold text-white/70">{volatility.bbwpSma5.toFixed(1)}</span></div>
          )}
          {volatility.contractionContinuation != null && volatility.contractionContinuation > 0 && (
            <div>Contraction: <span className="font-semibold text-blue-300">{volatility.contractionContinuation.toFixed(0)}% continuation</span></div>
          )}
          {volatility.expansionContinuation != null && volatility.expansionContinuation > 0 && (
            <div>Expansion: <span className="font-semibold text-amber-300">{volatility.expansionContinuation.toFixed(0)}% continuation</span></div>
          )}
        </div>
      </div>
    </div>
  );
}
