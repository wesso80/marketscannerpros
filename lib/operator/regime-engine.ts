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
import { classifyRegime as unifiedClassify } from '@/lib/regime-classifier';
import type { ScoringRegime } from '@/lib/ai/regimeScoring';

/* ── Unified → Operator Regime Mapping ──────────────────────── */

const SCORING_TO_OPERATOR: Record<ScoringRegime, Regime> = {
  TREND_EXPANSION: 'TREND_EXPANSION',
  TREND_MATURE: 'TREND_EXHAUSTION',
  RANGE_COMPRESSION: 'ROTATIONAL_RANGE',
  VOL_EXPANSION: 'PANIC_CORRELATION_CASCADE',
  TRANSITION: 'ROTATIONAL_RANGE',
};

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

  // 1. Use unified classifier for base regime from indicator proxies
  const unified = unifiedClassify({
    adx: f.trendScore * 50, // trendScore 0-1 → rough ADX proxy 0-50
    rsi: f.momentumScore * 100, // momentumScore 0-1 → RSI proxy 0-100
    atrPercent: f.atrPercentile * 10, // atrPercentile 0-1 → atrPercent proxy 0-10
    direction: f.emaAlignmentScore > 0.6 ? 'bullish' : f.emaAlignmentScore < 0.4 ? 'bearish' : 'neutral',
    ema200Above: f.emaAlignmentScore > 0.5,
  });

  // 2. Map unified scoring regime → operator regime as starting point
  let regime: Regime = SCORING_TO_OPERATOR[unified.scoring] ?? 'ROTATIONAL_RANGE';
  let confidence = unified.confidence / 100; // normalize 0-100 → 0-1
  let transitionRisk = 0.3;

  // 3. Refine with operator-specific feature thresholds for granular regimes
  //    The unified classifier only covers 5 categories; we have 10.
  if (regime === 'TREND_EXPANSION' && f.trendScore > 0.6 && f.momentumScore > 0.5 && f.extensionScore < 0.6) {
    regime = 'TREND_CONTINUATION';
    transitionRisk = 0.25;
  }
  if (f.bbwpPercentile < 0.15 && f.atrPercentile < 0.2) {
    regime = 'COMPRESSION_COIL';
    confidence = Math.max(confidence, 0.7);
    transitionRisk = 0.4;
  }
  if (f.trendScore > 0.5 && f.extensionScore > 0.7 && f.momentumScore < 0.4) {
    regime = 'TREND_EXHAUSTION';
    confidence = 0.65;
    transitionRisk = 0.6;
  }
  if (f.eventRiskScore < 0.3) {
    regime = 'EVENT_SHOCK';
    confidence = 0.6;
    transitionRisk = 0.7;
  }
  if (f.liquidityScore < 0.2 && f.atrPercentile < 0.3) {
    regime = 'ILLIQUID_DRIFT';
    confidence = 0.55;
    transitionRisk = 0.5;
  }
  if (f.structureScore > 0.5 && f.extensionScore > 0.6 && f.trendScore > 0.5 && f.momentumScore < 0.35) {
    regime = 'FAILED_BREAKOUT_TRAP';
    confidence = 0.6;
    transitionRisk = 0.5;
  }
  if (f.eventRiskScore < 0.5 && f.eventRiskScore > 0.2 && f.trendScore > 0.4 && f.structureScore > 0.4) {
    regime = 'POST_NEWS_PRICE_DISCOVERY';
    confidence = 0.55;
    transitionRisk = 0.4;
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
