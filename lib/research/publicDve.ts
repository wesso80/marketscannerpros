import type { DVEReading, DVEFlag, DVESignalState, DVESignalType, RateDirection, VolRegime, ZoneDurationStats } from '@/lib/directionalVolatilityEngine.types';

/**
 * Public Volatility contract (W3: /api/dve). Built leaf by leaf from the engine reading on the server; the internal
 * reading is never sent, spread or mutated (it stays cached for the Symbol engine and private consumers).
 *
 * Not public (private heuristic outputs, per the public API acceptance matrix):
 *   - directional pressure: score, confidence, bias and its weighted components / details (the bias is the sign of a
 *     points total), and `directionalVolatility`;
 *   - breakout readiness score and label (only which setting conditions are present is sent);
 *   - trap score; exhaustion level (its label and observations are sent);
 *   - phase continuation / exit "probabilities" (additive points), regime confidence, signal strength;
 *   - the next-regime guess and its "probability" (only the current regime and the rate observation are sent);
 *   - the signal's price invalidation (a stop level) and the engine summary, which carries a direction score and that
 *     stop; a summary is rebuilt here from the public leaves;
 *   - flags derived from the scores above (BREAKOUT_WATCH, EXPANSION_UP/DOWN, *_EXIT_RISK);
 *   - the projection's quality score and hit "rate" (the count of past cases in the signal's direction is sent).
 * Engine observation strings have their weighting points removed, and lines that carry a score or the direction
 * reading are dropped.
 */
export const PUBLIC_DVE_CONTRACT = 'public-dve-v1' as const;

export type PublicVolatility = {
  bbwp: number; bbwpSma5: number; regime: VolRegime; rateOfChange: number; rateSmoothed: number; acceleration: number; rateDirection: RateDirection;
  inSqueeze: boolean; squeezeStrength: number; atr?: number; extremeAlert?: 'low' | 'high' | null;
  bbwpBasis?: { available: boolean; window: number; lookback: number; fullYear: boolean };
};
export type PublicPhase = { contraction: { active: boolean; stats: ZoneDurationStats }; expansion: { active: boolean; stats: ZoneDurationStats } };
export type SignalConditionGroup = { signalName: string; conditions: Array<{ label: string; met: boolean }> };
export type PublicSignal = {
  type: DVESignalType; state: DVESignalState; active: boolean;
  triggerBarPrice?: number; triggerBarOpen?: number; triggerBarHigh?: number; triggerBarLow?: number;
  triggerReason: string[];
  /** When no signal is active or armed: the rule's measured conditions. The engine-direction condition is not published. */
  conditions: SignalConditionGroup[] | null;
};
export type PublicInvalidation = { invalidated: boolean; invalidationMode: 'extreme' | 'open'; phaseInvalidation?: number; smoothedPhaseInvalidation?: number; ruleSet: string[] };
export type PublicProjection = {
  signalType: DVESignalType; sampleSize: number; expectedMovePct: number; medianMovePct: number; dispersionPct: number;
  maxHistoricalMovePct: number; averageBarsToMove: number; casesInDirection: number | null; projectionWarning: string;
};
export type BreakoutConditionId = 'volCompression' | 'timeAlignment' | 'gammaWall' | 'adxRising';
export type PublicBreakout = { conditions: Record<BreakoutConditionId, boolean>; details: string[] };
export type PublicTrap = { detected: boolean; candidate: boolean; observations: string[]; bbwpAtCheck: number; gammaLockDetected: boolean; timeClusterApproaching: boolean };
export type PublicExhaustion = { label: string; signals: string[] };
export type PublicDveFlag = Extract<DVEFlag, 'TRAP_DETECTED' | 'TRAP_CANDIDATE' | 'CLIMAX_WARNING' | 'COMPRESSION_EXTREME' | 'SIGNAL_UP' | 'SIGNAL_DOWN'>;

export interface PublicDveReading {
  contract: typeof PUBLIC_DVE_CONTRACT;
  symbol: string; timestamp: number; label: string; summary: string;
  volatility: PublicVolatility;
  phasePersistence: PublicPhase;
  signal: PublicSignal;
  invalidation: PublicInvalidation;
  projection: PublicProjection;
  breakout: PublicBreakout;
  trap: PublicTrap;
  exhaustion: PublicExhaustion;
  regime: { current: VolRegime; observation: string };
  flags: PublicDveFlag[];
  dataQuality: { coverage: number; missing: string[]; warnings: string[] };
}

const PUBLIC_FLAGS: ReadonlySet<DVEFlag> = new Set<DVEFlag>(['TRAP_DETECTED', 'TRAP_CANDIDATE', 'CLIMAX_WARNING', 'COMPRESSION_EXTREME', 'SIGNAL_UP', 'SIGNAL_DOWN']);
const SCORE_LINE = /\b\d+\s*\/\s*\d+\b|\bscore\b|\bdirection:|\bbias\b|\bconfidence\b|\bprobabilit/i;

/** An engine observation without its weighting points; null when the line carries a score or the direction reading. */
export function publicObservation(s: string): string | null {
  if (typeof s !== 'string') return null;
  const out = s.replace(/\s*\((?:[+-]?\d+(?:\.\d+)?|\d+\s*\/\s*\d+)\)/g, '').replace(/momentum bullish/gi, 'momentum rising').replace(/momentum bearish/gi, 'momentum falling').trim();
  return out && !SCORE_LINE.test(out) ? out : null;
}
const observations = (v: unknown): string[] => (Array.isArray(v) ? v.map(publicObservation).filter((x): x is string => !!x) : []);
const stats = (s: ZoneDurationStats): ZoneDurationStats => ({ currentBars: s.currentBars, averageBars: s.averageBars, medianBars: s.medianBars, maxBars: s.maxBars, agePercentile: s.agePercentile, episodeCount: s.episodeCount });
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** The signal rule's measured conditions while idle. The engine-direction agreement is part of the rule but is not published. */
function idleConditions(r: DVEReading): SignalConditionGroup[] {
  const v = r.volatility, stoch = r.direction.components.stochasticMomentum;
  const lowExhaustion = r.exhaustion.label !== 'HIGH' && r.exhaustion.label !== 'EXTREME';
  const release = [
    { label: 'Recent compression (BBWP ≤ 15)', met: v.bbwp <= 15 },
    { label: `BBWP breaks above 15 (now ${v.bbwp.toFixed(1)})`, met: v.bbwp > 15 },
    { label: 'BBWP > SMA5 or accelerating', met: v.bbwp > v.bbwpSma5 || v.rateDirection === 'accelerating' },
  ];
  const climax = [
    { label: `BBWP ≥ 85 climax zone (now ${v.bbwp.toFixed(1)})`, met: v.bbwp >= 85 },
    { label: `SMA5 ≥ 85 confirms (now ${v.bbwpSma5.toFixed(1)})`, met: v.bbwpSma5 >= 85 },
  ];
  return [
    { signalName: 'Compression release (up)', conditions: [...release, { label: 'Stochastic momentum rising', met: stoch > 0 }] },
    { signalName: 'Compression release (down)', conditions: [...release, { label: 'Stochastic momentum falling', met: stoch < 0 }] },
    { signalName: 'Expansion continuation (up)', conditions: [...climax, { label: 'Stochastic momentum rising', met: stoch > 0 }, { label: 'Exhaustion not high', met: lowExhaustion }] },
    { signalName: 'Expansion continuation (down)', conditions: [...climax, { label: 'Stochastic momentum falling', met: stoch < 0 }, { label: 'Exhaustion not high', met: lowExhaustion }] },
  ];
}

export function publicDveSummary(p: Omit<PublicDveReading, 'summary'>, forwardBars: number): string {
  const v = p.volatility, parts: string[] = [];
  parts.push(v.bbwpBasis && !v.bbwpBasis.available
    ? `${p.symbol} BBWP not available (too few closes).`
    : `${p.symbol} BBWP at ${v.bbwp.toFixed(1)} (${v.regime})${v.bbwpBasis && !v.bbwpBasis.fullYear ? `, ranked over ${v.bbwpBasis.window} band widths rather than a full year` : ''}.`);
  const ph = p.phasePersistence.contraction.active ? ['Contraction', p.phasePersistence.contraction.stats] as const : p.phasePersistence.expansion.active ? ['Expansion', p.phasePersistence.expansion.stats] as const : null;
  if (ph) parts.push(`${ph[0]} phase ${ph[1].currentBars} bars long; ${ph[1].agePercentile.toFixed(0)}% of earlier ${ph[0].toLowerCase()} phases were this long or shorter.`);
  if (p.signal.active && p.signal.type !== 'none') {
    const t = p.signal.type.replace(/_/g, ' ');
    parts.push(`${t.charAt(0).toUpperCase() + t.slice(1)} rule recorded on the latest closed bar.`);
    const pr = p.projection;
    if (pr.casesInDirection != null && pr.sampleSize > 0) parts.push(`In ${pr.sampleSize} past cases on this symbol, the close ${forwardBars} bars later moved ${pr.expectedMovePct > 0 ? '+' : ''}${pr.expectedMovePct}% on average; ${pr.casesInDirection} of ${pr.sampleSize} moved in the rule's direction. In-sample history, not a forecast.`);
  }
  return parts.join(' ');
}

export function toPublicDveReading(r: DVEReading, forwardBars: number): PublicDveReading {
  const v = r.volatility, s = r.signal, inv = r.invalidation, pr = r.projection, b = r.breakout, t = r.trap;
  const idle = !(s.type !== 'none' && s.active) && s.state !== 'armed';
  const base: Omit<PublicDveReading, 'summary'> = {
    contract: PUBLIC_DVE_CONTRACT,
    symbol: r.symbol, timestamp: r.timestamp, label: r.label,
    volatility: {
      bbwp: v.bbwp, bbwpSma5: v.bbwpSma5, regime: v.regime, rateOfChange: v.rateOfChange, rateSmoothed: v.rateSmoothed, acceleration: v.acceleration, rateDirection: v.rateDirection,
      inSqueeze: v.inSqueeze, squeezeStrength: v.squeezeStrength,
      ...(num(v.atr) != null ? { atr: v.atr } : {}), ...(v.extremeAlert !== undefined ? { extremeAlert: v.extremeAlert } : {}),
      ...(v.bbwpBasis ? { bbwpBasis: { available: v.bbwpBasis.available, window: v.bbwpBasis.window, lookback: v.bbwpBasis.lookback, fullYear: v.bbwpBasis.fullYear } } : {}),
    },
    phasePersistence: {
      contraction: { active: r.phasePersistence.contraction.active, stats: stats(r.phasePersistence.contraction.stats) },
      expansion: { active: r.phasePersistence.expansion.active, stats: stats(r.phasePersistence.expansion.stats) },
    },
    signal: {
      type: s.type, state: s.state, active: s.active,
      ...(num(s.triggerBarPrice) != null ? { triggerBarPrice: s.triggerBarPrice } : {}), ...(num(s.triggerBarOpen) != null ? { triggerBarOpen: s.triggerBarOpen } : {}),
      ...(num(s.triggerBarHigh) != null ? { triggerBarHigh: s.triggerBarHigh } : {}), ...(num(s.triggerBarLow) != null ? { triggerBarLow: s.triggerBarLow } : {}),
      triggerReason: observations(s.triggerReason),
      conditions: idle ? idleConditions(r) : null,
    },
    invalidation: {
      invalidated: inv.invalidated, invalidationMode: inv.invalidationMode,
      ...(num(inv.phaseInvalidation) != null ? { phaseInvalidation: inv.phaseInvalidation } : {}), ...(num(inv.smoothedPhaseInvalidation) != null ? { smoothedPhaseInvalidation: inv.smoothedPhaseInvalidation } : {}),
      ruleSet: (inv.ruleSet ?? []).filter((x) => typeof x === 'string' && /^BBWP/.test(x)),
    },
    projection: {
      signalType: pr.signalType, sampleSize: pr.sampleSize, expectedMovePct: pr.expectedMovePct, medianMovePct: pr.medianMovePct, dispersionPct: pr.dispersionPct,
      maxHistoricalMovePct: pr.maxHistoricalMovePct, averageBarsToMove: pr.averageBarsToMove,
      casesInDirection: pr.sampleSize > 0 && Number.isFinite(pr.hitRate) ? Math.round((pr.hitRate / 100) * pr.sampleSize) : null,
      projectionWarning: pr.projectionWarning ?? '',
    },
    breakout: {
      conditions: { volCompression: b.components.volCompression > 0, timeAlignment: b.components.timeAlignment > 0, gammaWall: b.components.gammaWall > 0, adxRising: b.components.adxRising >= 7 },
      details: observations(b.componentDetails),
    },
    trap: { detected: t.detected, candidate: t.candidate, observations: observations(t.components), bbwpAtCheck: t.compressionLevel, gammaLockDetected: t.gammaLockDetected, timeClusterApproaching: t.timeClusterApproaching },
    exhaustion: { label: r.exhaustion.label, signals: observations(r.exhaustion.signals) },
    regime: { current: r.transition.from, observation: publicObservation(r.transition.trigger) ?? '' },
    flags: r.flags.filter((f): f is PublicDveFlag => PUBLIC_FLAGS.has(f)),
    dataQuality: { coverage: r.dataQuality.score, missing: [...r.dataQuality.missing], warnings: [...r.dataQuality.warnings] },
  };
  return { ...base, summary: publicDveSummary(base, forwardBars) };
}
