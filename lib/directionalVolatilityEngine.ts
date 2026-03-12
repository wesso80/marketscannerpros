// ═══════════════════════════════════════════════════════════════════════════
// Directional Volatility Engine (DVE) — Core Engine
// 5-layer pure computation: no side effects, no API calls, no database.
// 17 exported functions + orchestrator.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  DVEInput,
  DVEIndicatorInput,
  DVEReading,
  VolatilityState,
  VolRegime,
  RateDirection,
  DirectionalPressure,
  DirectionalBias,
  ZoneDurationStats,
  PhasePersistence,
  DVESignal,
  DVESignalType,
  DVEInvalidation,
  SignalProjection,
  BreakoutReadiness,
  VolatilityTrap,
  ExhaustionRisk,
  StateTransition,
  DVEDataQuality,
  DVEFlag,
} from './directionalVolatilityEngine.types';

import {
  BBWP,
  VOL_REGIME,
  VHM,
  STOCHASTIC,
  DIRECTION_WEIGHTS,
  BREAKOUT_WEIGHTS,
  TRAP,
  EXHAUSTION,
  SIGNAL_STRENGTH,
  PROJECTION,
  MIN_DATA,
  INVALIDATION,
} from './directionalVolatilityEngine.constants';

// ── Helpers ──────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sma(arr: number[], period: number): number {
  if (arr.length < period) return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  let sum = 0;
  for (let i = arr.length - period; i < arr.length; i++) sum += arr[i];
  return sum / period;
}

function smaSeries(arr: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) {
      out.push(NaN);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += arr[j];
      out.push(sum / period);
    }
  }
  return out;
}

function stdDev(arr: number[], startIdx: number, len: number): number {
  let sum = 0;
  for (let i = startIdx; i < startIdx + len; i++) sum += arr[i];
  const mean = sum / len;
  let sq = 0;
  for (let i = startIdx; i < startIdx + len; i++) sq += (arr[i] - mean) ** 2;
  return Math.sqrt(sq / len);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 1 — LINEAR VOLATILITY STATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 1. computeBBWP — Bollinger Band Width Percentile (THE core metric)
 */
export function computeBBWP(
  closes: number[],
  bbLen: number = BBWP.BB_LENGTH,
  lookback: number = BBWP.LOOKBACK,
): { bbwp: number; bbwpSeries: number[] } {
  if (closes.length < bbLen + 1) {
    return { bbwp: 50, bbwpSeries: [] };
  }

  // Step 1: Compute BB width series
  const widths: number[] = [];
  for (let i = bbLen - 1; i < closes.length; i++) {
    const start = i - bbLen + 1;
    let sum = 0;
    for (let j = start; j <= i; j++) sum += closes[j];
    const basis = sum / bbLen;
    const dev = stdDev(closes, start, bbLen);
    const upper = basis + BBWP.STD_MULTIPLIER * dev;
    const lower = basis - BBWP.STD_MULTIPLIER * dev;
    widths.push(basis > 0 ? (upper - lower) / basis : 0);
  }

  // Step 2: Percentile rank each width over lookback window
  const bbwpSeries: number[] = [];
  for (let i = 0; i < widths.length; i++) {
    const windowSize = Math.min(i + 1, lookback);
    const windowStart = i - windowSize + 1;
    let count = 0;
    for (let j = windowStart; j <= i; j++) {
      if (widths[j] <= widths[i]) count++;
    }
    bbwpSeries.push((count / windowSize) * 100);
  }

  return {
    bbwp: bbwpSeries.length > 0 ? bbwpSeries[bbwpSeries.length - 1] : 50,
    bbwpSeries,
  };
}

/**
 * 2. computeVHMHistogram — Rate of BBWP change + acceleration
 */
export function computeVHMHistogram(
  bbwpSeries: number[],
  smoothPeriod: number = VHM.SMOOTH_PERIOD,
): {
  rate: number;
  smoothed: number;
  sma5: number;
  acceleration: number;
  direction: RateDirection;
} {
  if (bbwpSeries.length < 2) {
    return { rate: 0, smoothed: 0, sma5: bbwpSeries[0] ?? 50, acceleration: 0, direction: 'flat' };
  }

  // Rate of change series
  const roc: number[] = [];
  for (let i = 1; i < bbwpSeries.length; i++) {
    roc.push(bbwpSeries[i] - bbwpSeries[i - 1]);
  }

  // Smoothed rate (SMA of rate-of-change)
  const smoothedSeries = smaSeries(roc, smoothPeriod);
  const latestSmoothed = smoothedSeries.length > 0
    ? (isNaN(smoothedSeries[smoothedSeries.length - 1])
      ? roc[roc.length - 1]
      : smoothedSeries[smoothedSeries.length - 1])
    : 0;
  const prevSmoothed = smoothedSeries.length > 1
    ? (isNaN(smoothedSeries[smoothedSeries.length - 2])
      ? (roc.length > 1 ? roc[roc.length - 2] : latestSmoothed)
      : smoothedSeries[smoothedSeries.length - 2])
    : latestSmoothed;

  // SMA5 of BBWP itself
  const sma5Val = sma(bbwpSeries, BBWP.SMA_PERIOD);

  // Acceleration (second derivative)
  const latestRate = roc[roc.length - 1];
  const prevRate = roc.length > 1 ? roc[roc.length - 2] : latestRate;
  const acceleration = latestRate - prevRate;

  // Direction from smoothed rate trend
  let direction: RateDirection = 'flat';
  if (latestSmoothed > prevSmoothed + 0.01) direction = 'accelerating';
  else if (latestSmoothed < prevSmoothed - 0.01) direction = 'decelerating';

  return {
    rate: latestRate,
    smoothed: latestSmoothed,
    sma5: sma5Val,
    acceleration,
    direction,
  };
}

/**
 * 3. classifyVolRegime — Map BBWP + context to regime label + confidence
 */
export function classifyVolRegime(
  bbwp: number,
  rateDirection: RateDirection,
  inSqueeze?: boolean,
): { regime: VolRegime; confidence: number } {
  let regime: VolRegime;
  let confidence: number;

  if (bbwp < VOL_REGIME.COMPRESSION_THRESHOLD) {
    regime = 'compression';
    confidence = ((VOL_REGIME.COMPRESSION_THRESHOLD - bbwp) / VOL_REGIME.COMPRESSION_THRESHOLD) * 100;
  } else if (bbwp > VOL_REGIME.CLIMAX_THRESHOLD) {
    regime = 'climax';
    confidence = ((bbwp - VOL_REGIME.CLIMAX_THRESHOLD) / (100 - VOL_REGIME.CLIMAX_THRESHOLD)) * 100;
  } else if (bbwp > VOL_REGIME.EXPANSION_THRESHOLD) {
    regime = 'expansion';
    const distFromLow = (bbwp - VOL_REGIME.EXPANSION_THRESHOLD) / 20;
    const distFromHigh = (VOL_REGIME.CLIMAX_THRESHOLD - bbwp) / 20;
    confidence = Math.min(distFromLow, distFromHigh) * 100;
  } else if (rateDirection === 'accelerating' && bbwp > 15 && bbwp < 40) {
    regime = 'transition';
    confidence = 50;
  } else {
    regime = 'neutral';
    const distFromLow = (bbwp - VOL_REGIME.COMPRESSION_THRESHOLD) / 27.5;
    const distFromHigh = (VOL_REGIME.NEUTRAL_UPPER - bbwp) / 27.5;
    confidence = Math.min(distFromLow, distFromHigh) * 100;
  }

  return { regime, confidence: clamp(confidence, 0, 100) };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 2 — DIRECTIONAL BIAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 4. computeStochasticMomentum — K/D spread, slopes, midline filter
 */
export function computeStochasticMomentum(indicators?: DVEIndicatorInput): number {
  if (!indicators) return 0;
  const { stochK, stochD, stochMomentum, stochKSlope, stochDSlope } = indicators;

  // If no stochastic data at all, return 0
  if (stochK == null && stochD == null && stochMomentum == null) return 0;

  let score = 0;
  const spread = stochMomentum ?? ((stochK ?? 50) - (stochD ?? 50));

  // K-D spread (±4)
  if (spread > 0) score += DIRECTION_WEIGHTS.stochasticMomentum.components.kd_spread;
  else if (spread < 0) score -= DIRECTION_WEIGHTS.stochasticMomentum.components.kd_spread;

  // K slope (±3)
  if (stochKSlope != null) {
    if (stochKSlope > 0) score += DIRECTION_WEIGHTS.stochasticMomentum.components.k_slope;
    else if (stochKSlope < 0) score -= DIRECTION_WEIGHTS.stochasticMomentum.components.k_slope;
  }

  // D slope (±3)
  if (stochDSlope != null) {
    if (stochDSlope > 0) score += DIRECTION_WEIGHTS.stochasticMomentum.components.d_slope;
    else if (stochDSlope < 0) score -= DIRECTION_WEIGHTS.stochasticMomentum.components.d_slope;
  }

  // Midline bonus (±5)
  const k = stochK ?? 50;
  if (k > STOCHASTIC.MIDLINE && spread > 0) {
    score += DIRECTION_WEIGHTS.stochasticMomentum.components.midline_bonus;
  } else if (k < STOCHASTIC.MIDLINE && spread < 0) {
    score -= DIRECTION_WEIGHTS.stochasticMomentum.components.midline_bonus;
  }

  return clamp(score, -DIRECTION_WEIGHTS.stochasticMomentum.max, DIRECTION_WEIGHTS.stochasticMomentum.max);
}

/**
 * 5. computeDirectionalPressure — Score all components, sum to -100..+100
 */
export function computeDirectionalPressure(input: DVEInput): DirectionalPressure {
  const ind = input.indicators;
  const opts = input.options;
  const liq = input.liquidity;
  const details: string[] = [];

  // Stochastic Momentum (-15 to +15)
  let stochScore: number;
  const hasStochData = ind && (ind.stochK != null || ind.stochD != null || ind.stochMomentum != null);
  if (hasStochData) {
    stochScore = computeStochasticMomentum(ind);
    details.push(`Stoch momentum: ${stochScore > 0 ? '+' : ''}${stochScore}/15`);
  } else {
    // Fallback to MACD-only
    stochScore = 0;
    if (ind?.macd != null) {
      if (ind.macd > 0) stochScore += 5;
      else if (ind.macd < 0) stochScore -= 5;
    }
    if (ind?.macdHist != null) {
      if (ind.macdHist > 0) stochScore += 5;
      else if (ind.macdHist < 0) stochScore -= 5;
    }
    stochScore = clamp(stochScore, -10, 10);
    details.push(`MACD fallback: ${stochScore > 0 ? '+' : ''}${stochScore}/15`);
  }

  // Trend Structure (-20 to +20)
  let trendScore = 0;
  if (ind?.sma20 != null && input.price.currentPrice > ind.sma20) {
    trendScore += 5;
    details.push('Price > SMA20 (+5)');
  } else if (ind?.sma20 != null) {
    trendScore -= 5;
    details.push('Price < SMA20 (-5)');
  }
  if (ind?.sma50 != null && input.price.currentPrice > ind.sma50) {
    trendScore += 5;
    details.push('Price > SMA50 (+5)');
  } else if (ind?.sma50 != null) {
    trendScore -= 5;
    details.push('Price < SMA50 (-5)');
  }
  if (ind?.sma20 != null && ind?.sma50 != null) {
    if (ind.sma20 > ind.sma50) { trendScore += 5; details.push('SMA20 > SMA50 (+5)'); }
    else { trendScore -= 5; details.push('SMA20 < SMA50 (-5)'); }
  }
  if (ind?.adx != null) {
    if (ind.adx > 25) {
      // ADX confirms whichever direction we already have
      const adxDir = trendScore >= 0 ? 5 : -5;
      trendScore += adxDir;
      details.push(`ADX ${ind.adx.toFixed(0)} confirms trend (${adxDir > 0 ? '+' : ''}${adxDir})`);
    }
  }
  trendScore = clamp(trendScore, -DIRECTION_WEIGHTS.trendStructure.max, DIRECTION_WEIGHTS.trendStructure.max);

  // Options Flow (-20 to +20)
  let optScore = 0;
  if (opts?.putCallRatio != null) {
    if (opts.putCallRatio < 0.7) { optScore += 8; details.push('P/C < 0.7 call-heavy (+8)'); }
    else if (opts.putCallRatio > 1.3) { optScore -= 8; details.push('P/C > 1.3 put-heavy (-8)'); }
  }
  if (opts?.unusualActivity === 'Very High' || opts?.unusualActivity === 'Elevated') {
    const sentDir = opts.sentiment === 'Bullish' ? 7 : opts.sentiment === 'Bearish' ? -7 : 0;
    optScore += sentDir;
    if (sentDir !== 0) details.push(`Unusual activity ${opts.sentiment} (${sentDir > 0 ? '+' : ''}${sentDir})`);
  }
  if (opts?.ivRank != null) {
    if (opts.ivRank < 20) { optScore += 5; details.push('IV Rank < 20 coiled (+5)'); }
    else if (opts.ivRank > 80) { optScore -= 5; details.push('IV Rank > 80 elevated (-5)'); }
  }
  optScore = clamp(optScore, -DIRECTION_WEIGHTS.optionsFlow.max, DIRECTION_WEIGHTS.optionsFlow.max);

  // Volume Expansion (-10 to +10)
  let volScore = 0;
  if (input.price.volume != null && input.price.avgVolume != null && input.price.avgVolume > 0) {
    const volRatio = input.price.volume / input.price.avgVolume;
    if (volRatio > 1.5) {
      volScore = input.price.changePct > 0 ? 10 : input.price.changePct < 0 ? -10 : 0;
      if (volScore !== 0) details.push(`Volume ${volRatio.toFixed(1)}x avg (${volScore > 0 ? '+' : ''}${volScore})`);
    }
  }
  volScore = clamp(volScore, -DIRECTION_WEIGHTS.volumeExpansion.max, DIRECTION_WEIGHTS.volumeExpansion.max);

  // Dealer Gamma (-15 to +15)
  let gammaScore = 0;
  if (opts?.dealerGamma) {
    if (opts.dealerGamma.includes('Short gamma')) {
      // Price moves amplified in trending direction
      gammaScore = trendScore >= 0 ? 15 : -15;
      details.push(`Short gamma amplifies (${gammaScore > 0 ? '+' : ''}${gammaScore})`);
    } else if (opts.dealerGamma.includes('Long gamma')) {
      // Dampening — slight counter-trend
      gammaScore = trendScore >= 0 ? -5 : 5;
      details.push(`Long gamma dampens (${gammaScore > 0 ? '+' : ''}${gammaScore})`);
    }
  }
  gammaScore = clamp(gammaScore, -DIRECTION_WEIGHTS.dealerGamma.max, DIRECTION_WEIGHTS.dealerGamma.max);

  // Funding Rate (-10 to +10) — crypto only
  let fundingScore = 0;
  if (liq?.fundingRatePercent != null) {
    if (liq.fundingRatePercent > 0.03) { fundingScore = 10; details.push('Funding positive (+10)'); }
    else if (liq.fundingRatePercent < -0.03) { fundingScore = -10; details.push('Funding negative (-10)'); }
  }
  fundingScore = clamp(fundingScore, -DIRECTION_WEIGHTS.fundingRate.max, DIRECTION_WEIGHTS.fundingRate.max);

  // Market Breadth (-10 to +10)
  let breadthScore = 0;
  if (input.mpeComposite != null) {
    if (input.mpeComposite > 70) { breadthScore = 10; details.push('MPE > 70 (+10)'); }
    else if (input.mpeComposite < 30) { breadthScore = -10; details.push('MPE < 30 (-10)'); }
  }
  breadthScore = clamp(breadthScore, -DIRECTION_WEIGHTS.marketBreadth.max, DIRECTION_WEIGHTS.marketBreadth.max);

  const totalScore = clamp(
    stochScore + trendScore + optScore + volScore + gammaScore + fundingScore + breadthScore,
    -100, 100,
  );

  let bias: DirectionalBias = 'neutral';
  if (totalScore > STOCHASTIC.BIAS_THRESHOLD) bias = 'bullish';
  else if (totalScore < -STOCHASTIC.BIAS_THRESHOLD) bias = 'bearish';

  return {
    score: totalScore,
    bias,
    confidence: Math.abs(totalScore),
    components: {
      stochasticMomentum: stochScore,
      trendStructure: trendScore,
      optionsFlow: optScore,
      volumeExpansion: volScore,
      dealerGamma: gammaScore,
      fundingRate: fundingScore,
      marketBreadth: breadthScore,
    },
    componentDetails: details,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 3 — PHASE PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 6. computeZoneDurationStats — Episode lengths, average/median/max, age percentile
 */
export function computeZoneDurationStats(
  series: number[],
  threshold: number,
  side: 'below' | 'above',
): ZoneDurationStats {
  const empty: ZoneDurationStats = {
    currentBars: 0, averageBars: 0, medianBars: 0, maxBars: 0, agePercentile: 0, episodeCount: 0,
  };
  if (series.length === 0) return empty;

  const inZone = (v: number) => side === 'below' ? v <= threshold : v >= threshold;

  // Scan for all episodes
  const episodes: number[] = [];
  let epLen = 0;
  let inEp = false;

  for (let i = 0; i < series.length; i++) {
    if (inZone(series[i])) {
      if (!inEp) { inEp = true; epLen = 0; }
      epLen++;
    } else {
      if (inEp) {
        episodes.push(epLen);
        inEp = false;
        epLen = 0;
      }
    }
  }

  // Determine current episode
  let currentBars = 0;
  const lastInZone = series.length > 0 && inZone(series[series.length - 1]);
  if (lastInZone && inEp) {
    // Current episode is the active one — don't add to completed
    currentBars = epLen;
  } else if (lastInZone) {
    currentBars = epLen;
  }

  // Completed episodes (excluding current active one)
  const completedEpisodes = episodes; // episodes only contains finished ones

  if (completedEpisodes.length === 0) {
    return { ...empty, currentBars };
  }

  const avgBars = completedEpisodes.reduce((a, b) => a + b, 0) / completedEpisodes.length;
  const medBars = median(completedEpisodes);
  const maxBars = Math.max(...completedEpisodes);

  // Age percentile: what % of completed episodes were <= currentBars
  let agePercentile = 0;
  if (currentBars > 0) {
    const shorterOrEqual = completedEpisodes.filter(e => e <= currentBars).length;
    agePercentile = (shorterOrEqual / completedEpisodes.length) * 100;
  }

  return {
    currentBars,
    averageBars: avgBars,
    medianBars: medBars,
    maxBars,
    agePercentile,
    episodeCount: completedEpisodes.length,
  };
}

/**
 * 7. computePhasePersistence — Contraction + expansion continuation/exit probs
 */
export function computePhasePersistence(args: {
  bbwp: number;
  bbwpSma5: number;
  volatility: VolatilityState;
  contractionStats: ZoneDurationStats;
  expansionStats: ZoneDurationStats;
  direction: DirectionalPressure;
  stochK?: number | null;
  stochKSlope?: number | null;
}): PhasePersistence {
  const { bbwp, bbwpSma5, volatility, contractionStats, expansionStats, direction, stochK, stochKSlope } = args;

  // ── Contraction (bbwp < 15) ──
  let contractionCont = 0;
  let contractionExit = 0;
  const contractionActive = bbwp < VOL_REGIME.COMPRESSION_THRESHOLD;

  if (contractionActive) {
    // Continuation
    contractionCont += 40; // base
    if (bbwpSma5 <= VOL_REGIME.COMPRESSION_THRESHOLD) contractionCont += 15;
    if (contractionStats.currentBars < contractionStats.averageBars) contractionCont += 15;
    if (stochKSlope == null || stochKSlope <= 0) contractionCont += 10;
    if (direction.bias === 'neutral') contractionCont += 10;
    if (volatility.rateDirection === 'flat' || volatility.rateDirection === 'decelerating') contractionCont += 10;

    // Exit
    if (contractionStats.currentBars >= contractionStats.averageBars) contractionExit += 15;
    if (contractionStats.currentBars >= contractionStats.medianBars) contractionExit += 10;
    if (contractionStats.agePercentile > 70) contractionExit += 15;
    if (volatility.rateDirection === 'accelerating') contractionExit += 15;
    // Check if sma5 turning up (sma5 > bbwp could mean lagging below — use rate direction)
    if (bbwpSma5 > bbwp && volatility.rateOfChange > 0) contractionExit += 15;
    if (stochKSlope != null && stochKSlope > 0 && stochK != null && stochK > (args as { stochD?: number }).stochD!) {
      contractionExit += 15;
    } else if (stochKSlope != null && stochKSlope > 0) {
      contractionExit += 10;
    }
    if (bbwp > VOL_REGIME.COMPRESSION_THRESHOLD - 2) contractionExit += 15; // approaching 15
  }

  // ── Expansion (bbwp > 90) ──
  let expansionCont = 0;
  let expansionExit = 0;
  const expansionActive = bbwp > VOL_REGIME.CLIMAX_THRESHOLD;

  if (expansionActive) {
    // Continuation
    expansionCont += 40; // base
    if (bbwpSma5 >= VOL_REGIME.CLIMAX_THRESHOLD) expansionCont += 15;
    if (expansionStats.currentBars < expansionStats.averageBars) expansionCont += 15;
    if (direction.bias !== 'neutral') expansionCont += 10;
    if (stochKSlope != null && ((direction.bias === 'bullish' && stochKSlope > 0) || (direction.bias === 'bearish' && stochKSlope < 0))) {
      expansionCont += 10;
    }

    // Exit
    if (expansionStats.currentBars >= expansionStats.averageBars) expansionExit += 15;
    if (expansionStats.agePercentile > 70) expansionExit += 15;
    if (volatility.rateDirection === 'decelerating') expansionExit += 15;
    if (stochKSlope != null && ((direction.bias === 'bullish' && stochKSlope < 0) || (direction.bias === 'bearish' && stochKSlope > 0))) {
      expansionExit += 15;
    }
    if (bbwp < VOL_REGIME.CLIMAX_THRESHOLD + 2) expansionExit += 20; // approaching 90 from above
  }

  return {
    contraction: {
      active: contractionActive,
      continuationProbability: clamp(contractionCont, 0, 100),
      exitProbability: clamp(contractionExit, 0, 100),
      stats: contractionStats,
    },
    expansion: {
      active: expansionActive,
      continuationProbability: clamp(expansionCont, 0, 100),
      exitProbability: clamp(expansionExit, 0, 100),
      stats: expansionStats,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 4 — SIGNAL TRIGGERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 8. detectSignal — Fire one of 4 signal types or 'none'
 */
export function detectSignal(
  volState: VolatilityState,
  direction: DirectionalPressure,
  bbwpSeries: number[],
  priceInput: DVEInput['price'],
  exhaustionRisk?: ExhaustionRisk,
): DVESignal {
  const noSignal: DVESignal = {
    type: 'none', state: 'idle', active: false, strength: 0, triggerReason: [],
  };

  if (bbwpSeries.length < 2) return noSignal;

  const recentBars = Math.min(STOCHASTIC.RECENT_BARS, bbwpSeries.length);
  const recentSlice = bbwpSeries.slice(-recentBars);
  const wasInCompression = recentSlice.some(v => v <= VOL_REGIME.COMPRESSION_THRESHOLD);
  const stochMom = computeStochasticMomentum({ stochK: null, stochD: null, stochMomentum: null, ...({} as DVEIndicatorInput) });

  // Compute stoch momentum from direction components (since we already have the score)
  const stochBullish = direction.components.stochasticMomentum > 0;
  const stochBearish = direction.components.stochasticMomentum < 0;

  const bbwp = volState.bbwp;
  const sma5 = volState.bbwpSma5;
  const lastClose = priceInput.currentPrice;
  const lastIdx = priceInput.closes.length - 1;

  function makeTriggerBar(): Pick<DVESignal, 'triggerBarPrice' | 'triggerBarOpen' | 'triggerBarHigh' | 'triggerBarLow'> {
    return {
      triggerBarPrice: lastClose,
      triggerBarOpen: priceInput.opens?.[lastIdx] ?? lastClose,
      triggerBarHigh: priceInput.highs?.[lastIdx] ?? lastClose,
      triggerBarLow: priceInput.lows?.[lastIdx] ?? lastClose,
    };
  }

  // ── COMPRESSION RELEASE UP ──
  if (
    wasInCompression &&
    bbwp > VOL_REGIME.COMPRESSION_THRESHOLD &&
    (bbwp > sma5 || volState.rateDirection === 'accelerating') &&
    stochBullish &&
    direction.bias === 'bullish'
  ) {
    return {
      type: 'compression_release_up',
      state: 'fired',
      active: true,
      strength: 0, // computed by computeSignalStrength
      ...makeTriggerBar(),
      triggerReason: [
        'BBWP broke above 15',
        `Stoch momentum bullish (+${direction.components.stochasticMomentum})`,
        `Direction: ${direction.bias} (${direction.score > 0 ? '+' : ''}${direction.score})`,
      ],
    };
  }

  // ── COMPRESSION RELEASE DOWN ──
  if (
    wasInCompression &&
    bbwp > VOL_REGIME.COMPRESSION_THRESHOLD &&
    (bbwp > sma5 || volState.rateDirection === 'accelerating') &&
    stochBearish &&
    direction.bias === 'bearish'
  ) {
    return {
      type: 'compression_release_down',
      state: 'fired',
      active: true,
      strength: 0,
      ...makeTriggerBar(),
      triggerReason: [
        'BBWP broke above 15',
        `Stoch momentum bearish (${direction.components.stochasticMomentum})`,
        `Direction: ${direction.bias} (${direction.score})`,
      ],
    };
  }

  // ── EXPANSION CONTINUATION UP ──
  if (
    bbwp >= VOL_REGIME.CLIMAX_THRESHOLD &&
    sma5 >= VOL_REGIME.CLIMAX_THRESHOLD &&
    stochBullish &&
    direction.bias === 'bullish' &&
    (!exhaustionRisk || (exhaustionRisk.label !== 'HIGH' && exhaustionRisk.label !== 'EXTREME'))
  ) {
    return {
      type: 'expansion_continuation_up',
      state: 'fired',
      active: true,
      strength: 0,
      ...makeTriggerBar(),
      triggerReason: [
        `BBWP at ${bbwp.toFixed(1)} (climax zone)`,
        `SMA5 at ${sma5.toFixed(1)} confirms`,
        `Stoch momentum bullish`,
        `Low exhaustion risk`,
      ],
    };
  }

  // ── EXPANSION CONTINUATION DOWN ──
  if (
    bbwp >= VOL_REGIME.CLIMAX_THRESHOLD &&
    sma5 >= VOL_REGIME.CLIMAX_THRESHOLD &&
    stochBearish &&
    direction.bias === 'bearish' &&
    (!exhaustionRisk || (exhaustionRisk.label !== 'HIGH' && exhaustionRisk.label !== 'EXTREME'))
  ) {
    return {
      type: 'expansion_continuation_down',
      state: 'fired',
      active: true,
      strength: 0,
      ...makeTriggerBar(),
      triggerReason: [
        `BBWP at ${bbwp.toFixed(1)} (climax zone)`,
        `SMA5 at ${sma5.toFixed(1)} confirms`,
        `Stoch momentum bearish`,
        `Low exhaustion risk`,
      ],
    };
  }

  // Check if approaching a signal (armed state)
  if (wasInCompression && bbwp <= VOL_REGIME.COMPRESSION_THRESHOLD && bbwp > VOL_REGIME.COMPRESSION_THRESHOLD - 3) {
    return {
      ...noSignal,
      state: 'armed',
      triggerReason: ['Approaching compression exit threshold'],
    };
  }

  return noSignal;
}

/**
 * 9. computeSignalStrength — Composite: BBWP cross + SMA5 confirm + stoch + direction
 */
export function computeSignalStrength(
  signal: DVESignal,
  volState: VolatilityState,
  direction: DirectionalPressure,
): number {
  if (signal.type === 'none') return 0;

  let strength = 0;

  // BBWP Cross (0-30)
  const isRelease = signal.type.startsWith('compression_release');
  const threshold = isRelease ? VOL_REGIME.COMPRESSION_THRESHOLD : VOL_REGIME.CLIMAX_THRESHOLD;
  const distance = isRelease
    ? volState.bbwp - threshold
    : volState.bbwp - threshold;

  if (distance > 5) strength += SIGNAL_STRENGTH.BBWP_CROSS_WEIGHT;
  else if (distance > 3) strength += 20;
  else if (distance > 0) strength += 10;

  // SMA5 Confirmation (0-20)
  if (isRelease) {
    if (volState.bbwpSma5 > threshold) strength += SIGNAL_STRENGTH.SMA5_CONFIRM_WEIGHT;
    else if (volState.rateDirection === 'accelerating') strength += 10;
  } else {
    if (volState.bbwpSma5 >= threshold) strength += SIGNAL_STRENGTH.SMA5_CONFIRM_WEIGHT;
    else if (volState.bbwpSma5 >= threshold - 3) strength += 10;
  }

  // Stochastic Alignment (0-25)
  const absStoch = Math.abs(direction.components.stochasticMomentum);
  if (absStoch >= 15) strength += SIGNAL_STRENGTH.STOCH_ALIGN_WEIGHT;
  else if (absStoch >= 10) strength += 17;
  else if (absStoch >= 5) strength += 8;

  // Directional Alignment (0-25)
  strength += (Math.abs(direction.score) / 100) * SIGNAL_STRENGTH.DIRECTION_ALIGN_WEIGHT;

  return clamp(Math.round(strength), 0, 100);
}

/**
 * 10. computeInvalidation — Price, phase, smoothed-phase invalidation levels
 */
export function computeInvalidation(
  signal: DVESignal,
  volState: VolatilityState,
  priceInput: DVEInput['price'],
): DVEInvalidation {
  const empty: DVEInvalidation = {
    invalidated: false,
    invalidationMode: INVALIDATION.MODE,
    ruleSet: [],
  };

  if (signal.type === 'none' || !signal.active) return empty;

  const isUp = signal.type.endsWith('_up');
  const isRelease = signal.type.startsWith('compression_release');
  const phaseThreshold = isRelease ? VOL_REGIME.COMPRESSION_THRESHOLD : VOL_REGIME.CLIMAX_THRESHOLD;

  // Price invalidation
  let priceInvalidation: number | undefined;
  if (isUp) {
    priceInvalidation = INVALIDATION.MODE === 'extreme'
      ? signal.triggerBarLow
      : signal.triggerBarOpen;
  } else {
    priceInvalidation = INVALIDATION.MODE === 'extreme'
      ? signal.triggerBarHigh
      : signal.triggerBarOpen;
  }

  const ruleSet: string[] = [];

  if (isUp) {
    if (INVALIDATION.MODE === 'extreme') {
      ruleSet.push(`Price below signal bar low (${priceInvalidation})`);
    } else {
      ruleSet.push(`Price below signal bar open (${priceInvalidation})`);
    }
  } else {
    if (INVALIDATION.MODE === 'extreme') {
      ruleSet.push(`Price above signal bar high (${priceInvalidation})`);
    } else {
      ruleSet.push(`Price above signal bar open (${priceInvalidation})`);
    }
  }

  if (isRelease) {
    ruleSet.push(`BBWP re-enters below ${phaseThreshold}`);
    ruleSet.push(`BBWP SMA5 re-enters below ${phaseThreshold}`);
  } else {
    ruleSet.push(`BBWP exits below ${phaseThreshold}`);
    ruleSet.push(`BBWP SMA5 exits below ${phaseThreshold}`);
  }

  // Check invalidation
  let invalidated = false;
  if (priceInvalidation != null) {
    if (isUp && priceInput.currentPrice < priceInvalidation) invalidated = true;
    if (!isUp && priceInput.currentPrice > priceInvalidation) invalidated = true;
  }
  if (isRelease && volState.bbwp < phaseThreshold) invalidated = true;
  if (!isRelease && volState.bbwp < phaseThreshold) invalidated = true;
  if (isRelease && volState.bbwpSma5 < phaseThreshold) invalidated = true;
  if (!isRelease && volState.bbwpSma5 < phaseThreshold) invalidated = true;

  return {
    priceInvalidation,
    phaseInvalidation: phaseThreshold,
    smoothedPhaseInvalidation: phaseThreshold,
    invalidated,
    invalidationMode: INVALIDATION.MODE,
    ruleSet,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 5 — OUTCOME PROJECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 11. computeSignalProjection — Historical outcome profiling per signal type
 */
export function computeSignalProjection(
  signalType: DVESignalType,
  closes: number[],
  bbwpSeries: number[],
): SignalProjection {
  const zeroed: SignalProjection = {
    signalType,
    expectedMovePct: 0,
    medianMovePct: 0,
    maxHistoricalMovePct: 0,
    averageBarsToMove: 0,
    hitRate: 0,
    sampleSize: 0,
  };

  if (signalType === 'none' || bbwpSeries.length < PROJECTION.FORWARD_BARS + 10) return zeroed;

  // Find historical signal instances based on phase transitions
  const isRelease = signalType.startsWith('compression_release');
  const isUp = signalType.endsWith('_up');
  const threshold = isRelease ? VOL_REGIME.COMPRESSION_THRESHOLD : VOL_REGIME.CLIMAX_THRESHOLD;

  const signalBars: number[] = [];

  // Map bbwpSeries indices to closes indices
  // bbwpSeries is shorter by (bbLen - 1) due to BB width computation
  // However, we align the end to the end of closes
  const offset = closes.length - bbwpSeries.length;

  for (let i = 1; i < bbwpSeries.length - PROJECTION.FORWARD_BARS; i++) {
    if (isRelease) {
      // Was below threshold, now above
      if (bbwpSeries[i - 1] <= threshold && bbwpSeries[i] > threshold) {
        signalBars.push(i);
      }
    } else {
      // Currently above climax threshold
      if (bbwpSeries[i] >= threshold && bbwpSeries[i - 1] >= threshold) {
        // Only count the first bar of each climax stretch
        if (i === 1 || bbwpSeries[i - 2] < threshold) {
          signalBars.push(i);
        }
      }
    }
  }

  if (signalBars.length < PROJECTION.MIN_SAMPLE_SIZE) {
    return { ...zeroed, sampleSize: signalBars.length };
  }

  const forwardReturns: number[] = [];
  const maxFavorableExcursions: number[] = [];
  const barsToMoves: number[] = [];

  for (const bar of signalBars) {
    const closeIdx = bar + offset;
    if (closeIdx < 0 || closeIdx + PROJECTION.FORWARD_BARS >= closes.length) continue;

    const entryPrice = closes[closeIdx];
    if (entryPrice <= 0) continue;

    const fwdReturn = ((closes[closeIdx + PROJECTION.FORWARD_BARS] - entryPrice) / entryPrice) * 100;
    forwardReturns.push(fwdReturn);

    // Max favorable excursion
    let maxMFE = 0;
    let mfeBars = 0;
    for (let j = 1; j <= PROJECTION.FORWARD_BARS; j++) {
      const ret = ((closes[closeIdx + j] - entryPrice) / entryPrice) * 100;
      const favorable = isUp ? ret : -ret;
      if (favorable > maxMFE) {
        maxMFE = favorable;
        mfeBars = j;
      }
    }
    maxFavorableExcursions.push(maxMFE);
    barsToMoves.push(mfeBars);
  }

  if (forwardReturns.length < PROJECTION.MIN_SAMPLE_SIZE) {
    return { ...zeroed, sampleSize: forwardReturns.length };
  }

  const expectedMovePct = forwardReturns.reduce((a, b) => a + b, 0) / forwardReturns.length;
  const medianMovePct = median(forwardReturns);
  const maxHistoricalMovePct = Math.max(...maxFavorableExcursions);
  const averageBarsToMove = barsToMoves.reduce((a, b) => a + b, 0) / barsToMoves.length;

  // Hit rate: % of favorable outcomes
  const hitCount = forwardReturns.filter(r => isUp ? r > 0 : r < 0).length;
  const hitRate = (hitCount / forwardReturns.length) * 100;

  return {
    signalType,
    expectedMovePct: Math.round(expectedMovePct * 100) / 100,
    medianMovePct: Math.round(medianMovePct * 100) / 100,
    maxHistoricalMovePct: Math.round(maxHistoricalMovePct * 100) / 100,
    averageBarsToMove: Math.round(averageBarsToMove * 10) / 10,
    hitRate: Math.round(hitRate * 10) / 10,
    sampleSize: forwardReturns.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPORTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 12. computeBreakoutReadiness — 4-bar breakdown (0-100)
 */
export function computeBreakoutReadiness(
  volState: VolatilityState,
  input: DVEInput,
): BreakoutReadiness {
  const details: string[] = [];

  // Vol Compression (0-40)
  let volComp = 0;
  if (volState.bbwp < 15) { volComp = 40; details.push('BBWP < 15: extreme compression (40/40)'); }
  else if (volState.bbwp < 25) { volComp = 30; details.push(`BBWP ${volState.bbwp.toFixed(1)}: moderate compression (30/40)`); }
  else if (volState.bbwp < 35) { volComp = 20; details.push(`BBWP ${volState.bbwp.toFixed(1)}: mild compression (20/40)`); }
  if (volState.inSqueeze) { volComp = Math.min(BREAKOUT_WEIGHTS.volCompression, volComp + 10); details.push('Squeeze active (+10)'); }

  // Time Alignment (0-30)
  let timeAlign = 0;
  const tf = input.time?.activeTFCount ?? 0;
  if (tf >= 4) { timeAlign = 30; details.push(`${tf} TFs active (30/30)`); }
  else if (tf >= 3) { timeAlign = 22; details.push(`${tf} TFs active (22/30)`); }
  else if (tf >= 2) { timeAlign = 15; details.push(`${tf} TFs active (15/30)`); }
  if (input.time?.hotZoneActive) { timeAlign = Math.min(BREAKOUT_WEIGHTS.timeAlignment, timeAlign + 8); details.push('Hot zone (+8)'); }

  // Gamma Wall (0-20)
  let gamma = 0;
  if (input.options?.maxPain != null && input.price.currentPrice > 0) {
    const dist = Math.abs(input.price.currentPrice - input.options.maxPain) / input.price.currentPrice * 100;
    if (dist < 1) { gamma = 20; details.push(`${dist.toFixed(1)}% from max pain (20/20)`); }
    else if (dist < 2) { gamma = 15; details.push(`${dist.toFixed(1)}% from max pain (15/20)`); }
  }
  if (input.options?.unusualActivity === 'Very High' || input.options?.unusualActivity === 'Elevated') {
    gamma = Math.min(BREAKOUT_WEIGHTS.gammaWall, gamma + 5);
    details.push('Unusual activity (+5)');
  }
  if (input.options?.dealerGamma?.includes('Short gamma')) {
    gamma = Math.min(BREAKOUT_WEIGHTS.gammaWall, gamma + 5);
    details.push('Short gamma (+5)');
  }

  // ADX Rising (0-10)
  let adxScore = 0;
  const adx = input.indicators?.adx;
  if (adx != null) {
    if (adx < 20) { adxScore = 10; details.push(`ADX ${adx.toFixed(0)} low + rising potential (10/10)`); }
    else if (adx <= 25) { adxScore = 7; details.push(`ADX ${adx.toFixed(0)} moderate (7/10)`); }
    else if (adx > 30) { adxScore = 3; details.push(`ADX ${adx.toFixed(0)} already trending (3/10)`); }
  }

  const total = volComp + timeAlign + gamma + adxScore;
  let label = 'LOW';
  if (total >= 80) label = 'EXTREME';
  else if (total >= 60) label = 'HIGH';
  else if (total >= 40) label = 'MODERATE';

  return {
    score: total,
    label,
    components: { volCompression: volComp, timeAlignment: timeAlign, gammaWall: gamma, adxRising: adxScore },
    componentDetails: details,
  };
}

/**
 * 13. detectVolatilityTrap — Score-based trap detection (0-100)
 */
export function detectVolatilityTrap(
  volState: VolatilityState,
  options?: DVEInput['options'],
  time?: DVEInput['time'],
): VolatilityTrap {
  const components: string[] = [];

  // Compression (0-40)
  let compScore = 0;
  if (volState.bbwp < 10) { compScore = 40; components.push('BBWP < 10: deep compression (40)'); }
  else if (volState.bbwp < 15) { compScore = 30; components.push(`BBWP ${volState.bbwp.toFixed(1)}: compression (30)`); }
  else if (volState.bbwp < 20) { compScore = 20; components.push(`BBWP ${volState.bbwp.toFixed(1)}: near-compression (20)`); }
  if (volState.inSqueeze && volState.squeezeStrength > 0.7) {
    compScore += 10;
    components.push('Strong squeeze (+10)');
  }
  compScore = Math.min(TRAP.COMPRESSION_WEIGHT, compScore);

  // Gamma Lock (0-30)
  let gammaScore = 0;
  let gammaLockDetected = false;
  if (options?.maxPain != null && options.maxPain > 0) {
    const dist = Math.abs(volState.bbwp) < 20 // only check during compression-ish
      ? Math.abs((options as { currentPrice?: number }).currentPrice ?? 0) // placeholder
      : 0;
    // Use highest OI strikes for gamma proximity
    const strikes = [options.maxPain, options.highestOICallStrike, options.highestOIPutStrike].filter(Boolean) as number[];
    for (const strike of strikes) {
      // We can't access currentPrice here directly — this is a simplified check
      if (options.maxPain > 0) {
        const proximity = Math.abs(strike - options.maxPain) / options.maxPain * 100;
        if (proximity < TRAP.GAMMA_PROXIMITY_PCT) {
          gammaScore = Math.max(gammaScore, 20);
          gammaLockDetected = true;
          components.push(`Price near gamma wall at ${strike}`);
        }
      }
    }
    if (options.dealerGamma?.includes('Long gamma')) {
      gammaScore += 10;
      gammaLockDetected = true;
      components.push('Long gamma dampening (+10)');
    }
  }
  gammaScore = Math.min(TRAP.GAMMA_LOCK_WEIGHT, gammaScore);

  // Time Cluster (0-30)
  let timeScore = 0;
  let timeClusterApproaching = false;
  if (time?.activeTFCount != null && time.activeTFCount >= 3) {
    timeScore = 30;
    timeClusterApproaching = true;
    components.push(`${time.activeTFCount} TFs converging (30)`);
  } else if (time?.hotZoneActive) {
    timeScore = 20;
    timeClusterApproaching = true;
    components.push('Hot zone active (20)');
  } else if (time?.activeTFCount != null && time.activeTFCount >= 2) {
    timeScore = 10;
    components.push(`${time.activeTFCount} TFs approaching (10)`);
  }
  timeScore = Math.min(TRAP.TIME_CLUSTER_WEIGHT, timeScore);

  const total = compScore + gammaScore + timeScore;

  return {
    detected: total >= TRAP.MIN_SCORE,
    candidate: total >= TRAP.CANDIDATE_SCORE && total < TRAP.MIN_SCORE,
    score: total,
    components,
    compressionLevel: volState.bbwp,
    gammaLockDetected,
    timeClusterApproaching,
  };
}

/**
 * 14. computeExhaustion — Expansion/climax exhaustion risk (0-100)
 */
export function computeExhaustion(
  volState: VolatilityState,
  indicators?: DVEIndicatorInput,
): ExhaustionRisk {
  if (volState.regime !== 'expansion' && volState.regime !== 'climax') {
    return { level: 0, label: 'LOW', signals: [] };
  }

  let level = 0;
  const signals: string[] = [];

  if (volState.bbwp > EXHAUSTION.BBWP_TRIGGER) {
    level += 30;
    signals.push(`BBWP ${volState.bbwp.toFixed(1)} > ${EXHAUSTION.BBWP_TRIGGER}`);
  }
  if (volState.bbwp > 95) {
    level += 20;
    signals.push('BBWP > 95: extreme');
  }

  const stochK = indicators?.stochK;
  if (stochK != null) {
    if (stochK > EXHAUSTION.STOCH_EXTREME_BULL) {
      level += 20;
      signals.push(`StochK ${stochK.toFixed(0)} > ${EXHAUSTION.STOCH_EXTREME_BULL}`);
    } else if (stochK < EXHAUSTION.STOCH_EXTREME_BEAR) {
      level += 20;
      signals.push(`StochK ${stochK.toFixed(0)} < ${EXHAUSTION.STOCH_EXTREME_BEAR}`);
    }
  }

  if (indicators?.adx != null && indicators.adx > EXHAUSTION.ADX_DECLINING_THRESHOLD && volState.rateDirection === 'decelerating') {
    level += 15;
    signals.push(`ADX ${indicators.adx.toFixed(0)} declining from high`);
  }

  if (volState.rateDirection === 'decelerating' && volState.rateOfChange < EXHAUSTION.BBWP_DECEL_THRESHOLD) {
    level += 15;
    signals.push('BBWP decelerating during expansion');
  }

  level = clamp(level, 0, 100);
  let label = 'LOW';
  if (level >= 80) label = 'EXTREME';
  else if (level >= 60) label = 'HIGH';
  else if (level >= 40) label = 'MODERATE';

  return { level, label, signals };
}

/**
 * 15. predictTransition — Predict next regime transition + probability
 */
export function predictTransition(
  regime: VolRegime,
  rateDirection: RateDirection,
  bbwp: number,
): StateTransition {
  switch (regime) {
    case 'compression': {
      if (rateDirection === 'accelerating') {
        const prob = clamp(50 + (VOL_REGIME.COMPRESSION_THRESHOLD - bbwp) * 2, 0, 100);
        return { from: 'compression', to: 'transition', probability: prob, trigger: 'BBWP accelerating toward 15' };
      }
      return { from: 'compression', to: 'compression', probability: 30, trigger: 'BBWP still decelerating/flat' };
    }
    case 'neutral': {
      if (bbwp < 25 && rateDirection === 'decelerating') {
        return { from: 'neutral', to: 'compression', probability: 40, trigger: 'BBWP declining toward compression' };
      }
      if (bbwp > 60 && rateDirection === 'accelerating') {
        return { from: 'neutral', to: 'expansion', probability: 40, trigger: 'BBWP accelerating toward expansion' };
      }
      return { from: 'neutral', to: 'neutral', probability: 20, trigger: 'BBWP stable in neutral zone' };
    }
    case 'expansion': {
      if (rateDirection === 'accelerating' && bbwp > 85) {
        return { from: 'expansion', to: 'climax', probability: 50, trigger: 'BBWP accelerating above 85' };
      }
      if (rateDirection === 'decelerating') {
        return { from: 'expansion', to: 'neutral', probability: 40, trigger: 'BBWP decelerating from expansion' };
      }
      return { from: 'expansion', to: 'expansion', probability: 25, trigger: 'BBWP holding in expansion' };
    }
    case 'climax': {
      if (rateDirection === 'decelerating') {
        return { from: 'climax', to: 'expansion', probability: 60, trigger: 'BBWP decelerating from climax' };
      }
      return { from: 'climax', to: 'climax', probability: 30, trigger: 'BBWP sustaining climax' };
    }
    case 'transition': {
      if (rateDirection === 'accelerating' && bbwp > 30) {
        return { from: 'transition', to: 'expansion', probability: 50, trigger: 'BBWP accelerating through transition' };
      }
      return { from: 'transition', to: 'neutral', probability: 50, trigger: 'BBWP settling into neutral' };
    }
  }
}

/**
 * 16. computeMagnitude — Phase-opportunity-weighted directional magnitude (0-100)
 */
export function computeMagnitude(
  signal: DVESignal,
  phasePersistence: PhasePersistence,
  direction: DirectionalPressure,
): number {
  if (signal.active) {
    return signal.strength;
  }

  const dirScore = Math.abs(direction.score) / 100;

  if (phasePersistence.contraction.active) {
    return clamp(Math.round(phasePersistence.contraction.exitProbability * dirScore), 0, 100);
  }

  if (phasePersistence.expansion.active) {
    return clamp(Math.round(phasePersistence.expansion.continuationProbability * dirScore), 0, 100);
  }

  // Neutral: blend of direction confidence and score, scaled down
  return clamp(Math.round((direction.confidence / 100) * dirScore * 50), 0, 100);
}

// ═══════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════

function deriveFlags(
  regime: VolRegime,
  direction: DirectionalPressure,
  breakout: BreakoutReadiness,
  trap: VolatilityTrap,
  exhaustion: ExhaustionRisk,
  phasePersistence: PhasePersistence,
  signal: DVESignal,
  bbwp: number,
): DVEFlag[] {
  const flags: DVEFlag[] = [];

  if (regime === 'compression' && breakout.score >= 60) flags.push('BREAKOUT_WATCH');
  if (direction.bias === 'bullish' && regime === 'expansion') flags.push('EXPANSION_UP');
  if (direction.bias === 'bearish' && regime === 'expansion') flags.push('EXPANSION_DOWN');
  if (trap.detected) flags.push('TRAP_DETECTED');
  if (trap.candidate && !trap.detected) flags.push('TRAP_CANDIDATE');
  if (regime === 'climax') flags.push('CLIMAX_WARNING');
  if (bbwp < VOL_REGIME.EXTREME_LOW) flags.push('COMPRESSION_EXTREME');
  if (phasePersistence.contraction.exitProbability > 70) flags.push('CONTRACTION_EXIT_RISK');
  if (phasePersistence.expansion.exitProbability > 70) flags.push('EXPANSION_EXIT_RISK');
  if (signal.active && signal.type.endsWith('_up')) flags.push('SIGNAL_UP');
  if (signal.active && signal.type.endsWith('_down')) flags.push('SIGNAL_DOWN');

  return flags;
}

function assessDataQuality(input: DVEInput): DVEDataQuality {
  const missing: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  if (input.price.closes.length < MIN_DATA.CLOSES_FOR_PERCENTILE) {
    score -= 30;
    warnings.push(`Only ${input.price.closes.length} closes — need ${MIN_DATA.CLOSES_FOR_PERCENTILE}+ for reliable BBWP`);
  }
  if (input.price.closes.length < MIN_DATA.CLOSES_FOR_DWELL) {
    score -= 10;
    warnings.push(`Only ${input.price.closes.length} closes — need ${MIN_DATA.CLOSES_FOR_DWELL}+ for dwell stats`);
  }

  if (!input.indicators) {
    score -= 20;
    missing.push('indicators');
  } else {
    if (input.indicators.stochK == null) { score -= 5; missing.push('stochK'); }
    if (input.indicators.stochD == null) { score -= 5; missing.push('stochD'); }
    if (input.indicators.stochKSlope == null) { score -= 3; missing.push('stochKSlope'); }
    if (input.indicators.stochDSlope == null) { score -= 3; missing.push('stochDSlope'); }
    if (input.indicators.adx == null) { score -= 2; missing.push('adx'); }
    if (input.indicators.atr == null) { score -= 2; missing.push('atr'); }
  }

  if (!input.options) { score -= 5; missing.push('options'); }
  if (!input.time) { score -= 5; missing.push('time'); }
  if (!input.liquidity) { score -= 3; missing.push('liquidity'); }

  return { score: clamp(score, 0, 100), missing, warnings };
}

function buildSummary(
  symbol: string,
  volState: VolatilityState,
  direction: DirectionalPressure,
  phasePersistence: PhasePersistence,
  signal: DVESignal,
  projection: SignalProjection,
  invalidation: DVEInvalidation,
): string {
  const parts: string[] = [];

  parts.push(`${symbol} BBWP at ${volState.bbwp.toFixed(1)} (${volState.regime}).`);

  if (direction.components.stochasticMomentum !== 0) {
    const dir = direction.components.stochasticMomentum > 0 ? 'bullish' : 'bearish';
    parts.push(`Stochastic momentum ${dir} (${direction.components.stochasticMomentum > 0 ? '+' : ''}${direction.components.stochasticMomentum}).`);
  }

  if (phasePersistence.contraction.active) {
    parts.push(`Contraction episode at ${phasePersistence.contraction.stats.agePercentile.toFixed(0)}th percentile age.`);
  } else if (phasePersistence.expansion.active) {
    parts.push(`Expansion episode at ${phasePersistence.expansion.stats.agePercentile.toFixed(0)}th percentile age.`);
  }

  if (signal.active && signal.type !== 'none') {
    const typeLabel = signal.type.replace(/_/g, ' ');
    parts.push(`${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} signal fired — strength ${signal.strength}/100.`);

    if (projection.sampleSize >= PROJECTION.MIN_SAMPLE_SIZE) {
      parts.push(`Historical: ${projection.expectedMovePct > 0 ? '+' : ''}${projection.expectedMovePct}% expected, ${projection.hitRate}% hit rate.`);
    }

    if (invalidation.priceInvalidation != null) {
      parts.push(`Invalidation: ${signal.type.endsWith('_up') ? 'below' : 'above'} $${invalidation.priceInvalidation.toLocaleString()}.`);
    }
  }

  return parts.join(' ');
}

/**
 * 17. computeDVE — Main orchestrator. Calls all layers in order.
 */
export function computeDVE(input: DVEInput, symbol: string): DVEReading {
  // LAYER 1: Linear Volatility State
  const bbwpResult = computeBBWP(input.price.closes, BBWP.BB_LENGTH, BBWP.LOOKBACK);
  const vhm = computeVHMHistogram(bbwpResult.bbwpSeries, VHM.SMOOTH_PERIOD);
  const { regime, confidence: regimeConfidence } = classifyVolRegime(
    bbwpResult.bbwp, vhm.direction, input.indicators?.inSqueeze,
  );

  const volState: VolatilityState = {
    bbwp: bbwpResult.bbwp,
    bbwpSma5: vhm.sma5,
    regime,
    regimeConfidence,
    rateOfChange: vhm.rate,
    rateSmoothed: vhm.smoothed,
    acceleration: vhm.acceleration,
    rateDirection: vhm.direction,
    inSqueeze: input.indicators?.inSqueeze ?? false,
    squeezeStrength: input.indicators?.squeezeStrength ?? 0,
    atr: input.indicators?.atr ?? undefined,
    extremeAlert: bbwpResult.bbwp < VOL_REGIME.EXTREME_LOW ? 'low' : bbwpResult.bbwp > VOL_REGIME.EXTREME_HIGH ? 'high' : null,
  };

  // LAYER 2: Directional Bias
  const direction = computeDirectionalPressure(input);

  // LAYER 3: Phase Persistence
  const contractionStats = computeZoneDurationStats(bbwpResult.bbwpSeries, VOL_REGIME.COMPRESSION_THRESHOLD, 'below');
  const expansionStats = computeZoneDurationStats(bbwpResult.bbwpSeries, VOL_REGIME.CLIMAX_THRESHOLD, 'above');
  const phasePersistence = computePhasePersistence({
    bbwp: bbwpResult.bbwp,
    bbwpSma5: vhm.sma5,
    volatility: volState,
    contractionStats,
    expansionStats,
    direction,
    stochK: input.indicators?.stochK,
    stochKSlope: input.indicators?.stochKSlope,
  });

  // SUPPORTING (needed before Layer 4 for exhaustion check)
  const exhaustion = computeExhaustion(volState, input.indicators);

  // LAYER 4: Signal Triggering
  const signal = detectSignal(volState, direction, bbwpResult.bbwpSeries, input.price, exhaustion);
  signal.strength = computeSignalStrength(signal, volState, direction);
  const invalidation = computeInvalidation(signal, volState, input.price);

  // Update signal state based on invalidation
  if (invalidation.invalidated && signal.active) {
    signal.state = 'invalidated';
    signal.active = false;
  }

  // Magnitude (after Layer 4)
  const magnitude = computeMagnitude(signal, phasePersistence, direction);
  const directionalVolatility = {
    magnitude,
    bias: direction.score > 0 ? 'up' as const : direction.score < 0 ? 'down' as const : 'unknown' as const,
    confidence: direction.confidence,
  };

  // LAYER 5: Outcome Projection
  const projection = computeSignalProjection(signal.type, input.price.closes, bbwpResult.bbwpSeries);

  // Remaining supporting
  const breakout = computeBreakoutReadiness(volState, input);
  const trap = detectVolatilityTrap(volState, input.options, input.time);
  const transition = predictTransition(regime, vhm.direction, bbwpResult.bbwp);
  const flags = deriveFlags(regime, direction, breakout, trap, exhaustion, phasePersistence, signal, bbwpResult.bbwp);
  const dataQuality = assessDataQuality(input);
  const summary = buildSummary(symbol, volState, direction, phasePersistence, signal, projection, invalidation);

  // Label
  let label = regime.charAt(0).toUpperCase() + regime.slice(1);
  if (volState.extremeAlert === 'low') label += ' (Extreme Low)';
  else if (volState.extremeAlert === 'high') label += ' (Extreme High)';

  return {
    symbol,
    timestamp: Date.now(),
    volatility: volState,
    direction,
    directionalVolatility,
    phasePersistence,
    signal,
    invalidation,
    projection,
    breakout,
    trap,
    exhaustion,
    transition,
    dataQuality,
    flags,
    label,
    summary,
  };
}
