'use client';

import type { DVESignal } from '@/src/features/volatilityEngine/types';

function stateIcon(state: string): string {
  switch (state) {
    case 'fired': return '🟢';
    case 'armed': return '🟡';
    case 'invalidated': return '🔴';
    default: return '⚪';
  }
}

function typeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function VESignalCard({ signal }: { signal: DVESignal }) {
  const isActive = signal.type !== 'none' && signal.active;
  const color = signal.type.includes('up') ? '#10B981' : signal.type.includes('down') ? '#EF4444' : '#64748B';

  return (
    <div className={`rounded-xl border p-5 ${isActive ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 bg-white/5'}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📡</span>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Signal Status
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{stateIcon(signal.state)}</span>
          <span className="text-[0.65rem] font-bold uppercase text-white/60">{signal.state}</span>
        </div>
      </div>

      {signal.type === 'none' ? (
        <p className="text-[0.75rem] text-white/40">No active signal. Waiting for trigger conditions.</p>
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
