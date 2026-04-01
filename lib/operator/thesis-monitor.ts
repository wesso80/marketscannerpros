/**
 * MSP Operator — Thesis Integrity Monitor §13.4
 * Tracks whether a live position's original thesis still holds:
 *   - structure still valid?
 *   - volatility still supportive?
 *   - timing edge expired?
 *   - regime shifted?
 *   - cross-market support degraded?
 * Outputs a composite thesisIntegrityScore and a recommendation.
 * @internal
 */

import type {
  ThesisIntegrityState, FeatureVector, RegimeDecision,
  Verdict, CrossMarketState, Bar,
} from '@/types/operator';
import { clamp, nowISO } from './shared';

export interface ThesisCheckInput {
  /** Original verdict at time of entry */
  originalVerdict: Verdict;
  /** Original regime at entry */
  originalRegime: RegimeDecision;
  /** Current feature vector (live) */
  currentFeatures: FeatureVector;
  /** Current regime (live) */
  currentRegime: RegimeDecision;
  /** Current cross-market state */
  currentCrossMarket: CrossMarketState;
  /** Current bars for recency */
  currentBars: Bar[];
  /** Time elapsed since entry in minutes */
  minutesSinceEntry: number;
}

/* ── Dimension checks ───────────────────────────────────────── */

function checkStructureValid(input: ThesisCheckInput): number {
  const origStructure = input.originalVerdict.evidence.structureQuality;
  const currStructure = input.currentFeatures.features.structureScore;
  // If structure degraded by more than 40% → thesis weakened
  if (origStructure > 0) {
    const ratio = currStructure / origStructure;
    return clamp(ratio, 0, 1);
  }
  return currStructure;
}

function checkVolatilitySupportive(input: ThesisCheckInput): number {
  const origVol = input.originalVerdict.evidence.volatilityAlignment;
  const currVol = (input.currentFeatures.features.volExpansionScore +
    (1 - input.currentFeatures.features.extensionScore)) / 2;
  if (origVol > 0) {
    const ratio = currVol / origVol;
    return clamp(ratio, 0, 1);
  }
  return currVol;
}

function checkTimingEdge(input: ThesisCheckInput): number {
  // Timing edge decays over time
  const { minutesSinceEntry } = input;
  // For intraday: edge expires after ~120 min; daily: ~480 min
  const timeframe = input.currentFeatures.timeframe;
  const maxEdgeMinutes = ['5m', '15m'].includes(timeframe) ? 120 :
    ['1h', '60min'].includes(timeframe) ? 240 : 480;

  const decay = 1 - (minutesSinceEntry / maxEdgeMinutes);
  const timeConfluence = input.currentFeatures.features.timeConfluenceScore;
  return clamp(Math.min(decay, timeConfluence), 0, 1);
}

function checkRegimeStable(input: ThesisCheckInput): number {
  const origRegime = input.originalRegime.regime;
  const currRegime = input.currentRegime.regime;

  // Same regime → full score
  if (origRegime === currRegime) {
    return clamp(1 - input.currentRegime.transitionRisk, 0, 1);
  }

  // Compatible regime shift (e.g., TREND_EXPANSION → TREND_CONTINUATION)
  const compatible = new Set([
    'TREND_EXPANSION:TREND_CONTINUATION',
    'TREND_CONTINUATION:TREND_EXPANSION',
    'COMPRESSION_COIL:TREND_EXPANSION',
    'POST_NEWS_PRICE_DISCOVERY:TREND_CONTINUATION',
  ]);
  if (compatible.has(`${origRegime}:${currRegime}`)) {
    return clamp(0.7 * (1 - input.currentRegime.transitionRisk), 0, 1);
  }

  // Hostile regime shift
  return clamp(0.2 * (1 - input.currentRegime.transitionRisk), 0, 1);
}

function checkCrossMarketAligned(input: ThesisCheckInput): number {
  const cs = input.currentCrossMarket;
  let score = 0.5;
  if (cs.vixState === 'normal') score += 0.25;
  else if (cs.vixState === 'elevated') score -= 0.25;
  if (cs.breadthState === 'bullish') score += 0.15;
  else if (cs.breadthState === 'bearish') score -= 0.15;
  if (cs.dxyState === 'neutral') score += 0.1;
  return clamp(score, 0, 1);
}

/* ── Composite + recommendation ─────────────────────────────── */

const INTEGRITY_WEIGHTS = {
  structureValid: 0.25,
  volatilitySupportive: 0.20,
  timingEdgeAlive: 0.15,
  regimeStable: 0.25,
  crossMarketAligned: 0.15,
};

export function checkThesisIntegrity(input: ThesisCheckInput): ThesisIntegrityState {
  const structureValid = checkStructureValid(input);
  const volatilitySupportive = checkVolatilitySupportive(input);
  const timingEdgeAlive = checkTimingEdge(input);
  const regimeStable = checkRegimeStable(input);
  const crossMarketAligned = checkCrossMarketAligned(input);

  const thesisIntegrityScore = clamp(
    INTEGRITY_WEIGHTS.structureValid * structureValid +
    INTEGRITY_WEIGHTS.volatilitySupportive * volatilitySupportive +
    INTEGRITY_WEIGHTS.timingEdgeAlive * timingEdgeAlive +
    INTEGRITY_WEIGHTS.regimeStable * regimeStable +
    INTEGRITY_WEIGHTS.crossMarketAligned * crossMarketAligned,
    0, 1,
  );

  const reasons: string[] = [];
  let recommendation: ThesisIntegrityState['recommendation'] = 'HOLD';

  if (thesisIntegrityScore < 0.30) {
    recommendation = 'EXIT';
    reasons.push('THESIS_COLLAPSED');
  } else if (thesisIntegrityScore < 0.50) {
    recommendation = 'REDUCE';
    reasons.push('THESIS_DEGRADED');
  }

  if (regimeStable < 0.3) reasons.push('REGIME_SHIFTED');
  if (structureValid < 0.3) reasons.push('STRUCTURE_BROKEN');
  if (timingEdgeAlive < 0.2) reasons.push('TIMING_EDGE_EXPIRED');
  if (volatilitySupportive < 0.3) reasons.push('VOLATILITY_ADVERSE');
  if (crossMarketAligned < 0.3) reasons.push('CROSS_MARKET_DEGRADED');

  return {
    candidateId: input.originalVerdict.candidateId,
    symbol: input.originalVerdict.symbol,
    timestamp: nowISO(),
    structureValid,
    volatilitySupportive,
    timingEdgeAlive,
    regimeStable,
    crossMarketAligned,
    thesisIntegrityScore,
    recommendation,
    reasons,
  };
}
