'use client';

import type { DVESignal, VolatilityState, DirectionalPressure, ExhaustionRisk } from '@/src/features/volatilityEngine/types';

function stateCode(state: string): string {
  switch (state) {
    case 'fired': return 'LIVE';
    case 'armed': return 'ARM';
    case 'invalidated': return 'INV';
    default: return 'IDLE';
  }
}

function typeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface ConditionCheck {
  label: string;
  met: boolean;
}

function getIdleConditions(vol: VolatilityState, dir: DirectionalPressure, exhaustion?: ExhaustionRisk): { signalName: string; conditions: ConditionCheck[] }[] {
  const groups: { signalName: string; conditions: ConditionCheck[] }[] = [];

  // Compression release conditions
  const wasCompressed = vol.bbwp <= 15;
  const bbwpAbove15 = vol.bbwp > 15;
  const bbwpAccel = vol.rateDirection === 'accelerating';
  const bbwpAboveSma = vol.bbwp > vol.bbwpSma5;
  const lowExhaustion = !exhaustion || (exhaustion.label !== 'HIGH' && exhaustion.label !== 'EXTREME');

  groups.push({
    signalName: 'Compression Release ↑',
    conditions: [
      { label: 'Recent compression (BBWP ≤ 15)', met: wasCompressed },
      { label: `BBWP breaks above 15 (now ${vol.bbwp.toFixed(1)})`, met: bbwpAbove15 },
      { label: `BBWP > SMA5 or accelerating`, met: bbwpAboveSma || bbwpAccel },
      { label: `Stoch momentum bullish`, met: dir.components.stochasticMomentum > 0 },
      { label: `Directional bias bullish`, met: dir.bias === 'bullish' },
    ],
  });

  groups.push({
    signalName: 'Compression Release ↓',
    conditions: [
      { label: 'Recent compression (BBWP ≤ 15)', met: wasCompressed },
      { label: `BBWP breaks above 15 (now ${vol.bbwp.toFixed(1)})`, met: bbwpAbove15 },
      { label: `BBWP > SMA5 or accelerating`, met: bbwpAboveSma || bbwpAccel },
      { label: `Stoch momentum bearish`, met: dir.components.stochasticMomentum < 0 },
      { label: `Directional bias bearish`, met: dir.bias === 'bearish' },
    ],
  });

  groups.push({
    signalName: 'Expansion Continuation ↑',
    conditions: [
      { label: `BBWP ≥ 85 climax zone (now ${vol.bbwp.toFixed(1)})`, met: vol.bbwp >= 85 },
      { label: `SMA5 ≥ 85 confirms (now ${vol.bbwpSma5.toFixed(1)})`, met: vol.bbwpSma5 >= 85 },
      { label: `Stoch momentum bullish`, met: dir.components.stochasticMomentum > 0 },
      { label: `Directional bias bullish`, met: dir.bias === 'bullish' },
      { label: `Low exhaustion risk`, met: lowExhaustion },
    ],
  });

  groups.push({
    signalName: 'Expansion Continuation ↓',
    conditions: [
      { label: `BBWP ≥ 85 climax zone (now ${vol.bbwp.toFixed(1)})`, met: vol.bbwp >= 85 },
      { label: `SMA5 ≥ 85 confirms (now ${vol.bbwpSma5.toFixed(1)})`, met: vol.bbwpSma5 >= 85 },
      { label: `Stoch momentum bearish`, met: dir.components.stochasticMomentum < 0 },
      { label: `Directional bias bearish`, met: dir.bias === 'bearish' },
      { label: `Low exhaustion risk`, met: lowExhaustion },
    ],
  });

  return groups;
}

interface SignalCardProps {
  signal: DVESignal;
  volatility?: VolatilityState;
  direction?: DirectionalPressure;
  exhaustion?: ExhaustionRisk;
}

export default function VESignalCard({ signal, volatility, direction, exhaustion }: SignalCardProps) {
  const isActive = signal.type !== 'none' && signal.active;
  const color = signal.type.includes('up') ? '#10B981' : signal.type.includes('down') ? '#EF4444' : '#64748B';

  const conditionGroups = (!isActive && signal.state !== 'armed' && volatility && direction)
    ? getIdleConditions(volatility, direction, exhaustion)
    : null;

  return (
    <div className={`rounded-xl border p-5 ${isActive ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 bg-white/5'}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[0.62rem] font-bold text-amber-300">SIG</span>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Signal Status
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-white/50">{stateCode(signal.state)}</span>
          <span className="text-[0.65rem] font-bold uppercase text-white/60">{signal.state}</span>
        </div>
      </div>

      {signal.type === 'none' && !conditionGroups ? (
        <p className="text-[0.75rem] text-white/40">No active signal. Waiting for trigger conditions.</p>
      ) : signal.type === 'none' && conditionGroups ? (
        <div className="space-y-3">
          <p className="text-[0.7rem] text-white/50 mb-2">Conditions needed to trigger a signal:</p>
          {conditionGroups.map((g) => {
            const metCount = g.conditions.filter(c => c.met).length;
            const total = g.conditions.length;
            const pctMet = (metCount / total) * 100;
            return (
              <div key={g.signalName} className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[0.7rem] font-bold text-white/70">{g.signalName}</span>
                  <span className="text-[11px] font-semibold" style={{ color: pctMet >= 80 ? '#10B981' : pctMet >= 50 ? '#D97706' : '#64748B' }}>
                    {metCount}/{total}
                  </span>
                </div>
                <div className="space-y-1">
                  {g.conditions.map((c, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[0.63rem]">
                      <span className={c.met ? 'text-emerald-400' : 'text-white/20'}>{c.met ? '✓' : '○'}</span>
                      <span className={c.met ? 'text-white/60' : 'text-white/30'}>{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold" style={{ color }}>{typeLabel(signal.type)}</span>
            <span className="text-lg font-black" style={{ color }}>{signal.strength.toFixed(0)}/100</span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all" style={{ width: `${signal.strength}%`, background: color }} />
          </div>

          {signal.triggerBarPrice != null && (
            <div className="grid grid-cols-1 gap-y-1 text-[0.75rem] sm:grid-cols-2 sm:gap-x-4">
              <div className="text-white/50">Trigger Price: <span className="font-bold text-white/80">${signal.triggerBarPrice.toFixed(2)}</span></div>
              {signal.triggerBarOpen != null && (
                <div className="text-white/50">Open: <span className="font-bold text-white/80">${signal.triggerBarOpen.toFixed(2)}</span></div>
              )}
              {signal.triggerBarHigh != null && (
                <div className="text-white/50">High: <span className="font-bold text-white/80">${signal.triggerBarHigh.toFixed(2)}</span></div>
              )}
              {signal.triggerBarLow != null && (
                <div className="text-white/50">Low: <span className="font-bold text-white/80">${signal.triggerBarLow.toFixed(2)}</span></div>
              )}
            </div>
          )}

          {signal.triggerReason.length > 0 && (
            <div className="space-y-0.5 border-t border-white/10 pt-2">
              {signal.triggerReason.map((r, i) => (
                <p key={i} className="text-[0.7rem] text-white/40">• {r}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
