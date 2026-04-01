/**
 * MSP Operator — Regime Engine
 * Classifies live market regime and transition risk.
 * @internal
 */

import type {
  FeatureVector, RegimeDecision, Regime, Playbook, SecondaryRegime,
  RegimeClassifyRequest,
} from '@/types/operator';
import { makeEnvelope, nowISO } from './shared';

// TODO: Wire into existing lib/regime-classifier.ts and lib/ai/regimeScoring.ts

/** Regime → allowed playbooks mapping */
const REGIME_PLAYBOOK_MAP: Record<Regime, { allowed: Playbook[]; blocked: Playbook[] }> = {
  TREND_EXPANSION: {
    allowed: ['BREAKOUT_CONTINUATION', 'PULLBACK_CONTINUATION'],
    blocked: ['RANGE_MEAN_REVERSION'],
  },
  TREND_CONTINUATION: {
    allowed: ['BREAKOUT_CONTINUATION', 'PULLBACK_CONTINUATION', 'SQUEEZE_EXPANSION'],
    blocked: ['RANGE_MEAN_REVERSION'],
  },
  TREND_EXHAUSTION: {
    allowed: ['FAILED_BREAKOUT_REVERSAL', 'RANGE_MEAN_REVERSION'],
    blocked: ['BREAKOUT_CONTINUATION'],
  },
  ROTATIONAL_RANGE: {
    allowed: ['RANGE_MEAN_REVERSION', 'FAILED_BREAKOUT_REVERSAL'],
    blocked: ['BREAKOUT_CONTINUATION', 'PULLBACK_CONTINUATION'],
  },
  COMPRESSION_COIL: {
    allowed: ['SQUEEZE_EXPANSION', 'BREAKOUT_CONTINUATION'],
    blocked: ['RANGE_MEAN_REVERSION'],
  },
  FAILED_BREAKOUT_TRAP: {
    allowed: ['FAILED_BREAKOUT_REVERSAL', 'LIQUIDITY_SWEEP_REVERSAL'],
    blocked: ['BREAKOUT_CONTINUATION'],
  },
  EVENT_SHOCK: {
    allowed: ['POST_EVENT_RECLAIM'],
    blocked: ['BREAKOUT_CONTINUATION', 'PULLBACK_CONTINUATION', 'RANGE_MEAN_REVERSION', 'SQUEEZE_EXPANSION'],
  },
  POST_NEWS_PRICE_DISCOVERY: {
    allowed: ['POST_EVENT_RECLAIM', 'PULLBACK_CONTINUATION'],
    blocked: ['RANGE_MEAN_REVERSION'],
  },
  ILLIQUID_DRIFT: {
    allowed: [],
    blocked: ['BREAKOUT_CONTINUATION', 'PULLBACK_CONTINUATION', 'RANGE_MEAN_REVERSION', 'SQUEEZE_EXPANSION', 'FAILED_BREAKOUT_REVERSAL', 'POST_EVENT_RECLAIM', 'LIQUIDITY_SWEEP_REVERSAL'],
  },
  PANIC_CORRELATION_CASCADE: {
    allowed: [],
    blocked: ['BREAKOUT_CONTINUATION', 'PULLBACK_CONTINUATION', 'RANGE_MEAN_REVERSION', 'SQUEEZE_EXPANSION', 'FAILED_BREAKOUT_REVERSAL', 'POST_EVENT_RECLAIM', 'LIQUIDITY_SWEEP_REVERSAL'],
  },
};

export function classifyRegime(req: RegimeClassifyRequest): RegimeDecision {
  const { symbol, market, timeframe, featureVector } = req;
  const f = featureVector.features;

  // TODO: Replace with ML model or rule-based classifier from lib/regime-classifier.ts
  // Placeholder classification logic based on feature thresholds
  let regime: Regime = 'ROTATIONAL_RANGE';
  let confidence = 0.5;
  let transitionRisk = 0.3;

  if (f.trendScore > 0.75 && f.volExpansionScore > 0.6) {
    regime = 'TREND_EXPANSION';
    confidence = Math.min(f.trendScore, f.volExpansionScore);
    transitionRisk = f.extensionScore > 0.7 ? 0.5 : 0.2;
  } else if (f.trendScore > 0.6 && f.momentumScore > 0.5) {
    regime = 'TREND_CONTINUATION';
    confidence = (f.trendScore + f.momentumScore) / 2;
    transitionRisk = 0.25;
  } else if (f.trendScore > 0.5 && f.extensionScore > 0.7 && f.momentumScore < 0.4) {
    regime = 'TREND_EXHAUSTION';
    confidence = 0.65;
    transitionRisk = 0.6;
  } else if (f.bbwpPercentile < 0.15 && f.atrPercentile < 0.2) {
    regime = 'COMPRESSION_COIL';
    confidence = 0.7;
    transitionRisk = 0.4;
  } else if (f.eventRiskScore < 0.3) {
    regime = 'EVENT_SHOCK';
    confidence = 0.6;
    transitionRisk = 0.7;
  } else if (f.liquidityScore < 0.2) {
    regime = 'ILLIQUID_DRIFT';
    confidence = 0.55;
    transitionRisk = 0.5;
  }

  // Build secondary regimes
  const secondaryRegimes: SecondaryRegime[] = [];
  if (regime === 'TREND_EXPANSION' && f.extensionScore > 0.65) {
    secondaryRegimes.push({ name: 'TREND_EXHAUSTION', probability: f.extensionScore * 0.4 });
  }
  if (f.eventRiskScore < 0.5 && regime !== 'EVENT_SHOCK') {
    secondaryRegimes.push({ name: 'EVENT_SENSITIVE', probability: (1 - f.eventRiskScore) * 0.3 });
  }

  const mapping = REGIME_PLAYBOOK_MAP[regime];

  return {
    symbol,
    market,
    timeframe,
    timestamp: nowISO(),
    regime,
    confidence,
    transitionRisk,
    secondaryRegimes,
    allowedPlaybooks: mapping.allowed,
    blockedPlaybooks: mapping.blocked,
  };
}

export function createRegimeResponse(decision: RegimeDecision) {
  return makeEnvelope('regime-engine', { regimeDecision: decision });
}
