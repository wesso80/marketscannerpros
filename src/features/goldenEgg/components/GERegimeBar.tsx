'use client';

import type { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type Props = {
  structure: GoldenEggPayload['layer3']['structure'];
};

type Regime = {
  label: string;
  active: boolean;
  icon: string;
  description: string;
};

function trendAlignment(htf: string, mtf: string, ltf: string): 'aligned' | 'mixed' | 'conflicting' {
  const vals = [htf, mtf, ltf].map(t => t.toLowerCase());
  const bullish = vals.filter(v => v.includes('up') || v.includes('bull')).length;
  const bearish = vals.filter(v => v.includes('down') || v.includes('bear')).length;
  if (bullish >= 3 || bearish >= 3) return 'aligned';
  if (bullish >= 2 || bearish >= 2) return 'mixed';
  return 'conflicting';
}

export default function GERegimeBar({ structure }: Props) {
  const { trend, volatility } = structure;
  const alignment = trendAlignment(trend.htf, trend.mtf, trend.ltf);

  const regimes: Regime[] = [
    {
      label: 'Trend',
      active: alignment === 'aligned',
      icon: '📈',
      description: alignment === 'aligned'
        ? `Aligned ${trend.htf.toLowerCase().includes('up') || trend.htf.toLowerCase().includes('bull') ? 'bullish' : 'bearish'} across all TFs`
        : 'Timeframes not fully aligned',
    },
    {
      label: 'Range',
      active: alignment === 'conflicting',
      icon: '↔️',
      description: alignment === 'conflicting' ? 'Conflicting timeframe signals' : 'Not ranging',
    },
    {
      label: 'Compression',
      active: volatility.regime === 'compression',
      icon: '🔻',
      description: volatility.regime === 'compression'
        ? `Volatility squeezing${volatility.atr ? ` (ATR: ${volatility.atr.toFixed(2)})` : ''}`
        : 'No squeeze detected',
    },
    {
      label: 'Transition',
      active: volatility.regime === 'transition',
      icon: '⚡',
      description: volatility.regime === 'transition'
        ? 'Volatility accelerating — breakout building'
        : 'No transition detected',
    },
    {
      label: 'Vol Expansion',
      active: volatility.regime === 'expansion' || volatility.regime === 'climax',
      icon: '💥',
      description: volatility.regime === 'climax'
        ? `Extreme volatility expansion${volatility.atr ? ` (ATR: ${volatility.atr.toFixed(2)})` : ''}`
        : volatility.regime === 'expansion'
        ? `Volatility expanding${volatility.atr ? ` (ATR: ${volatility.atr.toFixed(2)})` : ''}`
        : 'Volatility normal',
    },
  ];

  const activeRegime = regimes.find(r => r.active) || regimes[0];

  return (
    <div className="rounded-lg border border-white/5 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center gap-2 border-b border-white/5 pb-3">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-400">Market Regime</h2>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {regimes.map((r) => (
          <div
            key={r.label}
            className={`rounded-xl border p-3 text-center transition ${
              r.active
                ? 'border-violet-500/30 bg-violet-500/10 shadow-lg shadow-violet-500/5'
                : 'border-white/5 bg-white/[0.02]'
            }`}
          >
            <div className="text-lg">{r.icon}</div>
            <div className={`mt-1 text-xs font-bold uppercase tracking-wide ${r.active ? 'text-violet-300' : 'text-slate-500'}`}>
              {r.label}
            </div>
            {r.active && (
              <div className="mt-1 h-0.5 mx-auto w-6 rounded-full bg-violet-500" />
            )}
          </div>
        ))}
      </div>

      {/* Active regime description */}
      <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.03] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-base">{activeRegime.icon}</span>
          <span className="text-sm font-medium text-white">{activeRegime.label}</span>
          <span className="text-[11px] uppercase tracking-wider text-violet-400">Active</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">{activeRegime.description}</p>
      </div>

      {/* Trend alignment detail */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'HTF', value: trend.htf },
          { label: 'MTF', value: trend.mtf },
          { label: 'LTF', value: trend.ltf },
        ].map((tf) => {
          const isBull = tf.value.toLowerCase().includes('up') || tf.value.toLowerCase().includes('bull');
          const isBear = tf.value.toLowerCase().includes('down') || tf.value.toLowerCase().includes('bear');
          return (
            <div key={tf.label} className="rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{tf.label}</div>
              <div className={`text-xs font-semibold ${isBull ? 'text-emerald-400' : isBear ? 'text-rose-400' : 'text-slate-300'}`}>
                {tf.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
