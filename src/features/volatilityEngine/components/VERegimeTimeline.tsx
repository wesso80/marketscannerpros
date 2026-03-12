'use client';

import type { StateTransition, ExhaustionRisk, DVEFlag } from '@/src/features/volatilityEngine/types';

function regimeColor(regime: string): string {
  switch (regime) {
    case 'compression': return '#3B82F6';
    case 'expansion': return '#D97706';
    case 'climax': return '#DC2626';
    case 'transition': return '#8B5CF6';
    default: return '#64748B';
  }
}

const FLAG_CFG: Record<string, { emoji: string; bg: string; text: string }> = {
  BREAKOUT_WATCH: { emoji: '🔥', bg: 'bg-amber-500/15', text: 'text-amber-400' },
  EXPANSION_UP: { emoji: '📈', bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  EXPANSION_DOWN: { emoji: '📉', bg: 'bg-red-500/15', text: 'text-red-400' },
  TRAP_CANDIDATE: { emoji: '🔍', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  TRAP_DETECTED: { emoji: '⚠️', bg: 'bg-red-500/20', text: 'text-red-300' },
  CLIMAX_WARNING: { emoji: '🔥', bg: 'bg-red-500/15', text: 'text-red-400' },
  COMPRESSION_EXTREME: { emoji: '❄️', bg: 'bg-blue-500/15', text: 'text-blue-400' },
  CONTRACTION_EXIT_RISK: { emoji: '💥', bg: 'bg-amber-500/15', text: 'text-amber-400' },
  EXPANSION_EXIT_RISK: { emoji: '🔻', bg: 'bg-red-500/15', text: 'text-red-400' },
  SIGNAL_UP: { emoji: '🟢', bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  SIGNAL_DOWN: { emoji: '🔴', bg: 'bg-red-500/15', text: 'text-red-400' },
};

export default function VERegimeTimeline({
  transition,
  exhaustion,
  flags,
  summary,
}: {
  transition: StateTransition;
  exhaustion: ExhaustionRisk;
  flags: DVEFlag[];
  summary: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-base">🔮</span>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
          Regime &amp; Outlook
        </h3>
      </div>

      {/* Transition */}
      <div className="mb-4 flex items-center gap-3">
        <span className="rounded-full px-3 py-1 text-[0.68rem] font-bold uppercase" style={{ background: regimeColor(transition.from) + '30', color: regimeColor(transition.from) }}>
          {transition.from}
        </span>
        <span className="text-white/30">→</span>
        <span className="rounded-full px-3 py-1 text-[0.68rem] font-bold uppercase" style={{ background: regimeColor(transition.to) + '30', color: regimeColor(transition.to) }}>
          {transition.to}
        </span>
        <span className="text-[0.62rem] text-white/40">{transition.probability.toFixed(0)}% prob</span>
      </div>
      {transition.trigger && (
        <p className="mb-3 text-[0.62rem] text-white/40">Trigger: {transition.trigger}</p>
      )}

      {/* Exhaustion */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-[0.72rem] text-white/50">Exhaustion:</span>
        <span className={`text-sm font-bold ${exhaustion.level >= 70 ? 'text-red-400' : exhaustion.level >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
          {exhaustion.level.toFixed(0)}/100 ({exhaustion.label})
        </span>
      </div>
      {exhaustion.signals.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1">
          {exhaustion.signals.map((s, i) => (
            <span key={i} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.58rem] text-white/40">{s}</span>
          ))}
        </div>
      )}

      {/* Flags */}
      {flags.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 text-[0.62rem] uppercase text-white/40">Active Flags</div>
          <div className="flex flex-wrap gap-1.5">
            {flags.map((f) => {
              const c = FLAG_CFG[f] || { emoji: '📊', bg: 'bg-white/10', text: 'text-white/60' };
              return (
                <span key={f} className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[0.58rem] font-bold uppercase ${c.bg} ${c.text}`}>
                  {c.emoji} {f.replace(/_/g, ' ')}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="mb-1 text-[0.62rem] uppercase text-white/40">Summary</div>
        <p className="text-[0.72rem] leading-relaxed text-white/70">{summary}</p>
      </div>
    </div>
  );
}
