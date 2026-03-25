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
  let score = regime.confidence * 0.35; // Base from global confidence

  // Per-symbol regime alignment with global phase
  if (candidate.dve) {
    const symbolRegime = candidate.dve.regime;
    const globalPhase = regime.phase;

    // Strong bonus when symbol regime matches global phase direction
    const trendPhases = ['TREND_UP', 'TREND_DOWN'];
    const volPhases = ['VOL_EXPANSION', 'VOL_CLIMAX'];
    const rangePhases = ['RANGE_COMPRESSION', 'RANGE_NEUTRAL'];

    if (symbolRegime === 'expansion' && trendPhases.includes(globalPhase)) score += 20;
    else if (symbolRegime === 'compression' && rangePhases.includes(globalPhase)) score += 18;
    else if (symbolRegime === 'climax' && volPhases.includes(globalPhase)) score += 15;
    else if (symbolRegime === 'neutral' && globalPhase === 'RANGE_NEUTRAL') score += 10;
    // Mild penalty for misalignment
    else if (symbolRegime === 'compression' && trendPhases.includes(globalPhase)) score -= 5;
    else if (symbolRegime === 'expansion' && rangePhases.includes(globalPhase)) score -= 5;

    // DVE signal strength adds conviction
    score += candidate.dve.signalStrength * 0.15;
  }

  // Bonus if DVE + flowState agree
  if (candidate.dve && candidate.flowState) {
    const dveExpansion = candidate.dve.regime === 'expansion' || candidate.dve.regime === 'climax';
    const flowLaunch = candidate.flowState.state === 'LAUNCH';
    if (dveExpansion && flowLaunch) score += 15;
    if (candidate.dve.regime === 'compression' && candidate.flowState.state === 'ACCUMULATION') score += 12;
  }

  // ADX confirmation of regime clarity
  if (candidate.indicators.adx) {
    if (candidate.indicators.adx > 30) score += 8; // Clear regime
    else if (candidate.indicators.adx < 15) score -= 5; // No clear regime
  }

  // Penalty for conflicting regime signals
  if (regime.confidenceBand === 'CONFLICTING') score -= 15;

  return clamp(score);
}

function scoreStructureDimension(candidate: DiscoveryCandidate): number {
  let score = 40; // baseline — lower start so indicators push score up or down
  const { indicators } = candidate;

  // Price vs EMA200 — trend position
  if (indicators.price && indicators.ema200) {
    const ema200Dist = ((indicators.price - indicators.ema200) / indicators.ema200) * 100;
    if (Math.abs(ema200Dist) > 2) {
      score += 10; // Clear position relative to major MA
      if (Math.abs(ema200Dist) > 8) score += 5; // Strong trend displacement
    } else {
      score -= 5; // Sitting right on EMA200 — no structure
    }
  }

  // ADX trend strength — primary structure indicator
  if (indicators.adx != null) {
    if (indicators.adx > 35) score += 18;      // Very strong trend
    else if (indicators.adx > 25) score += 12;  // Established trend
    else if (indicators.adx > 18) score += 4;   // Weak trend
    else score -= 8;                             // No trend structure
  }

  // Aroon crossover — directional structure quality
  if (indicators.aroonUp != null && indicators.aroonDown != null) {
    const aroonSpread = Math.abs(indicators.aroonUp - indicators.aroonDown);
    if (aroonSpread > 60) score += 12;        // Strong directional structure
    else if (aroonSpread > 30) score += 6;    // Moderate structure
    else score -= 5;                           // No directional structure

    // Aroon extreme: one at 100 = recent new high/low (strong structure)
    if (indicators.aroonUp === 100 || indicators.aroonDown === 100) score += 5;
  }

  // MACD trend confirmation
  if (indicators.macd) {
    // Signal line crossover direction confirms structure
    const macdAboveSignal = indicators.macd.value > indicators.macd.signal;
    const histStrength = Math.abs(indicators.macd.histogram);
    if (histStrength > 0.5) score += 6;
    else if (histStrength > 0.1) score += 3;

    // MACD and price trend agreement
    if (indicators.price && indicators.ema200) {
      const priceAboveEMA = indicators.price > indicators.ema200;
      if (priceAboveEMA === macdAboveSignal) score += 5; // Agreement
      else score -= 3; // Divergence = weakening structure
    }
  }

  // RSI trend zone confirmation
  if (indicators.rsi != null) {
    if (indicators.rsi > 55 && indicators.rsi < 70) score += 4; // Bullish trend zone
    else if (indicators.rsi < 45 && indicators.rsi > 30) score += 4; // Bearish trend zone
    else if (indicators.rsi >= 70 || indicators.rsi <= 30) score -= 3; // Overextended
  }

  return clamp(score);
}

function scoreVolatilityDimension(candidate: DiscoveryCandidate): number {
  const { indicators } = candidate;
  let score = 40; // Lower baseline — let real data drive the score

  // ATR% is the most direct volatility measure available
  if (indicators.atrPercent != null && indicators.atrPercent > 0) {
    if (indicators.atrPercent > 4) score += 20;       // High volatility
    else if (indicators.atrPercent > 2.5) score += 14; // Above average
    else if (indicators.atrPercent > 1.5) score += 8;  // Normal
    else if (indicators.atrPercent < 0.8) score += 15; // Very compressed — breakout potential
    else score += 3;                                    // Low-normal
  }

  // CCI extremes indicate volatility expansion
  if (indicators.cci != null) {
    const absCCI = Math.abs(indicators.cci);
    if (absCCI > 200) score += 12;       // Extreme volatility
    else if (absCCI > 100) score += 6;   // Elevated volatility
    else if (absCCI < 30) score += 8;    // Very quiet — compression potential
  }

  // DVE regime-based scoring (now uses real derived regime)
  if (candidate.dve) {
    const { bbwp, regime, signalStrength } = candidate.dve;

    if (regime === 'compression') {
      score += 10 + Math.max(0, (30 - bbwp) * 0.3); // Low BBWP = tighter compression
    } else if (regime === 'expansion') {
      score += 8 + signalStrength * 0.12;
    } else if (regime === 'climax') {
      score -= 10; // Climax = dangerous vol environment
    } else {
      score += signalStrength * 0.08; // Neutral: mild credit for any signal
    }
  }

  // ADX as trend-volatility proxy
  if (indicators.adx != null) {
    if (indicators.adx > 35) score += 5;  // High directional volatility
    else if (indicators.adx < 12) score += 4; // Very low — compression
  }

  // V2: Enhanced with full DVE data (trap, exhaustion, breakout)
  if (candidate.fullDve) {
    if (candidate.dve?.regime === 'compression' && candidate.fullDve.breakoutReadiness > 60) {
      score += Math.min(15, (candidate.fullDve.breakoutReadiness - 60) * 0.4);
    }
    if (candidate.fullDve.trapScore > 50) {
      score -= Math.min(15, (candidate.fullDve.trapScore - 50) * 0.3);
    }
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
  let score = 40; // Lower baseline
  const { indicators } = candidate;

  // VWAP distance — mean reversion potential creates asymmetry
  if (indicators.vwap && indicators.price) {
    const vwapDist = Math.abs((indicators.price - indicators.vwap) / indicators.vwap) * 100;
    if (vwapDist > 3) score += 15;       // Far from VWAP = high reversion asymmetry
    else if (vwapDist > 1.5) score += 8; // Moderate distance
    else score += 2;                      // Near VWAP
  }

  // RSI extremes = reverse asymmetry (oversold = high long asymmetry, overbought = high short)
  if (indicators.rsi != null) {
    if (indicators.rsi < 25 || indicators.rsi > 75) score += 12; // Extreme = high asymmetry
    else if (indicators.rsi < 35 || indicators.rsi > 65) score += 6; // Elevated
  }

  // Aroon extreme — one-sided trend creates continuation asymmetry
  if (indicators.aroonUp != null && indicators.aroonDown != null) {
    const aroonSpread = Math.abs(indicators.aroonUp - indicators.aroonDown);
    if (aroonSpread > 70) score += 8; // Strong directional asymmetry
    else if (aroonSpread > 40) score += 4;
  }

  // Capital flow conviction indicates positional asymmetry
  if (candidate.capitalFlow) {
    score += (candidate.capitalFlow.conviction - 50) * 0.4;
  }

  // High gamma environment (equities) = strong magnet levels
  if (candidate.capitalFlow?.gammaState === 'Negative') {
    score += 8; // Negative gamma = amplified moves
  }

  // EMA200 displacement — further from major MA = more accumulated asymmetry
  if (indicators.price && indicators.ema200) {
    const ema200Pct = Math.abs((indicators.price - indicators.ema200) / indicators.ema200) * 100;
    if (ema200Pct > 15) score += 6;     // Very far from MA
    else if (ema200Pct > 5) score += 3; // Moderate displacement
  }

  return clamp(score);
}

function scoreParticipationDimension(candidate: DiscoveryCandidate): number {
  let score = 35; // Lower baseline — let real indicators drive
  const { indicators } = candidate;

  // MFI (Money Flow Index) — combines price+volume, direct participation signal
  if (indicators.mfi != null) {
    if (indicators.mfi > 70) score += 18;       // Strong money inflow = high participation
    else if (indicators.mfi > 55) score += 12;  // Above average inflow
    else if (indicators.mfi > 40) score += 6;   // Neutral-positive
    else if (indicators.mfi < 25) score += 10;  // Extreme outflow = participation (just bearish)
    else score += 2;                             // Weak participation
  }

  // OBV presence — on-balance volume shows cumulative participation
  if (indicators.obv != null && indicators.volume != null) {
    // Can't compare to historical OBV, but nonzero volume = active trading
    if (indicators.volume > 0) score += 5;
  }

  // Volume presence check (volume itself, even without avgVolume)
  if (indicators.volume != null) {
    if (indicators.volume > 0) score += 4;
  } else {
    score -= 8; // No volume data at all
  }

  // Volume vs average (when available)
  if (indicators.volume && indicators.avgVolume) {
    const volRatio = indicators.volume / indicators.avgVolume;
    if (volRatio > 2.0) score += 15;
    else if (volRatio > 1.5) score += 10;
    else if (volRatio > 1.0) score += 5;
    else score -= 5;
  }

  // Institutional grade
  if (candidate.institutionalGrade) {
    const gradeMap: Record<string, number> = {
      'A+': 20, 'A': 16, 'A-': 12, 'B': 7, 'C': 0, 'D': -8, 'F': -15,
    };
    score += gradeMap[candidate.institutionalGrade.grade] ?? 0;
  }

  // Flow state confidence
  if (candidate.flowState) {
    score += candidate.flowState.confidence * 0.12;
  }

  // Stochastic as participation proxy — extreme readings = active trading
  if (indicators.stochK != null) {
    if (indicators.stochK > 80 || indicators.stochK < 20) score += 4; // Active extremes
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
