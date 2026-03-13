'use client';

import GECard from '@/src/features/goldenEgg/components/shared/GECard';
import type { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type Props = {
  volatility: GoldenEggPayload['layer3']['structure']['volatility'];
};

function regimeColor(regime: string): string {
  switch (regime) {
    case 'compression': return '#3B82F6';
    case 'expansion': return '#D97706';
    default: return '#64748B';
  }
}

export default function GEDVEConditions({ volatility }: Props) {
  if (volatility.bbwp == null) return null;

  const bbwp = volatility.bbwp;
  const regime = volatility.regime;
  const signal = volatility.signalType;
  const breakout = volatility.breakoutScore ?? 0;
  const exhaustion = volatility.exhaustionRisk ?? 0;

  // Build DVE-derived trade conditions
  const conditions: { label: string; value: string; color: string }[] = [];

  // Regime condition
  const rColor = regimeColor(regime);
  conditions.push({
    label: 'Vol Regime',
    value: `${regime.charAt(0).toUpperCase() + regime.slice(1)} (BBWP ${bbwp.toFixed(1)})`,
    color: rColor,
  });

  // Phase persistence
  if (volatility.phaseAge != null && volatility.phaseAgePercentile != null) {
    const ageColor = volatility.phaseAgePercentile > 80 ? '#D97706' : '#64748B';
    conditions.push({
      label: 'Phase Age',
      value: `${volatility.phaseAge} bars (${volatility.phaseAgePercentile.toFixed(0)}th pctl)`,
      color: ageColor,
    });
  }

  // Signal condition 
  if (signal && signal !== 'none') {
    const sigColor = signal.includes('up') ? '#10B981' : '#EF4444';
    conditions.push({
      label: 'DVE Signal',
      value: signal.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      color: sigColor,
    });
  }

  // Breakout readiness
  if (breakout > 0) {
    const bColor = breakout >= 60 ? '#10B981' : breakout >= 40 ? '#D97706' : '#64748B';
    conditions.push({
      label: 'Breakout Ready',
      value: `${breakout.toFixed(0)}/100`,
      color: bColor,
    });
  }

  // Exhaustion warning
  if (exhaustion >= 40) {
    const eColor = exhaustion >= 70 ? '#EF4444' : '#D97706';
    conditions.push({
      label: 'Exhaustion Risk',
      value: `${exhaustion.toFixed(0)}/100 — ${exhaustion >= 70 ? 'reduce size' : 'tighten stops'}`,
      color: eColor,
    });
  }

  // Trap warning
  if (volatility.trapDetected) {
    conditions.push({
      label: 'Trap Warning',
      value: `Score ${(volatility.trapScore ?? 0).toFixed(0)} — wait for confirmation`,
      color: '#EF4444',
    });
  }

  // BBWP invalidation thresholds
  if (regime === 'compression') {
    conditions.push({
      label: 'Invalidation',
      value: 'BBWP returning below 15 after breakout invalidates move',
      color: '#94A3B8',
    });
  } else if (regime === 'expansion') {
    conditions.push({
      label: 'Watch',
      value: 'BBWP deceleration → tighten stops for regime shift',
      color: '#94A3B8',
    });
  }

  if (conditions.length === 0) return null;

  return (
    <div className="lg:col-span-12">
      <GECard title="DVE Volatility Conditions">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {conditions.map((c) => (
            <div key={c.label} className="flex flex-col gap-1 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
              <span className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">{c.label}</span>
              <span className="text-[0.75rem] font-semibold leading-snug break-words" style={{ color: c.color }}>{c.value}</span>
            </div>
          ))}
        </div>
      </GECard>
    </div>
  );
}
