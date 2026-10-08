'use client';
import { volatilityText } from '../displayText';

import type { PublicExhaustion as ExhaustionRisk, PublicDveFlag as DVEFlag, PublicVolatility as VolatilityState, PublicPhase as PhasePersistence, VolRegime } from '@/src/features/volatilityEngine/types';

function regimeColor(regime: string): string {
  switch (regime) {
    case 'compression': return 'var(--msp-text-muted)';
    case 'expansion': return 'var(--msp-warn)';
    case 'climax': return 'var(--msp-bear)';
    case 'transition': return '#94A3B8';
    default: return 'var(--msp-text-muted)';
  }
}

const FLAG_CFG: Record<string, { bg: string; text: string }> = {
  TRAP_CANDIDATE: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  TRAP_DETECTED: { bg: 'bg-red-500/20', text: 'text-red-300' },
  CLIMAX_WARNING: { bg: 'bg-red-500/15', text: 'text-red-400' },
  COMPRESSION_EXTREME: { bg: 'bg-slate-500/15', text: 'text-slate-400' },
  SIGNAL_UP: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  SIGNAL_DOWN: { bg: 'bg-red-500/15', text: 'text-red-400' },
};

// Regime phase positions on the timeline (0-100)
const REGIME_POS: Record<string, number> = {
  compression: 10,
  neutral: 30,
  transition: 50,
  expansion: 70,
  climax: 90,
};

const REGIMES_ORDER: VolRegime[] = ['compression', 'neutral', 'transition', 'expansion', 'climax'];

/** Current regime and the rate observation behind it. The engine's next-regime guess is not published (W3). */
export default function VERegimeTimeline({
  regime,
  exhaustion,
  flags,
  summary,
  volatility,
  phase,
}: {
  regime: { current: VolRegime; observation: string };
  exhaustion: ExhaustionRisk;
  flags: DVEFlag[];
  summary: string;
  volatility?: VolatilityState;
  phase?: PhasePersistence;
}) {
  const currentRegime = regime.current;
  const exhaustionHigh = exhaustion.label === 'HIGH' || exhaustion.label === 'EXTREME';
  const currentPos = REGIME_POS[currentRegime] ?? 50;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-xs font-semibold tracking-widest text-amber-400">
          Regime context
        </h3>
      </div>

      {/* ── Visual Regime Timeline ── */}
      <div className="mb-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 text-[11px] text-white/40">Volatility Regime Timeline</div>
        <div className="relative">
          {/* Timeline track */}
          <div className="relative h-8 rounded-full bg-slate-800/80">
            {/* Regime labels */}
            {REGIMES_ORDER.map((r) => {
              const pos = REGIME_POS[r];
              const isCurrent = r === currentRegime;
              return (
                <div
                  key={r}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                  style={{ left: `${pos}%` }}
                >
                  {isCurrent ? (
                    <div
                      className="h-5 w-5 rounded-full border-2 shadow-lg"
                      style={{
                        background: regimeColor(r),
                        borderColor: '#fff',
                        boxShadow: `0 0 10px ${regimeColor(r)}88`,
                      }}
                    />
                  ) : (
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: regimeColor(r) + '44' }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {/* Labels below */}
          <div className="relative mt-1.5">
            {REGIMES_ORDER.map((r) => (
              <div
                key={r}
                className="absolute -translate-x-1/2 text-[11px] font-bold"
                style={{ left: `${REGIME_POS[r]}%`, color: r === currentRegime ? regimeColor(r) : regimeColor(r) + '66' }}
              >
                {volatilityText(r)}
              </div>
            ))}
          </div>
        </div>

        {/* Event markers */}
        <div className="mt-5 flex flex-wrap gap-2">
          {flags.includes('TRAP_DETECTED') && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-bold text-red-300">Trap Detected</span>
          )}
          {exhaustionHigh && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">Exhaustion Risk</span>
          )}
          {phase?.contraction.active && phase.contraction.stats.agePercentile > 80 && (
            <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[11px] font-bold text-slate-300">Extended Compression</span>
          )}
          {phase?.expansion.active && phase.expansion.stats.agePercentile > 80 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">Extended Expansion</span>
          )}
        </div>
      </div>

      {/* Current regime and the rate observation; no next-regime guess or "weights" (Phase 4, W3). */}
      <div className="mb-4 flex items-center gap-3">
        <span className="rounded-full px-3 py-1 text-[0.75rem] font-bold" style={{ background: regimeColor(regime.current) + '30', color: regimeColor(regime.current) }}>
          {volatilityText(regime.current)}
        </span>
      </div>
      {regime.observation && (
        <p className="mb-3 text-[0.7rem] text-white/40">Observed: {volatilityText(regime.observation)}</p>
      )}

      {/* Exhaustion */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-[0.72rem] text-white/50">Exhaustion:</span>
        <span className={`text-sm font-bold ${exhaustionHigh ? 'text-red-400' : exhaustion.label === 'MODERATE' ? 'text-amber-400' : 'text-emerald-400'}`}>
          {volatilityText(exhaustion.label)}
        </span>
      </div>
      {exhaustion.signals.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1">
          {exhaustion.signals.map((s, i) => (
            <span key={i} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.7rem] text-white/40">{volatilityText(s)}</span>
          ))}
        </div>
      )}

      {/* Flags */}
      {flags.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 text-[11px] text-white/40">Active Flags</div>
          <div className="flex flex-wrap gap-1.5">
            {flags.map((f) => {
              const c = FLAG_CFG[f] || { bg: 'bg-white/10', text: 'text-white/60' };
              return (
                <span key={f} className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${c.bg} ${c.text}`}>
                  {volatilityText(f)}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="mb-1 text-[0.7rem] text-white/40">Summary</div>
        <p className="text-[0.72rem] leading-relaxed text-white/70">{volatilityText(summary)}</p>
      </div>
    </div>
  );
}
