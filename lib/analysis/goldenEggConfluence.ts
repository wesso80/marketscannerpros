/**
 * Golden Egg → analytical confluence adapter (Stage 3).
 *
 * Turns Golden Egg's per-domain verdicts and composite score into a
 * probability-honest confluence summary built from INDEPENDENT factor groups
 * (Stage 1). This is what makes the score transparent: instead of one opaque
 * "confluenceScore", the user sees which independent factors agree, disagree,
 * or are neutral, plus an evidence-quality grade — and the score is explicitly
 * labelled a composite strength, not a probability.
 *
 * Pure and testable: it accepts a structural input (not the full 200-line
 * GoldenEggPayload) so the mapping can be unit-tested without a large mock. The
 * presentational component extracts these fields from the payload.
 */

import {
  formatCompositeScore,
  type CompositeScoreDisplay,
} from './terminology';
import {
  summarizeConfluence,
  type FactorAssessment,
  type FactorSignal,
  type ConfluenceSummary,
} from './factorGroups';
import {
  assessEvidenceQuality,
  type EvidenceQualityResult,
} from './evidenceQuality';
import type { FreshnessLevel } from './terminology';

export type EggVerdict = 'agree' | 'disagree' | 'neutral' | 'unknown';
export type EggDirection = 'LONG' | 'SHORT' | 'NEUTRAL';
export type EggBias = 'bullish' | 'bearish' | 'neutral';

/** The subset of Golden Egg data the confluence view needs. */
export interface GoldenEggConfluenceInput {
  direction: EggDirection;
  /** Golden Egg's composite confluence score (0–100). */
  confluenceScore: number;
  /** Golden Egg's confidence (0–100) — used only to describe, never as probability. */
  confidence: number;
  /** ISO timestamp the analysis was produced. */
  asOfTs?: string;
  structureVerdict?: EggVerdict;
  momentumVerdict?: EggVerdict;
  /** Options layer verdict, or null/undefined when the options layer is disabled. */
  optionsVerdict?: EggVerdict | null;
  /** Internals (participation) verdict, or null/undefined when disabled. */
  internalsVerdict?: EggVerdict | null;
  /** Time-confluence directional lean, or null/undefined when disabled. */
  timeConfluenceDirection?: EggBias | null;
  /** Directional volatility bias (DVE), if available. */
  volatilityBias?: EggBias;
  /** Raise a caution flag on the volatility factor (e.g. trap/exhaustion risk). */
  volatilityCaution?: boolean;
}

export interface GoldenEggConfluenceResult {
  composite: CompositeScoreDisplay;
  confluence: ConfluenceSummary;
  evidence: EvidenceQualityResult;
  factors: FactorAssessment[];
  referenceDirection: EggBias;
}

function referenceOf(direction: EggDirection): 'bullish' | 'bearish' | undefined {
  if (direction === 'LONG') return 'bullish';
  if (direction === 'SHORT') return 'bearish';
  return undefined;
}

/** Convert an agree/disagree/neutral verdict (relative to the overall
 *  direction) into an absolute directional signal. */
function verdictToSignal(verdict: EggVerdict | null | undefined, direction: EggDirection): FactorSignal {
  if (verdict == null || verdict === 'unknown') return 'unknown';
  if (verdict === 'neutral') return 'neutral';
  const agree: FactorSignal = direction === 'SHORT' ? 'bearish' : 'bullish';
  const disagree: FactorSignal = direction === 'SHORT' ? 'bullish' : 'bearish';
  return verdict === 'agree' ? agree : disagree;
}

function biasToSignal(bias: EggBias | null | undefined): FactorSignal {
  if (bias === 'bullish') return 'bullish';
  if (bias === 'bearish') return 'bearish';
  if (bias === 'neutral') return 'neutral';
  return 'unknown';
}

/** Derive a freshness level from an ISO timestamp (lenient thresholds). */
export function freshnessFromTimestamp(asOfTs?: string, now: number = Date.now()): FreshnessLevel {
  if (!asOfTs) return 'unknown';
  const t = Date.parse(asOfTs);
  if (Number.isNaN(t)) return 'unknown';
  const ageMs = now - t;
  if (ageMs < 0) return 'live';
  if (ageMs > 24 * 60 * 60 * 1000) return 'stale';
  if (ageMs > 60 * 60 * 1000) return 'delayed';
  return 'live';
}

/**
 * Build the analytical confluence view from Golden Egg data.
 * The total number of possible independent factor groups Golden Egg can report
 * is six: structure, momentum, volatility, positioning (options), participation
 * (internals), and catalyst/time.
 */
const TOTAL_GOLDEN_EGG_FACTORS = 6;

export function buildGoldenEggConfluence(input: GoldenEggConfluenceInput): GoldenEggConfluenceResult {
  const factors: FactorAssessment[] = [];

  const structure = verdictToSignal(input.structureVerdict, input.direction);
  if (structure !== 'unknown') factors.push({ group: 'MARKET_STRUCTURE', signal: structure });

  const momentum = verdictToSignal(input.momentumVerdict, input.direction);
  if (momentum !== 'unknown') factors.push({ group: 'MOMENTUM', signal: momentum });

  const volatility = biasToSignal(input.volatilityBias);
  if (volatility !== 'unknown') {
    factors.push({ group: 'VOLATILITY', signal: volatility, caution: input.volatilityCaution || undefined });
  }

  const positioning = verdictToSignal(input.optionsVerdict, input.direction);
  if (positioning !== 'unknown') factors.push({ group: 'POSITIONING', signal: positioning });

  const participation = verdictToSignal(input.internalsVerdict, input.direction);
  if (participation !== 'unknown') factors.push({ group: 'VOLUME', signal: participation });

  const catalyst = biasToSignal(input.timeConfluenceDirection);
  if (catalyst !== 'unknown') factors.push({ group: 'CATALYST', signal: catalyst });

  const reference = referenceOf(input.direction);
  const confluence = summarizeConfluence(factors, reference);

  const freshness = freshnessFromTimestamp(input.asOfTs);
  const evidence = assessEvidenceQuality({
    availableFactors: confluence.independentFactors,
    totalFactors: TOTAL_GOLDEN_EGG_FACTORS,
    freshness,
    conflicting: confluence.agreement === 'conflicting',
  });

  return {
    composite: formatCompositeScore(input.confluenceScore),
    confluence,
    evidence,
    factors,
    referenceDirection: input.direction === 'SHORT' ? 'bearish' : input.direction === 'LONG' ? 'bullish' : 'neutral',
  };
}
