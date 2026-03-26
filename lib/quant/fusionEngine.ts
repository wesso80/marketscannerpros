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
    if (candidate.indicators.adx > 30) score += 8;
    else if (candidate.indicators.adx < 15) score -= 5;
  }

  // DI+/DI- — directional regime confirmation
  if (candidate.indicators.plusDI != null && candidate.indicators.minusDI != null) {
    const diSpread = Math.abs(candidate.indicators.plusDI - candidate.indicators.minusDI);
    if (diSpread > 20) score += 6;  // Clear directional dominance supports regime
    else if (diSpread < 5) score -= 4; // No directional edge — regime is murky
  }

  // Penalty for conflicting regime signals
  if (regime.confidenceBand === 'CONFLICTING') score -= 15;

  return clamp(score);
}

function scoreStructureDimension(candidate: DiscoveryCandidate): number {
  let score = 40; // baseline — lower start so indicators push score up or down
  const { indicators } = candidate;

  // ── EMA Stacking — the gold standard of trend structure ──
  // Full alignment: price > ema20 > ema50 > ema200 (bull) or reverse (bear)
  if (indicators.price && indicators.ema20 && indicators.ema50 && indicators.ema200) {
    const p = indicators.price;
    const e20 = indicators.ema20;
    const e50 = indicators.ema50;
    const e200 = indicators.ema200;

    const bullStack = p > e20 && e20 > e50 && e50 > e200;
    const bearStack = p < e20 && e20 < e50 && e50 < e200;
    const partialBull = p > e50 && e50 > e200;
    const partialBear = p < e50 && e50 < e200;

    if (bullStack || bearStack) score += 22;       // Perfect trend structure
    else if (partialBull || partialBear) score += 12; // Partial alignment
    else {
      // Check for crossover setup (ema20 crossing ema50)
      const crossDist = Math.abs(e20 - e50) / e50 * 100;
      if (crossDist < 0.5) score += 6; // Near crossover — transitional structure
      else score -= 3; // Tangled MAs
    }

    // Distance from price to ema20 — tight = orderly trend
    const ema20Dist = Math.abs((p - e20) / e20) * 100;
    if (ema20Dist < 1.5) score += 4; // Riding the 20EMA tightly
    else if (ema20Dist > 8) score -= 4; // Extended from short MA
  } else if (indicators.price && indicators.ema200) {
    // Fallback: only EMA200 available
    const ema200Dist = ((indicators.price - indicators.ema200) / indicators.ema200) * 100;
    if (Math.abs(ema200Dist) > 2) {
      score += 10;
      if (Math.abs(ema200Dist) > 8) score += 5;
    } else {
      score -= 5;
    }
  }

  // ── DI+/DI- — true directional strength ──
  if (indicators.plusDI != null && indicators.minusDI != null) {
    const diSpread = indicators.plusDI - indicators.minusDI;
    const absSpread = Math.abs(diSpread);
    if (absSpread > 20) score += 10;       // Strong directional dominance
    else if (absSpread > 10) score += 5;   // Moderate
    else score -= 3;                        // No directional edge
  }

  // ADX trend strength — primary structure indicator
  if (indicators.adx != null) {
    if (indicators.adx > 35) score += 14;
    else if (indicators.adx > 25) score += 8;
    else if (indicators.adx > 18) score += 3;
    else score -= 6;
  }

  // Aroon crossover — directional structure quality
  if (indicators.aroonUp != null && indicators.aroonDown != null) {
    const aroonSpread = Math.abs(indicators.aroonUp - indicators.aroonDown);
    if (aroonSpread > 60) score += 8;
    else if (aroonSpread > 30) score += 4;
    else score -= 4;
    if (indicators.aroonUp === 100 || indicators.aroonDown === 100) score += 3;
  }

  // MACD trend confirmation
  if (indicators.macd) {
    const macdAboveSignal = indicators.macd.value > indicators.macd.signal;
    const histStrength = Math.abs(indicators.macd.histogram);
    if (histStrength > 0.5) score += 4;
    else if (histStrength > 0.1) score += 2;

    if (indicators.price && indicators.ema200) {
      const priceAboveEMA = indicators.price > indicators.ema200;
      if (priceAboveEMA === macdAboveSignal) score += 4;
      else score -= 3;
    }
  }

  // RSI trend zone confirmation
  if (indicators.rsi != null) {
    if (indicators.rsi > 55 && indicators.rsi < 70) score += 3;
    else if (indicators.rsi < 45 && indicators.rsi > 30) score += 3;
    else if (indicators.rsi >= 70 || indicators.rsi <= 30) score -= 3;
  }

  // BOP — buyer/seller pressure confirms trend structure
  if (indicators.bop != null) {
    if (indicators.bop > 0.5) score += 6;       // Strong buyer dominance
    else if (indicators.bop > 0.2) score += 3;  // Moderate buyer edge
    else if (indicators.bop < -0.5) score += 6; // Strong seller dominance (bearish structure)
    else if (indicators.bop < -0.2) score += 3;
    else score -= 2;                             // No pressure = weak structure
  }

  return clamp(score);
}

function scoreVolatilityDimension(candidate: DiscoveryCandidate): number {
  const { indicators } = candidate;
  let score = 40; // Lower baseline — let real data drive the score

  // ── Real Bollinger Bands — direct volatility measurement ──
  if (indicators.bbUpper != null && indicators.bbLower != null && indicators.bbMiddle != null && indicators.bbMiddle > 0) {
    const bbWidth = ((indicators.bbUpper - indicators.bbLower) / indicators.bbMiddle) * 100;

    if (bbWidth < 3) score += 18;        // Very tight bands = strong compression → breakout candidate
    else if (bbWidth < 5) score += 12;   // Moderate compression
    else if (bbWidth < 8) score += 6;    // Normal bandwidth
    else if (bbWidth > 15) score += 14;  // Very wide = expansion in progress
    else if (bbWidth > 10) score += 8;   // Above-average expansion
    else score += 3;

    // Price position within bands — closer to edge = more pressure
    if (indicators.price) {
      const bandRange = indicators.bbUpper - indicators.bbLower;
      if (bandRange > 0) {
        const pctB = (indicators.price - indicators.bbLower) / bandRange; // 0 = at lower, 1 = at upper
        if (pctB > 0.95 || pctB < 0.05) score += 8;  // Riding a band = directional pressure
        else if (pctB > 0.85 || pctB < 0.15) score += 4;
      }
    }
  }

  // ── BB Width Percentile — BBWP proxy ──
  if (indicators.bbWidthPercent != null) {
    // Lower BBWP = more compressed historically = higher breakout probability
    if (indicators.bbWidthPercent < 5) score += 10;
    else if (indicators.bbWidthPercent < 10) score += 5;
    else if (indicators.bbWidthPercent > 30) score += 6; // Wide = active expansion
  }

  // ── Direct Squeeze Detection ──
  if (indicators.inSqueeze === true) {
    score += 12; // Confirmed squeeze = high breakout potential
    if (indicators.squeezeStrength != null && indicators.squeezeStrength > 2) {
      score += Math.min(8, indicators.squeezeStrength * 2); // Stronger squeeze = tighter coil
    }
  }

  // ATR% as additional volatility context
  if (indicators.atrPercent != null && indicators.atrPercent > 0) {
    if (indicators.atrPercent > 4) score += 8;
    else if (indicators.atrPercent > 2.5) score += 5;
    else if (indicators.atrPercent < 0.8) score += 6; // Very compressed
  }

  // CCI extremes indicate volatility expansion
  if (indicators.cci != null) {
    const absCCI = Math.abs(indicators.cci);
    if (absCCI > 200) score += 6;
    else if (absCCI > 100) score += 3;
    else if (absCCI < 30) score += 4;
  }

  // NATR — normalized ATR, cross-asset comparable volatility
  if (indicators.natr != null && indicators.natr > 0) {
    if (indicators.natr > 5) score += 10;       // High volatility regime
    else if (indicators.natr > 3) score += 6;   // Elevated
    else if (indicators.natr > 1.5) score += 3; // Normal
    else score += 6;                             // Very compressed = breakout candidate
  }

  // DVE regime-based scoring
  if (candidate.dve) {
    const { regime, signalStrength } = candidate.dve;
    if (regime === 'compression') score += 6;
    else if (regime === 'expansion') score += 5 + signalStrength * 0.08;
    else if (regime === 'climax') score -= 10;
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
    if (indicators.rsi > 50 && indicators.rsi < 70) score += 10;
    else if (indicators.rsi < 50 && indicators.rsi > 30) score += 5;
    else if (indicators.rsi > 70) score -= 5;
    else if (indicators.rsi < 30) score -= 5;
  }

  // MACD histogram positive = bullish momentum
  if (indicators.macd?.histogram) {
    score += indicators.macd.histogram > 0 ? 10 : -5;
  }

  // Stochastic
  if (indicators.stochK !== undefined) {
    if (indicators.stochK > 20 && indicators.stochK < 80) score += 5;
    if (indicators.stochK > 80) score -= 5;
    if (indicators.stochK < 20) score -= 5;
  }

  // ── Change % — real price momentum ──
  if (indicators.change != null) {
    const absPct = Math.abs(indicators.change);
    if (absPct > 5) score += 12;       // Big move = strong momentum
    else if (absPct > 2) score += 8;   // Solid move
    else if (absPct > 1) score += 4;   // Modest move
    else if (absPct < 0.3) score -= 4; // Dead flat

    // DI direction + price change agreement = confirmed momentum
    if (indicators.plusDI != null && indicators.minusDI != null) {
      const diBullish = indicators.plusDI > indicators.minusDI;
      const priceUp = indicators.change > 0;
      if (diBullish === priceUp) score += 6; // DI and price agree
      else score -= 3; // Divergence
    }
  }

  // Directional pressure from DVE
  if (candidate.dve) {
    const dirScore = Math.abs(candidate.dve.directionalScore);
    score += dirScore * 0.15;
  }

  // ROC — pure rate-of-change momentum
  if (indicators.roc != null) {
    const absRoc = Math.abs(indicators.roc);
    if (absRoc > 8) score += 10;       // Strong momentum
    else if (absRoc > 4) score += 6;   // Moderate
    else if (absRoc > 1.5) score += 3; // Mild
    else score -= 3;                    // Stalled
  }

  // Williams %R — momentum confirmation from overbought/oversold zones
  if (indicators.willr != null) {
    if (indicators.willr > -20) score += 4;      // Overbought = strong bullish momentum
    else if (indicators.willr < -80) score += 4; // Oversold = strong bearish momentum
    else if (indicators.willr > -40 && indicators.willr < -60) score -= 2; // Mid-range = no momentum
  }

  return clamp(score);
}

function scoreAsymmetryDimension(candidate: DiscoveryCandidate): number {
  let score = 40; // Lower baseline
  const { indicators } = candidate;

  // ── Bollinger Band position — mean reversion asymmetry ──
  if (indicators.bbUpper != null && indicators.bbLower != null && indicators.bbMiddle != null && indicators.price) {
    const bandRange = indicators.bbUpper - indicators.bbLower;
    if (bandRange > 0) {
      const pctB = (indicators.price - indicators.bbLower) / bandRange;
      // Far from middle in either direction = high asymmetry potential
      if (pctB > 0.9) score += 14;        // Near upper band — short asymmetry
      else if (pctB < 0.1) score += 14;   // Near lower band — long asymmetry
      else if (pctB > 0.75 || pctB < 0.25) score += 8; // Moderate
      else score += 2;                     // Mid-band = low asymmetry

      // Distance from BB middle (mean) — larger = more reversion asymmetry
      const distFromMid = Math.abs((indicators.price - indicators.bbMiddle) / indicators.bbMiddle) * 100;
      if (distFromMid > 5) score += 6;
      else if (distFromMid > 2) score += 3;
    }
  }

  // VWAP distance — mean reversion potential creates asymmetry
  if (indicators.vwap && indicators.price) {
    const vwapDist = Math.abs((indicators.price - indicators.vwap) / indicators.vwap) * 100;
    if (vwapDist > 3) score += 10;
    else if (vwapDist > 1.5) score += 5;
    else score += 2;
  }

  // RSI extremes = reverse asymmetry
  if (indicators.rsi != null) {
    if (indicators.rsi < 25 || indicators.rsi > 75) score += 8;
    else if (indicators.rsi < 35 || indicators.rsi > 65) score += 4;
  }

  // Williams %R extreme positioning = mean-reversion asymmetry
  if (indicators.willr != null) {
    if (indicators.willr > -5 || indicators.willr < -95) score += 10;  // Extreme positioning
    else if (indicators.willr > -15 || indicators.willr < -85) score += 6;
    else if (indicators.willr > -25 || indicators.willr < -75) score += 3;
  }

  // Aroon extreme — continuation asymmetry
  if (indicators.aroonUp != null && indicators.aroonDown != null) {
    const aroonSpread = Math.abs(indicators.aroonUp - indicators.aroonDown);
    if (aroonSpread > 70) score += 6;
    else if (aroonSpread > 40) score += 3;
  }

  // Capital flow conviction indicates positional asymmetry
  if (candidate.capitalFlow) {
    score += (candidate.capitalFlow.conviction - 50) * 0.4;
  }

  // High gamma environment (equities) = strong magnet levels
  if (candidate.capitalFlow?.gammaState === 'Negative') {
    score += 8;
  }

  // EMA200 displacement
  if (indicators.price && indicators.ema200) {
    const ema200Pct = Math.abs((indicators.price - indicators.ema200) / indicators.ema200) * 100;
    if (ema200Pct > 15) score += 4;
    else if (ema200Pct > 5) score += 2;
  }

  return clamp(score);
}

function scoreParticipationDimension(candidate: DiscoveryCandidate): number {
  let score = 35; // Lower baseline — let real indicators drive
  const { indicators } = candidate;

  // MFI (Money Flow Index) — combines price+volume, direct participation signal
  if (indicators.mfi != null) {
    if (indicators.mfi > 70) score += 18;
    else if (indicators.mfi > 55) score += 12;
    else if (indicators.mfi > 40) score += 6;
    else if (indicators.mfi < 25) score += 10;
    else score += 2;
  }

  // OBV presence — on-balance volume shows cumulative participation
  if (indicators.obv != null && indicators.volume != null) {
    if (indicators.volume > 0) score += 5;
  }

  // Volume presence check
  if (indicators.volume != null) {
    if (indicators.volume > 0) score += 4;
  } else {
    score -= 8;
  }

  // Volume vs average (when available)
  if (indicators.volume && indicators.avgVolume) {
    const volRatio = indicators.volume / indicators.avgVolume;
    if (volRatio > 2.0) score += 15;
    else if (volRatio > 1.5) score += 10;
    else if (volRatio > 1.0) score += 5;
    else score -= 5;
  }

  // ── Change % + Volume = conviction confirmation ──
  if (indicators.change != null && indicators.volume != null && indicators.volume > 0) {
    const absPct = Math.abs(indicators.change);
    // Big move on volume = high participation
    if (absPct > 3) score += 8;
    else if (absPct > 1.5) score += 4;
    // Small move on volume = accumulation/distribution (still participation)
    else if (absPct < 0.5) score += 2;
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

  // Stochastic as participation proxy
  if (indicators.stochK != null) {
    if (indicators.stochK > 80 || indicators.stochK < 20) score += 4;
  }

  // Chaikin A/D Line — volume-weighted accumulation/distribution
  if (indicators.ad != null && indicators.volume != null && indicators.volume > 0) {
    // Positive A/D = accumulation (buying participation), negative = distribution
    // Score the magnitude relative to volume for meaningful signal
    score += 5; // Has A/D data at all = participation signal present
  }

  // BOP — buyer/seller balance as participation quality
  if (indicators.bop != null) {
    const absBop = Math.abs(indicators.bop);
    if (absBop > 0.6) score += 6;       // Strong conviction buying or selling
    else if (absBop > 0.3) score += 3;  // Moderate conviction
    else score -= 2;                     // No conviction = weak participation
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
    assetType: candidate.assetType,
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
