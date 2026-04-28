'use client';

import type { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type Props = {
  meta: GoldenEggPayload['meta'];
  layer1: GoldenEggPayload['layer1'];
  setupType: string;
  volatility?: GoldenEggPayload['layer3']['structure']['volatility'];
};

function signalLabel(confidence: number): string {
  if (confidence >= 75) return 'STRONG SETUP';
  if (confidence >= 60) return 'MODERATE SETUP';
  if (confidence >= 45) return 'NEUTRAL SETUP';
  if (confidence >= 30) return 'WEAK SETUP';
  return 'NO SETUP';
}

function signalGlow(confidence: number): string {
  if (confidence >= 65) return 'shadow-emerald-500/20';
  if (confidence >= 45) return 'shadow-amber-500/20';
  return 'shadow-rose-500/20';
}

function ringColor(confidence: number): string {
  if (confidence >= 65) return 'stroke-emerald-500';
  if (confidence >= 45) return 'stroke-amber-500';
  return 'stroke-rose-500';
}

function textColor(confidence: number): string {
  if (confidence >= 65) return 'text-emerald-400';
  if (confidence >= 45) return 'text-amber-400';
  return 'text-rose-400';
}

function biasLabel(direction: string): string {
  if (direction === 'LONG') return 'Bullish';
  if (direction === 'SHORT') return 'Bearish';
  return 'Neutral';
}

function riskLabel(confidence: number): string {
  if (confidence >= 70) return 'Low';
  if (confidence >= 50) return 'Moderate';
  return 'Elevated';
}

function setupLabel(type: string): string {
  const map: Record<string, string> = {
    trend: 'Trend Continuation',
    breakout: 'Breakout',
    mean_reversion: 'Mean Reversion',
    reversal: 'Reversal',
    squeeze: 'Squeeze Play',
    range: 'Range Bound',
  };
  return map[type] || type;
}

export default function GESignalHero({ meta, layer1, setupType, volatility }: Props) {
  const { confidence, direction, assessment, grade } = layer1;
  const circumference = 2 * Math.PI * 54;
  const progress = (confidence / 100) * circumference;

  const pillData = [
    { label: 'Bias', value: biasLabel(direction), color: direction === 'LONG' ? 'text-emerald-400' : direction === 'SHORT' ? 'text-rose-400' : 'text-amber-300' },
    { label: 'Risk', value: riskLabel(confidence), color: confidence >= 70 ? 'text-emerald-400' : confidence >= 50 ? 'text-amber-300' : 'text-rose-400' },
    { label: 'Setup', value: setupLabel(setupType), color: 'text-sky-400' },
  ];

  // DVE volatility pills (if available)
  const volPills: typeof pillData = [];
  if (volatility?.bbwp != null) {
    const regime = volatility.regime;
    const regimeColor = regime === 'compression' ? 'text-blue-400' : regime === 'climax' ? 'text-rose-400' : regime === 'expansion' ? 'text-amber-400' : regime === 'transition' ? 'text-violet-400' : 'text-slate-300';
    volPills.push({ label: 'Vol State', value: regime.charAt(0).toUpperCase() + regime.slice(1), color: regimeColor });

    const volRisk = (volatility.exhaustionRisk ?? 0) >= 60 ? 'High' : (volatility.exhaustionRisk ?? 0) >= 30 ? 'Moderate' : 'Low';
    const volRiskColor = volRisk === 'High' ? 'text-rose-400' : volRisk === 'Moderate' ? 'text-amber-300' : 'text-emerald-400';
    volPills.push({ label: 'Vol Risk', value: volRisk, color: volRiskColor });

    if (volatility.breakoutScore != null) {
      const breakoutLabel = volatility.breakoutScore >= 60 ? 'High' : volatility.breakoutScore >= 40 ? 'Moderate' : 'Low';
      const breakoutColor = volatility.breakoutScore >= 60 ? 'text-emerald-400' : volatility.breakoutScore >= 40 ? 'text-amber-300' : 'text-slate-300';
      volPills.push({ label: 'Breakout', value: `${breakoutLabel} (${volatility.breakoutScore})`, color: breakoutColor });
    }
  }

  return (
    <div className={`relative overflow-hidden rounded-lg border border-white/5 bg-slate-900/80 shadow-2xl ${signalGlow(confidence)}`}>
      {/* Decorative top accent */}
      <div className={`absolute inset-x-0 top-0 h-[2px] ${confidence >= 65 ? 'bg-emerald-500' : confidence >= 45 ? 'bg-amber-500' : 'bg-rose-500'}`} />

      <div className="px-6 pb-8 pt-6">
        {/* Asset tag */}
        <div className="flex items-center justify-center gap-3">
          <span className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
            {meta.assetClass} &bull; {meta.timeframe}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
            assessment === 'ALIGNED' ? 'bg-emerald-500/15 text-emerald-400' :
            assessment === 'NOT_ALIGNED' ? 'bg-rose-500/15 text-rose-400' :
            'bg-amber-500/15 text-amber-400'
          }`}>
            {assessment === 'ALIGNED' ? 'Aligned' : assessment === 'NOT_ALIGNED' ? 'Not Aligned' : 'Watch'}
          </span>
        </div>

        {/* Symbol */}
        <h2 className="mt-2 text-center text-3xl font-bold text-white">{meta.symbol}</h2>
        <div className={`mt-1 text-center text-2xl font-bold ${direction === 'SHORT' ? 'text-rose-400' : 'text-emerald-400'}`}>
          ${(meta.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>

        {/* Score ring — dominant visual */}
        <div className="mx-auto mt-6 flex flex-col items-center">
          <div className="relative h-36 w-36">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" strokeWidth="7" className="stroke-slate-800" />
              <circle
                cx="60" cy="60" r="54" fill="none" strokeWidth="7"
                strokeLinecap="round"
                className={ringColor(confidence)}
                strokeDasharray={circumference}
                strokeDashoffset={circumference - progress}
                style={{ transition: 'stroke-dashoffset 1s ease-out' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-4xl font-black ${textColor(confidence)}`}>{confidence}</span>
              <span className="text-[11px] text-slate-500">/100</span>
            </div>
          </div>

          <div className={`mt-3 text-lg font-bold uppercase tracking-wider ${textColor(confidence)}`}>
            {signalLabel(confidence)}
          </div>
          <div className="mt-1 text-sm text-slate-400">
            Evidence alignment: {confidence}% &bull; Grade {grade}
          </div>
        </div>

        {/* Bias / Risk / Setup pills */}
        <div className="mx-auto mt-6 flex max-w-sm flex-wrap justify-center gap-3">
          {pillData.map((p) => (
            <div key={p.label} className="rounded-lg border border-white/5 bg-white/5 px-4 py-2 text-center">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{p.label}</div>
              <div className={`text-sm font-semibold ${p.color}`}>{p.value}</div>
            </div>
          ))}
        </div>

        {/* DVE Volatility State pills */}
        {volPills.length > 0 && (
          <div className="mx-auto mt-3 flex max-w-md flex-wrap justify-center gap-3">
            {volPills.map((p) => (
              <div key={p.label} className="rounded-lg border border-white/5 bg-white/5 px-4 py-2 text-center">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">{p.label}</div>
                <div className={`text-sm font-semibold ${p.color}`}>{p.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
