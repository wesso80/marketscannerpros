'use client';

import type { StateTransition, ExhaustionRisk, DVEFlag, VolatilityState, PhasePersistence, VolRegime, RateDirection } from '@/src/features/volatilityEngine/types';

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

// Regime phase positions on the timeline (0-100)
const REGIME_POS: Record<string, number> = {
  compression: 10,
  neutral: 30,
  transition: 50,
  expansion: 70,
  climax: 90,
};

const REGIMES_ORDER: VolRegime[] = ['compression', 'neutral', 'transition', 'expansion', 'climax'];

// Compute all possible next-regime probabilities from current state
function computeRegimeForecast(current: VolRegime, rateDir: RateDirection, bbwp: number): { regime: VolRegime; probability: number }[] {
  const forecast: { regime: VolRegime; probability: number }[] = [];

  if (current === 'compression') {
    const exitProb = rateDir === 'accelerating' ? 65 : rateDir === 'flat' ? 20 : 10;
    forecast.push({ regime: 'compression', probability: 100 - exitProb });
    forecast.push({ regime: 'transition', probability: exitProb * 0.7 });
    forecast.push({ regime: 'expansion', probability: exitProb * 0.3 });
  } else if (current === 'neutral') {
    const toCompression = rateDir === 'decelerating' ? 45 : 20;
    const toExpansion = rateDir === 'accelerating' ? 40 : 15;
    forecast.push({ regime: 'compression', probability: toCompression });
    forecast.push({ regime: 'neutral', probability: Math.max(0, 100 - toCompression - toExpansion - 10) });
    forecast.push({ regime: 'transition', probability: 10 });
    forecast.push({ regime: 'expansion', probability: toExpansion });
  } else if (current === 'transition') {
    const toExpansion = rateDir === 'accelerating' ? 55 : 25;
    const toCompression = rateDir === 'decelerating' ? 40 : 15;
    forecast.push({ regime: 'compression', probability: toCompression });
    forecast.push({ regime: 'transition', probability: Math.max(0, 100 - toExpansion - toCompression) });
    forecast.push({ regime: 'expansion', probability: toExpansion });
  } else if (current === 'expansion') {
    const toClimax = rateDir === 'accelerating' && bbwp > 75 ? 50 : rateDir === 'accelerating' ? 30 : 10;
    const toTransition = rateDir === 'decelerating' ? 35 : 15;
    forecast.push({ regime: 'expansion', probability: Math.max(0, 100 - toClimax - toTransition) });
    forecast.push({ regime: 'climax', probability: toClimax });
    forecast.push({ regime: 'transition', probability: toTransition });
  } else if (current === 'climax') {
    const toExpansion = rateDir === 'decelerating' ? 50 : 30;
    const toClimax = rateDir === 'accelerating' ? 40 : 20;
    forecast.push({ regime: 'climax', probability: toClimax });
    forecast.push({ regime: 'expansion', probability: toExpansion });
    forecast.push({ regime: 'transition', probability: Math.max(0, 100 - toClimax - toExpansion) });
  }

  return forecast.filter(f => f.probability > 0).sort((a, b) => b.probability - a.probability);
}

export default function VERegimeTimeline({
  transition,
  exhaustion,
  flags,
  summary,
  volatility,
  phase,
}: {
  transition: StateTransition;
  exhaustion: ExhaustionRisk;
  flags: DVEFlag[];
  summary: string;
  volatility?: VolatilityState;
  phase?: PhasePersistence;
}) {
  const currentRegime = transition.from;
  const currentPos = REGIME_POS[currentRegime] ?? 50;

  // Compute regime forecast
  const forecast = volatility
    ? computeRegimeForecast(currentRegime, volatility.rateDirection, volatility.bbwp)
    : [];

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-base">🔮</span>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
          Regime &amp; Outlook
        </h3>
      </div>

      {/* ── Visual Regime Timeline ── */}
      <div className="mb-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="text-[0.65rem] uppercase text-white/40 mb-3">Volatility Regime Timeline</div>
        <div className="relative">
          {/* Timeline track */}
          <div className="relative h-8 rounded-full bg-gradient-to-r from-blue-500/20 via-slate-500/20 via-purple-500/20 via-amber-500/20 to-red-500/20">
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
            {/* Transition arrow */}
            {transition.from !== transition.to && (
              <div
                className="absolute top-1/2 -translate-y-1/2 text-white/40 text-[0.7rem]"
                style={{ left: `${((REGIME_POS[transition.from] + REGIME_POS[transition.to]) / 2)}%`, transform: 'translate(-50%, -50%)' }}
              >
                →
              </div>
            )}
          </div>
          {/* Labels below */}
          <div className="relative mt-1.5">
            {REGIMES_ORDER.map((r) => (
              <div
                key={r}
                className="absolute -translate-x-1/2 text-[0.55rem] font-bold uppercase"
                style={{ left: `${REGIME_POS[r]}%`, color: r === currentRegime ? regimeColor(r) : regimeColor(r) + '66' }}
              >
                {r}
              </div>
            ))}
          </div>
        </div>

        {/* Event markers */}
        <div className="mt-5 flex flex-wrap gap-2">
          {flags.includes('TRAP_DETECTED') && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[0.6rem] font-bold text-red-300">⚠️ Trap Detected</span>
          )}
          {exhaustion.level >= 60 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6rem] font-bold text-amber-300">🔥 Exhaustion Risk</span>
          )}
          {flags.includes('BREAKOUT_WATCH') && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-300">🎯 Breakout Watch</span>
          )}
          {phase?.contraction.active && phase.contraction.stats.agePercentile > 80 && (
            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[0.6rem] font-bold text-blue-300">❄️ Extended Compression</span>
          )}
          {phase?.expansion.active && phase.expansion.stats.agePercentile > 80 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6rem] font-bold text-amber-300">🔥 Extended Expansion</span>
          )}
        </div>
      </div>

      {/* Transition */}
      <div className="mb-4 flex items-center gap-3">
        <span className="rounded-full px-3 py-1 text-[0.75rem] font-bold uppercase" style={{ background: regimeColor(transition.from) + '30', color: regimeColor(transition.from) }}>
          {transition.from}
        </span>
        <span className="text-white/30">→</span>
        <span className="rounded-full px-3 py-1 text-[0.75rem] font-bold uppercase" style={{ background: regimeColor(transition.to) + '30', color: regimeColor(transition.to) }}>
          {transition.to}
        </span>
        <span className="text-[0.7rem] text-white/40">{transition.probability.toFixed(0)}% prob</span>
      </div>
      {transition.trigger && (
        <p className="mb-3 text-[0.7rem] text-white/40">Trigger: {transition.trigger}</p>
      )}

      {/* ── Next Regime Probability Forecast ── */}
      {forecast.length > 0 && (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[0.65rem] uppercase text-white/40 mb-2">Next Regime Probability</div>
          <div className="space-y-1.5">
            {forecast.map((f) => {
              const c = regimeColor(f.regime);
              return (
                <div key={f.regime} className="flex items-center gap-2">
                  <span className="w-20 text-[0.65rem] font-bold uppercase" style={{ color: c }}>{f.regime}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${f.probability}%`, background: c }} />
                  </div>
                  <span className="w-10 text-right text-[0.65rem] font-bold" style={{ color: c }}>{f.probability.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
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
            <span key={i} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.7rem] text-white/40">{s}</span>
          ))}
        </div>
      )}

      {/* Flags */}
      {flags.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 text-[0.7rem] uppercase text-white/40">Active Flags</div>
          <div className="flex flex-wrap gap-1.5">
            {flags.map((f) => {
              const c = FLAG_CFG[f] || { emoji: '📊', bg: 'bg-white/10', text: 'text-white/60' };
              return (
                <span key={f} className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[0.7rem] font-bold uppercase ${c.bg} ${c.text}`}>
                  {c.emoji} {f.replace(/_/g, ' ')}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="mb-1 text-[0.7rem] uppercase text-white/40">Summary</div>
        <p className="text-[0.72rem] leading-relaxed text-white/70">{summary}</p>
      </div>
    </div>
  );
}
