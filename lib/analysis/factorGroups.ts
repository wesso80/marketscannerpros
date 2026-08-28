/**
 * Independent factor grouping and analytical confluence.
 *
 * The professional-trader review identified a false-confidence hazard: four
 * trend indicators (EMA, MACD, ADX, Aroon) that all derive from the same price
 * trend are counted as four independent pieces of evidence, inflating apparent
 * confluence. This module fixes that by collapsing many correlated indicators
 * into a small set of INDEPENDENT factor groups, and summarising agreement
 * across those groups — never across raw indicators.
 *
 * Output is descriptive and probability-honest: it reports how many independent
 * factor groups are available and how they lean, not a "probability of a move".
 *
 * Pure and dependency-free (imports types only) for easy testing/reuse.
 */

import type { AnalyticalStance } from './terminology';

/** The independent analytical factor groups. Indicators within a group are
 *  treated as one piece of evidence, not many. */
export type FactorGroup =
  | 'TREND'
  | 'MOMENTUM'
  | 'VOLUME'
  | 'VOLATILITY'
  | 'RELATIVE_STRENGTH'
  | 'MARKET_STRUCTURE'
  | 'POSITIONING'
  | 'REGIME'
  | 'MACRO'
  | 'CATALYST';

export const FACTOR_GROUP_LABEL: Record<FactorGroup, string> = {
  TREND: 'Trend',
  MOMENTUM: 'Momentum',
  VOLUME: 'Volume / Participation',
  VOLATILITY: 'Volatility',
  RELATIVE_STRENGTH: 'Relative Strength',
  MARKET_STRUCTURE: 'Market Structure',
  POSITIONING: 'Positioning',
  REGIME: 'Regime',
  MACRO: 'Macro / Cross-asset',
  CATALYST: 'Catalyst',
};

/** Directional lean of a single factor group. Distinct from `AnalyticalStance`
 *  because a group is either available with a direction, or not available. */
export type FactorSignal = 'bullish' | 'bearish' | 'neutral' | 'unknown';

export interface FactorAssessment {
  group: FactorGroup;
  /** Directional lean of this independent factor group. */
  signal: FactorSignal;
  /** Optional caution flag (e.g. elevated event/catalyst risk) — orthogonal to
   *  direction. A group can be directionally neutral yet flagged caution. */
  caution?: boolean;
  /** Optional short educational note explaining the assessment. */
  note?: string;
}

/**
 * Which factor group each common indicator belongs to. Consumers use this to
 * collapse a bag of per-indicator signals into one signal per group, so
 * correlated indicators are not double-counted.
 */
export const INDICATOR_FACTOR_GROUP: Record<string, FactorGroup> = {
  ema: 'TREND', ema9: 'TREND', ema20: 'TREND', ema50: 'TREND', ema200: 'TREND',
  sma: 'TREND', sma20: 'TREND', sma50: 'TREND', sma200: 'TREND',
  macd: 'TREND', adx: 'TREND', aroon: 'TREND', ichimoku: 'TREND', supertrend: 'TREND',
  rsi: 'MOMENTUM', stoch: 'MOMENTUM', stochastic: 'MOMENTUM', cci: 'MOMENTUM', roc: 'MOMENTUM', mfi: 'MOMENTUM',
  obv: 'VOLUME', vwap: 'VOLUME', volume: 'VOLUME', volumeRatio: 'VOLUME', relativeVolume: 'VOLUME',
  bbwp: 'VOLATILITY', atr: 'VOLATILITY', dve: 'VOLATILITY', bollinger: 'VOLATILITY',
  relativeStrength: 'RELATIVE_STRENGTH', rs: 'RELATIVE_STRENGTH',
  funding: 'POSITIONING', openInterest: 'POSITIONING', oi: 'POSITIONING', liquidations: 'POSITIONING',
  regime: 'REGIME', dxy: 'MACRO', vix: 'MACRO', yields: 'MACRO',
  earnings: 'CATALYST', event: 'CATALYST',
};

/** Reduce a list of per-indicator signals into one `FactorAssessment` per group
 *  (majority vote within the group; ties → neutral). Unknown indicator keys are
 *  ignored. This is the concrete anti-double-counting step. */
export function collapseIndicatorsToFactors(
  indicators: Array<{ key: string; signal: FactorSignal }>,
): FactorAssessment[] {
  const byGroup = new Map<FactorGroup, { bull: number; bear: number; neutral: number }>();
  for (const { key, signal } of indicators) {
    const group = INDICATOR_FACTOR_GROUP[key];
    if (!group || signal === 'unknown') continue;
    const tally = byGroup.get(group) ?? { bull: 0, bear: 0, neutral: 0 };
    if (signal === 'bullish') tally.bull++;
    else if (signal === 'bearish') tally.bear++;
    else tally.neutral++;
    byGroup.set(group, tally);
  }
  const result: FactorAssessment[] = [];
  for (const [group, t] of byGroup) {
    let signal: FactorSignal;
    if (t.bull > t.bear) signal = 'bullish';
    else if (t.bear > t.bull) signal = 'bearish';
    else signal = 'neutral';
    result.push({ group, signal });
  }
  return result;
}

export type ConfluenceAgreement =
  | 'strong'
  | 'moderate'
  | 'weak'
  | 'conflicting'
  | 'insufficient';

export interface ConfluenceSummary {
  /** Dominant educational stance across independent factor groups. */
  dominant: AnalyticalStance;
  /** Number of independent factor groups that provided a usable signal. */
  independentFactors: number;
  /** Groups agreeing with the dominant direction. */
  supportive: number;
  /** Groups opposing the dominant direction. */
  opposing: number;
  /** Groups that are directionally neutral. */
  neutral: number;
  /** Groups flagged with caution (e.g. elevated event risk). */
  cautions: number;
  /** Descriptive agreement level — NOT a probability. */
  agreement: ConfluenceAgreement;
  /** One-line educational summary. */
  summary: string;
}

/**
 * Summarise agreement across INDEPENDENT factor groups.
 *
 * @param assessments one assessment per factor group (already collapsed).
 * @param reference optional reference direction to evaluate support against;
 *   when omitted the dominant direction is derived from the assessments.
 */
export function summarizeConfluence(
  assessments: FactorAssessment[],
  reference?: 'bullish' | 'bearish',
): ConfluenceSummary {
  // De-duplicate to one assessment per group (defensive; callers should already
  // pass one per group). Last write wins.
  const perGroup = new Map<FactorGroup, FactorAssessment>();
  for (const a of assessments) perGroup.set(a.group, a);
  const unique = [...perGroup.values()];

  const directional = unique.filter((a) => a.signal === 'bullish' || a.signal === 'bearish');
  const bull = directional.filter((a) => a.signal === 'bullish').length;
  const bear = directional.filter((a) => a.signal === 'bearish').length;
  const neutral = unique.filter((a) => a.signal === 'neutral').length;
  const cautions = unique.filter((a) => a.caution).length;
  const independentFactors = unique.filter((a) => a.signal !== 'unknown').length;

  // Derive dominant direction.
  let dominant: AnalyticalStance;
  if (independentFactors < 2) dominant = 'unknown';
  else if (reference) dominant = reference;
  else if (bull > bear) dominant = 'bullish';
  else if (bear > bull) dominant = 'bearish';
  else if (bull === 0 && bear === 0) dominant = 'neutral';
  else dominant = 'mixed';

  const supportive =
    dominant === 'bullish' ? bull : dominant === 'bearish' ? bear : 0;
  const opposing =
    dominant === 'bullish' ? bear : dominant === 'bearish' ? bull : 0;

  // Agreement is descriptive, based on independent-factor coverage and the
  // margin of support over opposition — never a probability.
  let agreement: ConfluenceAgreement;
  if (independentFactors < 2) {
    agreement = 'insufficient';
  } else if (dominant === 'mixed' || (supportive > 0 && opposing >= supportive)) {
    agreement = 'conflicting';
  } else if (supportive >= 4 && opposing === 0) {
    agreement = 'strong';
  } else if (supportive >= 2 && opposing <= 1) {
    agreement = 'moderate';
  } else {
    agreement = 'weak';
  }

  const summary = buildSummary(dominant, supportive, opposing, neutral, cautions, independentFactors, agreement);
  return { dominant, independentFactors, supportive, opposing, neutral, cautions, agreement, summary };
}

function buildSummary(
  dominant: AnalyticalStance,
  supportive: number,
  opposing: number,
  neutral: number,
  cautions: number,
  independentFactors: number,
  agreement: ConfluenceAgreement,
): string {
  if (agreement === 'insufficient') {
    return `Insufficient evidence: only ${independentFactors} independent factor group${independentFactors === 1 ? '' : 's'} available.`;
  }
  const dir =
    dominant === 'bullish' ? 'bullish' : dominant === 'bearish' ? 'bearish' : dominant === 'mixed' ? 'conflicting' : 'neutral';
  const cautionNote = cautions > 0 ? ` ${cautions} caution flag${cautions === 1 ? '' : 's'}.` : '';
  return `${agreement[0].toUpperCase()}${agreement.slice(1)} ${dir} evidence across ${independentFactors} independent factor groups (${supportive} supportive, ${opposing} opposing, ${neutral} neutral).${cautionNote}`;
}
