import type { DVEInput, DVEReading, DVESignalState, DVESignalType, RateDirection, VolRegime, ZoneDurationStats } from '@/lib/directionalVolatilityEngine.types';
import { PROJECTION, TRAP, VOL_REGIME } from '@/lib/directionalVolatilityEngine.constants';

/**
 * Public Volatility contract (W3: /api/dve). Built leaf by leaf on the server from the engine reading AND the measured
 * inputs it was computed from; the internal reading is never sent, spread or mutated (it stays cached for the Symbol
 * engine and private consumers).
 *
 * Not public (private heuristic outputs, per the public API acceptance matrix):
 *   - directional pressure (score, confidence, bias, weighted details) and `directionalVolatility`;
 *   - breakout readiness score and label, trap score and its detected / candidate verdicts, exhaustion level and its
 *     LOW…EXTREME label, phase continuation / exit "probabilities", regime confidence, signal strength;
 *   - the next-regime guess, the signal's price stop, the engine summary, score-derived flags;
 *   - the projection's quality score / grade text and hit "rate"; the engine's weighted data-quality "coverage" score;
 *   - the squeeze "strength" (two definitions on different scales feed it).
 * v2 (DVE evidence fixes):
 *   - BBWP that could not be computed is `null` (the engine keeps a mid-range placeholder internally). Everything that
 *     depends on it (regime, rate, phase lengths, BBWP conditions, the recorded rule, the past-case study, compression
 *     checks) is then unavailable and can never read as met.
 *   - Conditions are computed from the measured inputs, not from engine points; an input that was not collected makes
 *     its condition `null` ("not collected"), never `false`. Timeframe closes are not collected by /api/dve.
 *   - Data quality is factual availability per input (what was collected, with counts), not a weighted score.
 *   - The past-case study states its sample size, the dated period searched and the forward window; with fewer than
 *     the minimum cases no statistics are published.
 */
export const PUBLIC_DVE_CONTRACT = 'public-dve-v2' as const;

export type Tri = boolean | null;
export type PublicVolatility = {
  /** null when BBWP could not be computed (too few closes). */
  bbwp: number | null; bbwpSma5: number | null; regime: VolRegime | null;
  rateOfChange: number | null; rateSmoothed: number | null; acceleration: number | null; rateDirection: RateDirection | null;
  squeeze: { inSqueeze: Tri; definition: string };
  atr?: number; extremeAlert?: 'low' | 'high' | null;
  bbwpBasis?: { available: boolean; window: number; lookback: number; fullYear: boolean };
};
export type PublicPhase = { contraction: { active: boolean; stats: ZoneDurationStats }; expansion: { active: boolean; stats: ZoneDurationStats } };
export type SignalCondition = { label: string; met: Tri };
export type SignalConditionGroup = { signalName: string; conditions: SignalCondition[] };
export type PublicSignal = {
  type: DVESignalType; state: DVESignalState; active: boolean;
  triggerBarPrice?: number; triggerBarOpen?: number; triggerBarHigh?: number; triggerBarLow?: number;
  triggerReason: string[];
  /** When no rule is recorded or armed: the rule's measured conditions. The engine-direction condition is not published. */
  conditions: SignalConditionGroup[] | null;
};
export type PublicInvalidation = { invalidated: boolean; invalidationMode: 'extreme' | 'open'; phaseInvalidation?: number; smoothedPhaseInvalidation?: number; ruleSet: string[] };
export type PublicProjection = {
  signalType: DVESignalType;
  /** Past cases with a measured outcome. */
  sampleSize: number; minimumSample: number;
  /** Statistics are published only when sampleSize >= minimumSample. */
  stats: { meanReturnPct: number; medianReturnPct: number; dispersionPct: number; largestMoveInRuleDirectionPct: number; averageBarsToLargestMove: number; casesInDirection: number } | null;
  period: { from: string | null; to: string | null; bars: number; timeframe: string; forwardBars: number } | null;
  note: string;
};
export type BreakoutConditionId = 'volCompression' | 'timeAlignment' | 'gammaWall' | 'adxRising';
export type PublicBreakout = { conditions: Record<BreakoutConditionId, Tri>; details: string[] };
export type PinnedCompressionId = 'compressed' | 'nearLargeOiStrike' | 'timeframeClosesClustered';
export type PublicPinnedCompression = { conditions: Record<PinnedCompressionId, Tri>; observations: string[] };
export type PublicStretch = { observations: string[] };
export type InputAvailability = { input: string; status: 'collected' | 'partial' | 'not collected' | 'not applicable'; detail: string };

export interface PublicDveReading {
  contract: typeof PUBLIC_DVE_CONTRACT;
  symbol: string; timestamp: number; label: string; summary: string;
  volatility: PublicVolatility;
  /** null when BBWP is unavailable (phase lengths come from the BBWP series). */
  phasePersistence: PublicPhase | null;
  signal: PublicSignal;
  invalidation: PublicInvalidation;
  projection: PublicProjection;
  breakout: PublicBreakout;
  /** Compression next to a large open-interest strike (the engine's "trap" inputs), as conditions; no verdict. */
  pinnedCompression: PublicPinnedCompression;
  /** Stretch observations (the engine's "exhaustion" inputs) without its points or LOW…EXTREME label. */
  stretch: PublicStretch;
  regime: { current: VolRegime | null; observation: string };
  availability: { inputs: InputAvailability[]; warnings: string[] };
}

export type PublicDveContext = {
  forwardBars?: number;
  /** The measured inputs the reading was computed from (conditions are read from these, not from engine points). */
  input?: DVEInput | null;
  /** Session dates of the closes, oldest first, and the bar timeframe. */
  history?: { dates?: string[] | null; timeframe: string } | null;
  assetClass?: 'equity' | 'crypto' | 'forex';
};

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
const fin = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const SQUEEZE_DEFINITION = 'Bollinger bands (20, 2) inside Keltner channels (20, 1.5 × ATR); when that cannot be computed, Bollinger width under 6% of its middle band.';

/** True when BBWP was actually computed for this reading. */
export function bbwpMeasured(r: Pick<DVEReading, 'volatility' | 'dataQuality'>): boolean {
  const basis = r.volatility.bbwpBasis;
  if (basis) return basis.available;
  return !r.dataQuality.missing.includes('bbwp');
}

/** The signal rule's measured conditions while idle. The engine-direction agreement is part of the rule but is not published. */
function idleConditions(r: DVEReading, measured: boolean, input: DVEInput | null | undefined): SignalConditionGroup[] {
  const v = r.volatility;
  const b = (ok: boolean): Tri => (measured ? ok : null);
  const bbwpText = measured ? v.bbwp.toFixed(1) : 'not available';
  const smaText = measured ? v.bbwpSma5.toFixed(1) : 'not available';
  const stochKnown = input ? input.indicators?.stochK != null && input.indicators?.stochD != null : true;
  const stoch = r.direction.components.stochasticMomentum;
  const rising: Tri = stochKnown ? stoch > 0 : null, falling: Tri = stochKnown ? stoch < 0 : null;
  const notStretched: SignalCondition = { label: 'Stretch observations below the rule limit', met: r.exhaustion.label !== 'HIGH' && r.exhaustion.label !== 'EXTREME' };
  const release = [
    { label: `Recent compression (BBWP ≤ ${VOL_REGIME.COMPRESSION_THRESHOLD})`, met: b(v.bbwp <= VOL_REGIME.COMPRESSION_THRESHOLD) },
    { label: `BBWP breaks above ${VOL_REGIME.COMPRESSION_THRESHOLD} (now ${bbwpText})`, met: b(v.bbwp > VOL_REGIME.COMPRESSION_THRESHOLD) },
    { label: 'BBWP above its 5-bar mean, or accelerating', met: b(v.bbwp > v.bbwpSma5 || v.rateDirection === 'accelerating') },
  ];
  const climax = [
    { label: `BBWP ≥ 85 (now ${bbwpText})`, met: b(v.bbwp >= 85) },
    { label: `BBWP 5-bar mean ≥ 85 (now ${smaText})`, met: b(v.bbwpSma5 >= 85) },
  ];
  return [
    { signalName: 'Compression release (up)', conditions: [...release, { label: 'Stochastic momentum rising', met: rising }] },
    { signalName: 'Compression release (down)', conditions: [...release, { label: 'Stochastic momentum falling', met: falling }] },
    { signalName: 'Expansion continuation (up)', conditions: [...climax, { label: 'Stochastic momentum rising', met: rising }, notStretched] },
    { signalName: 'Expansion continuation (down)', conditions: [...climax, { label: 'Stochastic momentum falling', met: falling }, notStretched] },
  ];
}

/** Breakout setting conditions from the measured inputs. A condition whose input was not collected is null. */
function breakoutFrom(r: DVEReading, measured: boolean, input: DVEInput | null | undefined): PublicBreakout {
  const v = r.volatility, details: string[] = [];
  const squeeze: Tri = input ? (input.indicators ? !!input.indicators.inSqueeze : null) : v.inSqueeze;
  const lowBbwp: Tri = measured ? v.bbwp < 35 : null;
  const volCompression: Tri = lowBbwp === true || squeeze === true ? true : lowBbwp === null || squeeze === null ? null : false;
  if (measured) details.push(`BBWP ${v.bbwp.toFixed(1)}`); else details.push('BBWP not available');
  details.push(squeeze === null ? 'Squeeze not collected' : squeeze ? 'Squeeze present' : 'No squeeze');
  const price = fin(input?.price?.currentPrice), maxPain = fin(input?.options?.maxPain);
  const unusual = input?.options?.unusualActivity === 'Very High' || input?.options?.unusualActivity === 'Elevated';
  let gammaWall: Tri;
  if (!input) gammaWall = r.breakout.components.gammaWall > 0;
  else if (!input.options) gammaWall = null;
  else if (price && price > 0 && maxPain != null) {
    const dist = Math.abs(price - maxPain) / price * 100;
    gammaWall = dist < 2 || unusual;
    details.push(`${dist.toFixed(1)}% from the max-pain strike ${maxPain}`);
  } else gammaWall = unusual ? true : null;
  const adx = input ? fin(input.indicators?.adx) : null;
  const adxRising: Tri = input ? (adx == null ? null : adx <= 25) : r.breakout.components.adxRising >= 7;
  if (adx != null) details.push(`ADX ${adx.toFixed(0)}`);
  return { conditions: { volCompression, timeAlignment: null, gammaWall, adxRising }, details };
}

/** Distance (%) from the nearest large open-interest strike (max pain, highest call or put OI); null when not collected. */
function nearestOiStrikePct(input: DVEInput | null | undefined): number | null {
  const price = fin(input?.price?.currentPrice);
  const o = input?.options;
  if (!o || !price || price <= 0) return null;
  const strikes = [o.maxPain, o.highestOICallStrike, o.highestOIPutStrike].map(fin).filter((x): x is number => x != null && x > 0);
  if (!strikes.length) return null;
  return Math.min(...strikes.map((k) => Math.abs(k - price) / price * 100));
}

function pinnedFrom(r: DVEReading, measured: boolean, input: DVEInput | null | undefined): PublicPinnedCompression {
  const compressed: Tri = measured ? r.volatility.bbwp < 20 : null;
  const near = input ? nearestOiStrikePct(input) : null;
  const nearLargeOiStrike: Tri = input ? (near == null ? null : near < TRAP.GAMMA_PROXIMITY_PCT) : r.trap.gammaLockDetected;
  const obs: string[] = [];
  if (measured) obs.push(`BBWP ${r.volatility.bbwp.toFixed(1)} (compressed below 20)`);
  if (near != null) obs.push(`Nearest large open-interest strike ${near.toFixed(1)}% from price (near below ${TRAP.GAMMA_PROXIMITY_PCT}%)`);
  return { conditions: { compressed, nearLargeOiStrike, timeframeClosesClustered: null }, observations: obs };
}

function availabilityFrom(r: DVEReading, input: DVEInput | null | undefined, assetClass: PublicDveContext['assetClass'], timeframe: string, measured: boolean): PublicDveReading['availability'] {
  const inputs: InputAvailability[] = [];
  const closes = input?.price?.closes?.length ?? null;
  const basis = r.volatility.bbwpBasis;
  inputs.push({ input: 'Price history', status: closes == null ? 'collected' : closes > 0 ? 'collected' : 'not collected', detail: closes == null ? `${timeframe} closes` : `${closes} ${timeframe} closes` });
  inputs.push({ input: 'BBWP', status: !measured ? 'not collected' : basis && !basis.fullYear ? 'partial' : 'collected',
    detail: !measured ? 'Too few closes to compute a band width' : basis && !basis.fullYear ? `Ranked over ${basis.window} band widths, not a full year (${basis.lookback})` : `Ranked over ${basis?.window ?? 'a full year of'} band widths` });
  const ind = input ? input.indicators : undefined;
  const indMissing = input ? (['stochK', 'stochD', 'adx', 'atr'] as const).filter((k) => ind?.[k] == null) : r.dataQuality.missing.filter((m) => ['stochK', 'stochD', 'adx', 'atr'].includes(m));
  const noIndicators = input ? !ind : r.dataQuality.missing.includes('indicators');
  inputs.push({ input: 'Indicators (stochastic, ADX, ATR)', status: noIndicators ? 'not collected' : indMissing.length ? 'partial' : 'collected', detail: noIndicators ? 'Indicator feed returned nothing' : indMissing.length ? `Not collected: ${indMissing.join(', ')}` : 'Stochastic %K/%D, ADX and ATR collected' });
  const optsApplies = assetClass ? assetClass === 'equity' : true;
  const hasOpts = input ? !!input.options : !r.dataQuality.missing.includes('options');
  inputs.push({ input: 'Options chain', status: !optsApplies ? 'not applicable' : hasOpts ? 'collected' : 'not collected', detail: !optsApplies ? 'Options are used for equities only' : hasOpts ? 'Max pain and largest open-interest strikes' : 'No usable chain for this expiry' });
  const liqApplies = assetClass ? assetClass === 'crypto' : true;
  const hasLiq = input ? !!input.liquidity : !r.dataQuality.missing.includes('liquidity');
  inputs.push({ input: 'Funding and open interest', status: !liqApplies ? 'not applicable' : hasLiq ? 'collected' : 'not collected', detail: !liqApplies ? 'Perpetual funding applies to crypto only' : hasLiq ? 'Aggregated funding rate and open interest' : 'Not collected' });
  inputs.push({ input: 'Timeframe closes', status: 'not collected', detail: 'Not collected by this endpoint; conditions that need it read "not collected"' });
  const warnings = [...r.dataQuality.warnings].filter((w) => typeof w === 'string');
  return { inputs, warnings };
}

function projectionFrom(r: DVEReading, measured: boolean, forwardBars: number, history: PublicDveContext['history'], closes: number | null): PublicProjection {
  const pr = r.projection, min = PROJECTION.MIN_SAMPLE_SIZE;
  const signalType: DVESignalType = measured ? pr.signalType : 'none';
  const dates = history?.dates ?? null;
  const period = signalType === 'none' ? null : {
    from: dates?.[0] ?? null, to: dates?.[dates.length - 1] ?? null,
    bars: closes ?? dates?.length ?? 0, timeframe: history?.timeframe ?? 'daily', forwardBars,
  };
  const enough = signalType !== 'none' && pr.sampleSize >= min && pr.projectionQuality !== 'unavailable';
  const note = signalType === 'none'
    ? 'No recorded rule, so no past-case study.'
    : enough
      ? `In-sample past cases on this symbol's own history: each bar where the rule's BBWP event occurred, and the close ${forwardBars} bars later. Windows can overlap and the event is simpler than the full rule. Describes the past; not a forecast or a win rate.`
      : `Too few past cases (${pr.sampleSize} of the ${min} needed), so no statistics are shown.`;
  return {
    signalType, sampleSize: signalType === 'none' ? 0 : pr.sampleSize, minimumSample: min,
    stats: enough ? {
      meanReturnPct: pr.expectedMovePct, medianReturnPct: pr.medianMovePct, dispersionPct: pr.dispersionPct,
      largestMoveInRuleDirectionPct: pr.maxHistoricalMovePct, averageBarsToLargestMove: pr.averageBarsToMove,
      casesInDirection: Math.round((pr.hitRate / 100) * pr.sampleSize),
    } : null,
    period, note,
  };
}

export function publicDveSummary(p: Omit<PublicDveReading, 'summary'>): string {
  const v = p.volatility, parts: string[] = [];
  parts.push(v.bbwp == null
    ? `${p.symbol} BBWP not available (too few closes).`
    : `${p.symbol} BBWP at ${v.bbwp.toFixed(1)} (${v.regime})${v.bbwpBasis && !v.bbwpBasis.fullYear ? `, ranked over ${v.bbwpBasis.window} band widths rather than a full year` : ''}.`);
  const ph = p.phasePersistence?.contraction.active ? ['Contraction', p.phasePersistence.contraction.stats] as const : p.phasePersistence?.expansion.active ? ['Expansion', p.phasePersistence.expansion.stats] as const : null;
  if (ph) parts.push(`${ph[0]} phase ${ph[1].currentBars} bars long; ${ph[1].agePercentile.toFixed(0)}% of earlier ${ph[0].toLowerCase()} phases were this long or shorter.`);
  if (p.signal.active && p.signal.type !== 'none') {
    const t = p.signal.type.replace(/_/g, ' ');
    parts.push(`${t.charAt(0).toUpperCase() + t.slice(1)} rule recorded on the latest closed bar.`);
    const pr = p.projection, s = pr.stats;
    if (s && pr.period) parts.push(`In ${pr.sampleSize} past cases (${pr.period.timeframe} bars ${pr.period.from ?? '?'} to ${pr.period.to ?? '?'}), the close ${pr.period.forwardBars} bars later moved ${s.meanReturnPct > 0 ? '+' : ''}${s.meanReturnPct}% on average; ${s.casesInDirection} of ${pr.sampleSize} moved in the rule's direction. In-sample history, not a forecast.`);
  }
  return parts.join(' ');
}

export function toPublicDveReading(r: DVEReading, ctx: PublicDveContext | number = {}): PublicDveReading {
  const c: PublicDveContext = typeof ctx === 'number' ? { forwardBars: ctx } : ctx;
  const forwardBars = c.forwardBars ?? PROJECTION.FORWARD_BARS, input = c.input, timeframe = c.history?.timeframe ?? 'daily';
  const measured = bbwpMeasured(r);
  const v = r.volatility, inv = r.invalidation;
  // A rule computed from the BBWP placeholder is not a recorded event.
  const s = measured ? r.signal : { ...r.signal, type: 'none' as const, state: 'idle' as const, active: false, triggerReason: [] };
  const idle = !(s.type !== 'none' && s.active) && s.state !== 'armed';
  const squeeze: Tri = input ? (input.indicators ? !!input.indicators.inSqueeze : null) : v.inSqueeze;
  const base: Omit<PublicDveReading, 'summary'> = {
    contract: PUBLIC_DVE_CONTRACT,
    symbol: r.symbol, timestamp: r.timestamp, label: measured ? r.label : 'BBWP not available',
    volatility: {
      bbwp: measured ? v.bbwp : null, bbwpSma5: measured ? v.bbwpSma5 : null, regime: measured ? v.regime : null,
      rateOfChange: measured ? v.rateOfChange : null, rateSmoothed: measured ? v.rateSmoothed : null, acceleration: measured ? v.acceleration : null, rateDirection: measured ? v.rateDirection : null,
      squeeze: { inSqueeze: squeeze, definition: SQUEEZE_DEFINITION },
      ...(num(v.atr) != null ? { atr: v.atr } : {}), ...(measured && v.extremeAlert !== undefined ? { extremeAlert: v.extremeAlert } : {}),
      ...(v.bbwpBasis ? { bbwpBasis: { available: v.bbwpBasis.available, window: v.bbwpBasis.window, lookback: v.bbwpBasis.lookback, fullYear: v.bbwpBasis.fullYear } } : {}),
    },
    phasePersistence: measured ? {
      contraction: { active: r.phasePersistence.contraction.active, stats: stats(r.phasePersistence.contraction.stats) },
      expansion: { active: r.phasePersistence.expansion.active, stats: stats(r.phasePersistence.expansion.stats) },
    } : null,
    signal: {
      type: s.type, state: s.state, active: s.active,
      ...(num(s.triggerBarPrice) != null ? { triggerBarPrice: s.triggerBarPrice } : {}), ...(num(s.triggerBarOpen) != null ? { triggerBarOpen: s.triggerBarOpen } : {}),
      ...(num(s.triggerBarHigh) != null ? { triggerBarHigh: s.triggerBarHigh } : {}), ...(num(s.triggerBarLow) != null ? { triggerBarLow: s.triggerBarLow } : {}),
      triggerReason: observations(s.triggerReason),
      conditions: idle ? idleConditions(r, measured, input) : null,
    },
    invalidation: measured ? {
      invalidated: inv.invalidated, invalidationMode: inv.invalidationMode,
      ...(num(inv.phaseInvalidation) != null ? { phaseInvalidation: inv.phaseInvalidation } : {}), ...(num(inv.smoothedPhaseInvalidation) != null ? { smoothedPhaseInvalidation: inv.smoothedPhaseInvalidation } : {}),
      ruleSet: (inv.ruleSet ?? []).filter((x) => typeof x === 'string' && /^BBWP/.test(x)),
    } : { invalidated: false, invalidationMode: inv.invalidationMode, ruleSet: [] },
    projection: projectionFrom(r, measured, forwardBars, c.history, input?.price?.closes?.length ?? null),
    breakout: breakoutFrom(r, measured, input),
    pinnedCompression: pinnedFrom(r, measured, input),
    stretch: { observations: observations(r.exhaustion.signals).filter((o) => measured || !/BBWP/.test(o)) },
    regime: { current: measured ? r.transition.from : null, observation: measured ? publicObservation(r.transition.trigger) ?? '' : '' },
    availability: availabilityFrom(r, input, c.assetClass, timeframe, measured),
  };
  return { ...base, summary: publicDveSummary(base) };
}

/** Thresholds the page quotes in definitions. */
export const PUBLIC_DVE_THRESHOLDS = { compression: VOL_REGIME.COMPRESSION_THRESHOLD, climax: VOL_REGIME.CLIMAX_THRESHOLD, pinnedProximityPct: TRAP.GAMMA_PROXIMITY_PCT } as const;
