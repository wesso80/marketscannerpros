/**
 * Layer 3 — Fusion Engine
 * @internal — NEVER import into user-facing components.
 *
 * Normalizes raw evidence from Discovery into 8 dimensions, applies
 * regime-adaptive weights, and produces a single composite FusionScore
 * per symbol. This is the core intelligence layer.
 *
 * 9 Dimensions:
 *   1. Regime     — How clear and favorable is the current regime?
 *   2. Structure  — Trend structure quality (EMA stacking, ADX, HH/HL)
 *   3. Volatility — DVE regime + BBWP + trap/exhaustion/breakout
 *   4. Timing     — Real fibonnaci time confluence (from TC engine)
 *   5. Momentum   — RSI, MACD, Stochastic alignment
 *   6. Asymmetry  — Risk:Reward positioning (distance to key levels)
 *   7. Participation — Volume, flow conviction, institutional grade
 *   8. Freshness  — Data recency and quality
 *   9. Pressure   — Market Pressure Engine composite (time+vol+liq+options)
 */

import type { DiscoveryCandidate, FusionDimension, FusionScore, MarketPhase, UnifiedRegimeState } from './types';
import { DEFAULT_QUANT_CONFIG } from './types';

// ─── Dimension Normalizers ──────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function scoreRegimeDimension(candidate: DiscoveryCandidate, regime: UnifiedRegimeState): number {
  // How well does this symbol's own data agree with the global regime?
  let score = regime.confidence * 0.5;

  // Bonus if DVE + flowState agree
  if (candidate.dve && candidate.flowState) {
    const dveExpansion = candidate.dve.regime === 'expansion' || candidate.dve.regime === 'climax';
    const flowLaunch = candidate.flowState.state === 'LAUNCH';
    if (dveExpansion && flowLaunch) score += 20;
    if (candidate.dve.regime === 'compression' && candidate.flowState.state === 'ACCUMULATION') score += 15;
  }

  // Penalty for conflicting regime signals
  if (regime.confidenceBand === 'CONFLICTING') score -= 15;

  return clamp(score);
}

function scoreStructureDimension(candidate: DiscoveryCandidate): number {
  let score = 50; // baseline

  const { indicators } = candidate;

  // EMA stacking: price > ema20 > ema50 > ema200 (bullish) or inverse (bearish)
  if (indicators.price && indicators.ema20 && indicators.ema50 && indicators.ema200) {
    const bullStack = indicators.price > indicators.ema20 && indicators.ema20 > indicators.ema50 && indicators.ema50 > indicators.ema200;
    const bearStack = indicators.price < indicators.ema20 && indicators.ema20 < indicators.ema50 && indicators.ema50 < indicators.ema200;
    if (bullStack || bearStack) score += 25;
    else score -= 10;
  }

  // ADX trend strength
  if (indicators.adx) {
    if (indicators.adx > 25) score += Math.min(20, (indicators.adx - 25) * 0.8);
    else score -= 10;
  }

  return clamp(score);
}

function scoreVolatilityDimension(candidate: DiscoveryCandidate): number {
  if (!candidate.dve) return 50;

  let score = 50;
  const { bbwp, regime, signalStrength } = candidate.dve;

  // Compression zones are high-edge (pending breakout)
  if (regime === 'compression') {
    score = 70 + (15 - bbwp) * 0.5; // Lower BBWP = higher score in compression
  }
  // Active DVE signal = high vol edge
  else if (signalStrength > 0) {
    score = 60 + signalStrength * 0.3;
  }
  // Expansion with direction = moderate edge
  else if (regime === 'expansion') {
    score = 55;
  }
  // Climax = dangerous, low score
  else if (regime === 'climax') {
    score = 25;
  }

  // V2: Enhanced with full DVE data (trap, exhaustion, breakout)
  if (candidate.fullDve) {
    // Breakout readiness boosts score in compression
    if (regime === 'compression' && candidate.fullDve.breakoutReadiness > 60) {
      score += Math.min(15, (candidate.fullDve.breakoutReadiness - 60) * 0.4);
    }
    // Trap risk penalizes -- false breakout danger
    if (candidate.fullDve.trapScore > 50) {
      score -= Math.min(15, (candidate.fullDve.trapScore - 50) * 0.3);
    }
    // Exhaustion risk penalizes all phases
    if (candidate.fullDve.exhaustionLevel > 60) {
      score -= Math.min(20, (candidate.fullDve.exhaustionLevel - 60) * 0.5);
    }
  }

  return clamp(score);
}

function scoreTimingDimension(candidate: DiscoveryCandidate): number {
  // V2: Real fibonacci time confluence scoring (when available)
  // Falls back to indicator-based timing if TC data is missing.

  if (candidate.timeConfluence) {
    const tc = candidate.timeConfluence;
    let score = 30; // baseline when TC is available

    // Core: fibonacci confluence score (0-100) → primary signal
    score += tc.confluenceScore * 0.4;

    // Active timeframes — more = stronger timing edge
    if (tc.activeTFCount >= 3) score += 15;
    else if (tc.activeTFCount >= 2) score += 8;

    // Decompression events happening = timing pressure releasing
    if (tc.decompressionCount > 0) score += 10;

    // Hot zone = extreme confluence, best timing possible
    if (tc.hotZoneActive) score += 12;

    // Impact level
    if (tc.nowImpact === 'extreme') score += 10;
    else if (tc.nowImpact === 'high') score += 6;
    else if (tc.nowImpact === 'medium') score += 3;

    // Proximity to next major event — closer = more pressure
    if (tc.minutesToNextMajor < 15) score += 8;
    else if (tc.minutesToNextMajor < 60) score += 4;

    return clamp(score);
  }

  // Fallback: indicator-based timing (original V1 logic)
  let score = 50;
  const { indicators } = candidate;

  if (indicators.stochK !== undefined) {
    if (indicators.stochK < 25) score += 15;
    else if (indicators.stochK < 40) score += 8;
    else if (indicators.stochK > 75) score += 12;
    else if (indicators.stochK > 60) score += 5;
  }

  if (indicators.macd?.histogram !== undefined) {
    const hist = indicators.macd.histogram;
    if (Math.abs(hist) > 0.5) score += 8;
    else if (Math.abs(hist) > 0.2) score += 4;
  }

  if (indicators.vwap && indicators.price) {
    const vwapDist = ((indicators.price - indicators.vwap) / indicators.vwap) * 100;
    if (Math.abs(vwapDist) < 0.5) score += 10;
    else if (Math.abs(vwapDist) < 1.5) score += 5;
    else if (Math.abs(vwapDist) > 3) score -= 5;
  }

  if (candidate.dve && candidate.dve.directionalScore !== 0) {
    score += Math.min(10, Math.abs(candidate.dve.directionalScore) * 0.1);
  }

  return clamp(score);
}

function scoreMomentumDimension(candidate: DiscoveryCandidate): number {
  let score = 50;
  const { indicators } = candidate;

  // RSI
  if (indicators.rsi !== undefined) {
    if (indicators.rsi > 50 && indicators.rsi < 70) score += 10; // Bullish momentum
    else if (indicators.rsi < 50 && indicators.rsi > 30) score += 5; // Bearish momentum
    else if (indicators.rsi > 70) score -= 5;  // Overextended
    else if (indicators.rsi < 30) score -= 5;
  }

  // MACD histogram positive = bullish momentum
  if (indicators.macd?.histogram) {
    score += indicators.macd.histogram > 0 ? 10 : -5;
  }

  // Stochastic
  if (indicators.stochK !== undefined) {
    if (indicators.stochK > 20 && indicators.stochK < 80) score += 5;
    if (indicators.stochK > 80) score -= 5; // Overbought
    if (indicators.stochK < 20) score -= 5; // Oversold
  }

  // Directional pressure from DVE
  if (candidate.dve) {
    const dirScore = Math.abs(candidate.dve.directionalScore);
    score += dirScore * 0.15;
  }

  return clamp(score);
}

function scoreAsymmetryDimension(candidate: DiscoveryCandidate): number {
  let score = 50;

  // Capital flow conviction indicates positional asymmetry
  if (candidate.capitalFlow) {
    score += (candidate.capitalFlow.conviction - 50) * 0.3;
  }

  // High gamma environment (equities) = strong magnet levels
  if (candidate.capitalFlow?.gammaState === 'Negative') {
    score += 10; // Negative gamma = amplified moves = more asymmetry
  }

  return clamp(score);
}

function scoreParticipationDimension(candidate: DiscoveryCandidate): number {
  let score = 50;

  // Volume vs average
  if (candidate.indicators.volume && candidate.indicators.avgVolume) {
    const volRatio = candidate.indicators.volume / candidate.indicators.avgVolume;
    if (volRatio > 1.5) score += 20;
    else if (volRatio > 1.0) score += 10;
    else score -= 10;
  }

  // Institutional grade
  if (candidate.institutionalGrade) {
    const gradeMap: Record<string, number> = {
      'A+': 25, 'A': 20, 'A-': 15, 'B': 10, 'C': 0, 'D': -10, 'F': -20,
    };
    score += gradeMap[candidate.institutionalGrade.grade] ?? 0;
  }

  // Flow state confidence
  if (candidate.flowState) {
    score += candidate.flowState.confidence * 0.1;
  }

  return clamp(score);
}

function scorePressureDimension(candidate: DiscoveryCandidate): number {
  // V2: Market Pressure Engine composite — how much total market pressure exists?
  if (!candidate.pressure) return 50;

  const { composite, alignment, direction } = candidate.pressure;
  let score = composite; // MPE composite is already 0-100

  // Alignment bonus — all pressure components agree on direction
  if (alignment > 0.7) score += 10;
  else if (alignment < 0.3) score -= 10;

  // Directional pressure that agrees with candidate direction adds value
  if (candidate.dve) {
    const dveBullish = candidate.dve.directionalBias === 'bullish';
    const pressureLong = direction === 'LONG';
    if ((dveBullish && pressureLong) || (!dveBullish && !pressureLong && direction === 'SHORT')) {
      score += 8; // DVE and pressure agree on direction
    }
  }

  return clamp(score);
}

function scoreFreshnessDimension(candidate: DiscoveryCandidate): number {
  // Based on how recently the scan data was generated
  // Cached data is inherently delayed; penalize accordingly
  const ts = new Date(candidate.scanTimestamp).getTime();
  const age = Date.now() - ts;
  const ageMinutes = age / 60_000;

  if (ageMinutes < 5) return 95;
  if (ageMinutes < 15) return 80;
  if (ageMinutes < 60) return 60;
  if (ageMinutes < 240) return 40;
  return 20;
}

// ─── Direction Resolution ───────────────────────────────────────────────────

function resolveDirection(candidate: DiscoveryCandidate): { dir: 'LONG' | 'SHORT' | 'NEUTRAL'; confidence: number } {
  let bullish = 0;
  let bearish = 0;

  if (candidate.dve) {
    if (candidate.dve.directionalBias === 'bullish') bullish += 2;
    else if (candidate.dve.directionalBias === 'bearish') bearish += 2;
  }
  if (candidate.capitalFlow) {
    if (candidate.capitalFlow.bias === 'bullish') bullish += 1;
    else if (candidate.capitalFlow.bias === 'bearish') bearish += 1;
  }
  if (candidate.flowState) {
    if (candidate.flowState.bias === 'bullish') bullish += 1;
    else if (candidate.flowState.bias === 'bearish') bearish += 1;
  }

  const total = bullish + bearish;
  if (total === 0) return { dir: 'NEUTRAL', confidence: 0 };
  if (bullish > bearish) return { dir: 'LONG', confidence: (bullish / total) * 100 };
  if (bearish > bullish) return { dir: 'SHORT', confidence: (bearish / total) * 100 };
  return { dir: 'NEUTRAL', confidence: 0 };
}

// ─── Main Fusion Function ───────────────────────────────────────────────────

export function fuseCandidate(
  candidate: DiscoveryCandidate,
  regime: UnifiedRegimeState,
  weightProfile?: Record<string, number>,
): FusionScore {
  const weights = weightProfile ?? DEFAULT_QUANT_CONFIG.regimeWeightProfiles[regime.phase] ?? DEFAULT_QUANT_CONFIG.regimeWeightProfiles.RANGE_NEUTRAL;

  const dimensionScorers: Array<{ name: string; scorer: () => number; source: string }> = [
    { name: 'regime', scorer: () => scoreRegimeDimension(candidate, regime), source: 'regime+dve+flow' },
    { name: 'structure', scorer: () => scoreStructureDimension(candidate), source: 'indicators' },
    { name: 'volatility', scorer: () => scoreVolatilityDimension(candidate), source: 'dve' },
    { name: 'timing', scorer: () => scoreTimingDimension(candidate), source: 'timeConfluence' },
    { name: 'momentum', scorer: () => scoreMomentumDimension(candidate), source: 'indicators+dve' },
    { name: 'asymmetry', scorer: () => scoreAsymmetryDimension(candidate), source: 'capitalFlow' },
    { name: 'participation', scorer: () => scoreParticipationDimension(candidate), source: 'volume+filter+flow' },
    { name: 'freshness', scorer: () => scoreFreshnessDimension(candidate), source: 'meta' },
    { name: 'pressure', scorer: () => scorePressureDimension(candidate), source: 'mpe' },
  ];

  const dimensions: FusionDimension[] = dimensionScorers.map(d => {
    const raw = d.scorer();
    const normalized = clamp(raw);
    const weight = weights[d.name] ?? 0.125;
    return {
      name: d.name,
      raw,
      normalized,
      weight,
      weighted: normalized * weight,
      source: d.source,
    };
  });

  const composite = clamp(dimensions.reduce((s, d) => s + d.weighted, 0));
  const { dir, confidence: dirConf } = resolveDirection(candidate);

  return {
    symbol: candidate.symbol,
    composite,
    dimensions,
    regime: regime.phase,
    regimeConfidence: regime.confidence,
    direction: dir,
    directionConfidence: dirConf,
    asymmetry: dimensions.find(d => d.name === 'asymmetry')?.normalized ?? 50,
    freshness: dimensions.find(d => d.name === 'freshness')?.normalized ?? 50,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fuse all candidates against the current regime.
 * Returns sorted by composite score descending.
 */
export function fuseAll(
  candidates: DiscoveryCandidate[],
  regime: UnifiedRegimeState,
): FusionScore[] {
  return candidates
    .map(c => fuseCandidate(c, regime))
    .sort((a, b) => b.composite - a.composite);
}
