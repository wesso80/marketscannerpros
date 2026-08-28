/**
 * Building / Early-interest engine (Stage 4).
 *
 * Market Movers show assets AFTER they have moved. This engine describes assets
 * where activity may be DEVELOPING — participation building while price is still
 * relatively contained — so a user knows what deserves further investigation
 * before it appears among the largest movers.
 *
 * States describe OBSERVABLE market behaviour. They are not trade instructions
 * and are never probabilities. Evidence is grouped (participation, price,
 * volatility, momentum/strength) rather than blended into indicator soup, and
 * missing layers honestly reduce evidence quality.
 *
 * Pure and dependency-light (imports types only) for easy testing/reuse.
 */

import { formatCompositeScore, type CompositeScoreDisplay, type FreshnessLevel } from './terminology';
import { assessEvidenceQuality, type EvidenceQualityResult } from './evidenceQuality';

export type BuildingState = 'DORMANT' | 'BUILDING' | 'EXPANDING' | 'EXTENDED' | 'FADING';

export type VolatilityState = 'compression' | 'emerging' | 'expansion' | 'climax' | 'neutral' | 'unknown';

export interface BuildingSignalInput {
  symbol: string;
  /** Recent price change (%). */
  changePct: number;
  /** Volume relative to a baseline/cohort (1.0 = average). */
  relativeVolume?: number;
  /** Whether volume is accelerating. */
  volumeAccelerating?: boolean;
  /** Volatility phase (e.g. from DVE). */
  volatilityState?: VolatilityState;
  /** Open-interest change (%, crypto). */
  openInterestChangePct?: number;
  /** Funding rate (crypto). */
  fundingRate?: number;
  /** Whether momentum is accelerating. */
  momentumAccelerating?: boolean;
  /** Relative strength trend vs a benchmark. */
  relativeStrength?: 'improving' | 'weakening' | 'flat' | 'unknown';
  /** DVE-style breakout readiness (0–1). */
  breakoutProximity?: number;
  /** Provenance/recency of the inputs. */
  freshness?: FreshnessLevel;
}

export interface BuildingAssessment {
  symbol: string;
  state: BuildingState;
  /** Composite strength of the developing-activity signal (0–100) — NOT a probability. */
  score: CompositeScoreDisplay;
  interpretation: string;
  evidence: EvidenceQualityResult;
}

const CONTAINED_PCT = 3;   // |change| below this is "still contained"
const EXPANDING_PCT = 8;   // |change| between contained and this is "expanding"
// |change| >= EXPANDING_PCT is "already extended"

function isParticipationRising(i: BuildingSignalInput): boolean {
  return (
    (typeof i.relativeVolume === 'number' && i.relativeVolume >= 1.5) ||
    (typeof i.openInterestChangePct === 'number' && i.openInterestChangePct >= 3) ||
    i.volumeAccelerating === true
  );
}

function countAvailableFactors(i: BuildingSignalInput): number {
  let n = 0;
  if (typeof i.relativeVolume === 'number' || i.volumeAccelerating != null) n++; // participation
  if (i.volatilityState && i.volatilityState !== 'unknown') n++;                  // volatility
  if (typeof i.openInterestChangePct === 'number' || typeof i.fundingRate === 'number') n++; // positioning
  if (i.momentumAccelerating != null || (i.relativeStrength && i.relativeStrength !== 'unknown')) n++; // momentum/strength
  if (typeof i.breakoutProximity === 'number') n++;                              // structure
  return n;
}

const INTERPRETATION: Record<BuildingState, string> = {
  DORMANT: 'Little participation and no meaningful expansion. Conditions are quiet; nothing is developing yet.',
  BUILDING: 'Participation is increasing while price remains relatively contained. This combination can be associated with developing directional activity, although confirmation has not yet occurred.',
  EXPANDING: 'Participation and price are expanding together with rising volatility — activity that began developing appears to be underway.',
  EXTENDED: 'A significant move has already occurred alongside elevated volatility. The early-development window has largely passed; treat as mature, not emerging.',
  FADING: 'Participation or momentum is deteriorating after a move. Evidence for continued development is weakening.',
};

/** Classify an asset's developing-activity state from grouped evidence. */
export function classifyBuilding(input: BuildingSignalInput): BuildingAssessment {
  const absChange = Math.abs(input.changePct);
  const participationRising = isParticipationRising(input);
  const priceContained = absChange < CONTAINED_PCT;
  const priceExpanding = absChange >= CONTAINED_PCT && absChange < EXPANDING_PCT;
  const priceExtended = absChange >= EXPANDING_PCT;
  const volCompression = input.volatilityState === 'compression' || input.volatilityState === 'emerging';
  const volExpansion = input.volatilityState === 'expansion' || input.volatilityState === 'climax';
  const breakoutNear = typeof input.breakoutProximity === 'number' && input.breakoutProximity >= 0.6;
  const fadingSignal =
    input.relativeStrength === 'weakening' ||
    (input.momentumAccelerating === false && absChange >= CONTAINED_PCT);

  let state: BuildingState;
  if (priceExtended && (volExpansion || participationRising)) {
    state = 'EXTENDED';
  } else if (participationRising && priceContained) {
    // Participation building while price is still contained — the core "early"
    // signal. Volatility compression / breakout proximity refine the strength
    // score below but are not required to identify developing interest.
    state = 'BUILDING';
  } else if (participationRising && priceExpanding) {
    state = 'EXPANDING';
  } else if (fadingSignal) {
    state = 'FADING';
  } else {
    state = 'DORMANT';
  }

  // Composite "developing-activity strength": highest when participation is
  // building ahead of price (BUILDING), lower once extended/fading.
  let raw = 0;
  if (participationRising) raw += 30;
  if (typeof input.relativeVolume === 'number') raw += Math.min(20, Math.max(0, (input.relativeVolume - 1) * 20));
  if (typeof input.openInterestChangePct === 'number') raw += Math.min(15, Math.max(0, input.openInterestChangePct));
  if (volCompression) raw += 15;
  if (breakoutNear) raw += 15;
  if (input.momentumAccelerating) raw += 10;
  if (input.relativeStrength === 'improving') raw += 10;
  // Discount once the move is already extended or fading.
  if (state === 'EXTENDED') raw *= 0.4;
  if (state === 'FADING') raw *= 0.3;
  if (state === 'DORMANT') raw *= 0.5;

  const availableFactors = countAvailableFactors(input);
  const evidence = assessEvidenceQuality({
    availableFactors,
    totalFactors: 5,
    freshness: input.freshness ?? 'unknown',
  });

  return {
    symbol: input.symbol,
    state,
    score: formatCompositeScore(raw),
    interpretation: INTERPRETATION[state],
    evidence,
  };
}

const STATE_PRIORITY: Record<BuildingState, number> = {
  BUILDING: 5,
  EXPANDING: 4,
  EXTENDED: 2,
  FADING: 1,
  DORMANT: 0,
};

/** Rank assessments so genuinely "developing" names surface first (BUILDING and
 *  EXPANDING before EXTENDED/FADING/DORMANT), then by composite strength. */
export function rankBuilding(assessments: BuildingAssessment[]): BuildingAssessment[] {
  return [...assessments].sort((a, b) => {
    const p = STATE_PRIORITY[b.state] - STATE_PRIORITY[a.state];
    if (p !== 0) return p;
    return b.score.value - a.score.value;
  });
}

/**
 * Cross-sectional relative volume: an asset's volume vs the median of a cohort
 * (e.g. today's movers). A transparent proxy when a per-symbol historical
 * baseline is unavailable — callers should label it as cohort-relative.
 */
export function crossSectionalRelativeVolume(volume: number, cohortVolumes: number[]): number | undefined {
  const valid = cohortVolumes.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!valid.length || !Number.isFinite(volume) || volume <= 0) return undefined;
  const mid = Math.floor(valid.length / 2);
  const median = valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
  if (!median) return undefined;
  return volume / median;
}
