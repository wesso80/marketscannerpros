'use client';
import { volatilityText } from '../displayText';
import { volatilityBadgeLabel } from '@/lib/presentation/volatilityLayerLabel';

import type { PublicSignal } from '@/src/features/volatilityEngine/types';

function typeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface SignalCardProps {
  signal: PublicSignal;
}

/**
 * Signal status. While idle, the rule's measured conditions come from the server (lib/research/publicDve); the rule
 * also needs the engine's directional pressure to agree, which is not published, so that condition is stated, not shown.
 */
export default function VESignalCard({ signal }: SignalCardProps) {
  const color = signal.type.includes('up') ? 'var(--msp-bull)' : signal.type.includes('down') ? 'var(--msp-bear)' : 'var(--msp-text-muted)';
  const isActive = signal.type !== 'none' && signal.active;
  const conditionGroups = signal.conditions;

  return (
    <div className={`rounded-xl border p-5 ${isActive ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 bg-white/5'}`}>
      <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="shrink-0 whitespace-nowrap rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[0.62rem] font-semibold text-amber-300">{volatilityBadgeLabel('SIG')}</span>
          <h3 className="text-xs font-semibold tracking-widest text-amber-400">
            Signal Status
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[0.65rem] font-bold text-white/60">{volatilityText(signal.state)}</span>
        </div>
      </div>

      {signal.type === 'none' && !conditionGroups ? (
        <p className="text-[0.75rem] text-white/40">No active signal. Trigger conditions are not met.</p>
      ) : signal.type === 'none' && conditionGroups ? (
        <div className="space-y-3">
          <p className="text-[0.7rem] text-white/50 mb-2">Measured conditions in each rule. Each rule also needs the engine's directional pressure to agree; that reading is not published.</p>
          {conditionGroups.map((g) => {
            const metCount = g.conditions.filter(c => c.met).length;
            const total = g.conditions.length;
            const pctMet = (metCount / total) * 100;
            return (
              <div key={g.signalName} className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[0.7rem] font-bold text-white/70">{g.signalName}</span>
                  <span className="text-[11px] font-semibold" style={{ color: pctMet >= 80 ? 'var(--msp-bull)' : pctMet >= 50 ? 'var(--msp-warn)' : 'var(--msp-text-muted)' }}>
                    {metCount}/{total}
                  </span>
                </div>
                <div className="space-y-1">
                  {g.conditions.map((c, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[0.63rem]">
                      <span className={c.met ? 'text-emerald-400' : 'text-white/20'}>{c.met ? '✓' : '○'}</span>
                      <span className={c.met ? 'text-white/60' : 'text-white/30'}>{volatilityText(c.label)}</span>
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
          </div>


          {signal.triggerBarPrice != null && (
            <div className="grid grid-cols-1 gap-y-1 text-[0.75rem] sm:grid-cols-2 sm:gap-x-4">
              <div className="text-white/50">Signal bar close: <span className="font-bold text-white/80">${signal.triggerBarPrice.toFixed(2)}</span></div>
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
                <p key={i} className="text-[0.7rem] text-white/40">• {volatilityText(r)}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
