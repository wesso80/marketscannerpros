/**
 * Shared analytical terminology and the probability-honest presentation standard.
 *
 * This module is the single vocabulary for MarketScanner Pros' educational
 * market-analysis surfaces. It deliberately encodes the platform's core
 * principles as code:
 *
 *   1. Composite scores are NOT statistical probabilities and must never be
 *      presented as such (see formatCompositeScore / COMPOSITE_SCORE_NOTE).
 *   2. User-facing output describes market conditions and evidence — it never
 *      issues personalised buy/sell/hold instructions (see PROHIBITED_PHRASES /
 *      findProhibitedLanguage).
 *   3. Data provenance (live / delayed / stale / estimated / simulated) is
 *      always expressible (see FreshnessLevel).
 *
 * It is pure and dependency-free so it can be unit-tested and reused by any
 * server or client surface.
 */

/** Educational directional descriptor. Aligns with the v2 `Bias` union
 *  ('bullish' | 'bearish' | 'neutral') and extends it with 'mixed'/'unknown'
 *  so a surface can honestly say "conflicting" or "insufficient evidence". */
export type AnalyticalStance = 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'unknown';

/** Qualitative reliability of an analytical conclusion. */
export type EvidenceQualityLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';

/** Data provenance/recency for a conclusion's underlying inputs. */
export type FreshnessLevel = 'live' | 'delayed' | 'stale' | 'missing' | 'simulated' | 'unknown';

/** Human-readable, non-instructional labels for a directional stance. */
export const STANCE_LABEL: Record<AnalyticalStance, string> = {
  bullish: 'Bullish evidence',
  bearish: 'Bearish evidence',
  neutral: 'Neutral / balanced evidence',
  mixed: 'Conflicting evidence',
  unknown: 'Insufficient evidence',
};

/** Short freshness labels suitable for badges. */
export const FRESHNESS_LABEL: Record<FreshnessLevel, string> = {
  live: 'Live',
  delayed: 'Delayed',
  stale: 'Stale',
  missing: 'Missing',
  simulated: 'Simulated',
  unknown: 'Unknown',
};

/**
 * The mandatory clarification shown wherever a composite score appears.
 * A composite score is a weighted analytical summary, not a calibrated
 * probability of any market outcome.
 */
export const COMPOSITE_SCORE_NOTE =
  'Composite analytical score (0–100) summarising the weight of current evidence. It is not a statistical probability or a forecast.';

export interface CompositeScoreDisplay {
  /** Rounded 0–100 value. */
  value: number;
  /** Always "Composite Strength" — never "probability" or "likelihood". */
  label: string;
  max: 100;
  /** The probability-honesty clarification. */
  note: string;
}

/**
 * Format a raw composite score for display in a way that cannot reasonably be
 * mistaken for a probability. Clamps to 0–100.
 */
export function formatCompositeScore(score: number): CompositeScoreDisplay {
  const value = Math.max(0, Math.min(100, Math.round(Number.isFinite(score) ? score : 0)));
  return { value, label: 'Composite Strength', max: 100, note: COMPOSITE_SCORE_NOTE };
}

/**
 * Phrases that imply certainty or personalised financial advice. User-facing
 * analytical copy must not contain these. Used by tests and (optionally) a
 * runtime guard on generated text. Matched case-insensitively on word
 * boundaries where sensible.
 */
export const PROHIBITED_PHRASES: readonly string[] = [
  'buy now',
  'sell now',
  'buy signal',
  'sell signal',
  'enter now',
  'exit now',
  'take this trade',
  'guaranteed',
  'will rise',
  'will fall',
  'sure thing',
  "can't lose",
  'cannot lose',
  'easy trade',
  'get rich',
  'risk-free',
  'risk free',
];

/**
 * Return any prohibited phrases found in a piece of user-facing copy.
 * Empty array === compliant. This is intentionally conservative: it flags the
 * exact non-compliant phrases so callers/tests can report them.
 *
 * Note: "high probability" is only prohibited when NOT accompanied by an
 * explicit calibration disclosure, which this simple scanner cannot verify, so
 * probability wording is checked separately by callers that have that context.
 */
export function findProhibitedLanguage(text: string): string[] {
  if (!text) return [];
  const haystack = text.toLowerCase();
  return PROHIBITED_PHRASES.filter((phrase) => haystack.includes(phrase));
}

/** Concise persistent educational disclosure for analytical surfaces. */
export const EDUCATIONAL_DISCLOSURE =
  'MarketScanner Pros provides market data, analytical tools and educational research. It does not provide personalised financial advice.';
