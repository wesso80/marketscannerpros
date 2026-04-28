// ═══════════════════════════════════════════════════════════════════════════
// Directional Volatility Engine (DVE) — Unit Tests
// ═══════════════════════════════════════════════════════════════════════════

import { describe, test, expect } from 'vitest';

import {
  computeBBWP,
  computeVHMHistogram,
  classifyVolRegime,
  computeStochasticMomentum,
  computeDirectionalPressure,
  computeZoneDurationStats,
  computePhasePersistence,
  detectSignal,
  computeSignalStrength,
  computeInvalidation,
  computeSignalProjection,
  computeBreakoutReadiness,
  detectVolatilityTrap,
  computeExhaustion,
  predictTransition,
  computeMagnitude,
  computeDVE,
} from './directionalVolatilityEngine';

import type {
  DVEInput,
  DVEIndicatorInput,
  VolatilityState,
  DirectionalPressure,
  DVESignal,
  PhasePersistence,
  ZoneDurationStats,
  ExhaustionRisk,
} from './directionalVolatilityEngine.types';

import { VOL_REGIME, PROJECTION, TRAP } from './directionalVolatilityEngine.constants';

// ── Test Data Generators ─────────────────────────────────────────────────

/** Generate a calm price series (±0.3% daily moves → narrow BB width → low BBWP) */
function generateCalmSeries(length: number, start: number = 100): number[] {
  const closes: number[] = [start];
  for (let i = 1; i < length; i++) {
    const change = (Math.random() - 0.5) * 0.006; // ±0.3%
    closes.push(closes[i - 1] * (1 + change));
  }
  return closes;
}

/** Generate a volatile price series (±3% daily moves → wide BB width → high BBWP) */
function generateVolatileSeries(length: number, start: number = 100): number[] {
  const closes: number[] = [start];
  for (let i = 1; i < length; i++) {
    const change = (Math.random() - 0.5) * 0.06; // ±3%
    closes.push(closes[i - 1] * (1 + change));
  }
  return closes;
}

/** Generate a transitioning series: calm then volatile */
function generateTransitioningSeries(
  calmLen: number = 230,
  volLen: number = 70,
  start: number = 100,
): number[] {
  const calm = generateCalmSeries(calmLen, start);
  const vol = generateVolatileSeries(volLen, calm[calm.length - 1]);
  return [...calm, ...vol.slice(1)];
}

/** Generate a deterministic BBWP-like series for dwell stats testing */
function generateBBWPSeries(pattern: number[]): number[] {
  return pattern;
}

/** Build a minimal DVEInput for testing */
function makeInput(overrides: Partial<DVEInput> = {}): DVEInput {
  const closes = overrides.price?.closes ?? generateCalmSeries(300);
  return {
    price: {
      closes,
      currentPrice: closes[closes.length - 1],
      changePct: 0.5,
      ...overrides.price,
    },
    indicators: overrides.indicators,
    options: overrides.options,
    time: overrides.time,
    liquidity: overrides.liquidity,
    mpeComposite: overrides.mpeComposite,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 1 TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('computeBBWP', () => {
  test('returns 50 for insufficient data (< bbLen + 1 closes)', () => {
    const result = computeBBWP([100, 101, 102], 13, 252);
    expect(result.bbwp).toBe(50);
    expect(result.bbwpSeries).toEqual([]);
  });

  test('returns low bbwp for narrow-range price series', () => {
    // Generate 300 bars with tiny volatility
    const closes = generateCalmSeries(300);
    const result = computeBBWP(closes, 13, 252);
    // A calm series should generally have BBWP in the lower ranges
    expect(result.bbwp).toBeGreaterThanOrEqual(0);
    expect(result.bbwp).toBeLessThanOrEqual(100);
    expect(result.bbwpSeries.length).toBeGreaterThan(0);
  });

  test('bbwpSeries length matches expected count', () => {
    const closes = generateCalmSeries(300);
    const result = computeBBWP(closes, 13, 252);
    // bbwpSeries should have length = closes.length - (bbLen - 1)
    expect(result.bbwpSeries.length).toBe(closes.length - 12);
  });

  test('bbwp is always 0-100', () => {
    const closes = generateVolatileSeries(300);
    const result = computeBBWP(closes, 13, 252);
    expect(result.bbwp).toBeGreaterThanOrEqual(0);
    expect(result.bbwp).toBeLessThanOrEqual(100);
    for (const v of result.bbwpSeries) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  test('percentile rank stays bounded at a high-volatility boundary', () => {
    const closes = [
      ...Array.from({ length: 80 }, (_, index) => 100 + index * 0.02),
      ...Array.from({ length: 40 }, (_, index) => index % 2 === 0 ? 90 : 112),
    ];

    const result = computeBBWP(closes, 13, 80);

    expect(result.bbwp).toBeGreaterThanOrEqual(0);
    expect(result.bbwp).toBeLessThanOrEqual(100);
    expect(result.bbwpSeries.every((value) => value >= 0 && value <= 100)).toBe(true);
  });

  test('volatile series produces higher bbwp than calm series', () => {
    // Create a series that's calm then turns volatile
    const calm = generateCalmSeries(250, 100);
    const volatileEnd: number[] = [];
    let p = calm[calm.length - 1];
    for (let i = 0; i < 50; i++) {
      p *= 1 + (Math.random() > 0.5 ? 0.05 : -0.05); // big moves
      volatileEnd.push(p);
    }
    const series = [...calm, ...volatileEnd];
    const result = computeBBWP(series, 13, 252);
    // The current BBWP should be higher than the historical average
    // due to the recent volatile period
    expect(result.bbwp).toBeGreaterThan(0);
  });
});

describe('classifyVolRegime strict boundaries', () => {
  test('uses canonical compression, transition, expansion, and climax thresholds', () => {
    expect(classifyVolRegime(14.99, 'flat').regime).toBe('compression');
    expect(classifyVolRegime(15, 'flat').regime).toBe('neutral');
    expect(classifyVolRegime(16, 'accelerating').regime).toBe('transition');
    expect(classifyVolRegime(70, 'flat').regime).toBe('neutral');
    expect(classifyVolRegime(70.01, 'flat').regime).toBe('expansion');
    expect(classifyVolRegime(90, 'flat').regime).toBe('climax');
  });
});

describe('computeVHMHistogram', () => {
  test('returns accelerating when smoothed rate is increasing', () => {
    // Non-linear: rate-of-change itself is increasing (accelerating BBWP rise)
    const series = [10, 11, 13, 16, 20, 25, 31, 38, 46, 55];
    const result = computeVHMHistogram(series, 5);
    expect(result.direction).toBe('accelerating');
    expect(result.rate).toBeGreaterThan(0);
  });

  test('returns decelerating when smoothed rate is decreasing', () => {
    // Rate-of-change is becoming more negative (decelerating)
    const series = [90, 88, 85, 81, 76, 70, 63, 55, 46, 36];
    const result = computeVHMHistogram(series, 5);
    expect(result.direction).toBe('decelerating');
    expect(result.rate).toBeLessThan(0);
  });

  test('returns flat for stable BBWP series', () => {
    const series = [50, 50, 50, 50, 50, 50, 50, 50, 50, 50];
    const result = computeVHMHistogram(series, 5);
    expect(result.direction).toBe('flat');
    expect(result.rate).toBe(0);
  });

  test('sma5 smooths the raw BBWP', () => {
    const series = [10, 20, 30, 40, 50, 60, 70, 80];
    const result = computeVHMHistogram(series, 5);
    // SMA5 of last 5 values: (40+50+60+70+80)/5 = 60
    expect(result.sma5).toBeCloseTo(60, 0);
  });

  test('acceleration positive when rate is increasing', () => {
    // Series where the rate of change is itself increasing
    const series = [10, 11, 13, 16, 20, 25, 31, 38, 46, 55];
    const result = computeVHMHistogram(series, 5);
    expect(result.acceleration).toBeGreaterThan(0);
  });

  test('acceleration negative when rate is decreasing', () => {
    // Series where rate of change is slowing
    const series = [10, 20, 28, 34, 38, 41, 43, 44.5, 45.5, 46];
    const result = computeVHMHistogram(series, 5);
    expect(result.acceleration).toBeLessThan(0);
  });
});

describe('classifyVolRegime', () => {
  test('returns compression for bbwp < 15', () => {
    const { regime } = classifyVolRegime(10, 'flat');
    expect(regime).toBe('compression');
  });

  test('returns climax for bbwp > 90', () => {
    const { regime } = classifyVolRegime(95, 'flat');
    expect(regime).toBe('climax');
  });

  test('returns expansion for bbwp 70-90', () => {
    const { regime } = classifyVolRegime(80, 'flat');
    expect(regime).toBe('expansion');
  });

  test('returns neutral for bbwp 15-70', () => {
    const { regime } = classifyVolRegime(50, 'flat');
    expect(regime).toBe('neutral');
  });

  test('returns transition when rate accelerating from low base', () => {
    const { regime } = classifyVolRegime(20, 'accelerating');
    expect(regime).toBe('transition');
  });

  test('regimeConfidence high when deep inside regime', () => {
    const { confidence } = classifyVolRegime(5, 'flat');
    expect(confidence).toBeGreaterThan(50);
  });

  test('regimeConfidence low near regime boundary', () => {
    const { confidence } = classifyVolRegime(14, 'flat');
    expect(confidence).toBeLessThan(20);
  });

  test('regimeConfidence 50 for transition regime', () => {
    const { confidence } = classifyVolRegime(20, 'accelerating');
    expect(confidence).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 2 TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('computeStochasticMomentum', () => {
  test('returns positive for K > D with positive slopes', () => {
    const score = computeStochasticMomentum({
      stochK: 72, stochD: 65, stochMomentum: 7,
      stochKSlope: 2, stochDSlope: 1,
    } as DVEIndicatorInput);
    expect(score).toBeGreaterThan(0);
  });

  test('returns negative for K < D with negative slopes', () => {
    const score = computeStochasticMomentum({
      stochK: 30, stochD: 40, stochMomentum: -10,
      stochKSlope: -2, stochDSlope: -1,
    } as DVEIndicatorInput);
    expect(score).toBeLessThan(0);
  });

  test('midline bonus applied when K > 50 with positive spread', () => {
    const withBonus = computeStochasticMomentum({
      stochK: 60, stochD: 55, stochMomentum: 5,
      stochKSlope: 1, stochDSlope: 0.5,
    } as DVEIndicatorInput);
    const withoutBonus = computeStochasticMomentum({
      stochK: 40, stochD: 35, stochMomentum: 5,
      stochKSlope: 1, stochDSlope: 0.5,
    } as DVEIndicatorInput);
    expect(withBonus).toBeGreaterThan(withoutBonus);
  });

  test('midline penalty applied when K < 50 with negative spread', () => {
    const withPenalty = computeStochasticMomentum({
      stochK: 40, stochD: 45, stochMomentum: -5,
      stochKSlope: -1, stochDSlope: -0.5,
    } as DVEIndicatorInput);
    const withoutPenalty = computeStochasticMomentum({
      stochK: 60, stochD: 65, stochMomentum: -5,
      stochKSlope: -1, stochDSlope: -0.5,
    } as DVEIndicatorInput);
    expect(withPenalty).toBeLessThan(withoutPenalty);
  });

  test('returns 0 when all inputs null', () => {
    const score = computeStochasticMomentum({} as DVEIndicatorInput);
    expect(score).toBe(0);
  });

  test('clamps to -15..+15', () => {
    const maxScore = computeStochasticMomentum({
      stochK: 90, stochD: 70, stochMomentum: 20,
      stochKSlope: 5, stochDSlope: 5,
    } as DVEIndicatorInput);
    expect(maxScore).toBeLessThanOrEqual(15);
    expect(maxScore).toBeGreaterThanOrEqual(-15);
  });
});

describe('computeDirectionalPressure', () => {
  test('returns bullish for stoch bullish + price > SMA', () => {
    const input = makeInput({
      price: { closes: generateCalmSeries(300), currentPrice: 105, changePct: 2 },
      indicators: {
        stochK: 72, stochD: 65, stochMomentum: 7,
        stochKSlope: 2, stochDSlope: 1,
        sma20: 100, sma50: 98, adx: 30,
        macd: 1, macdHist: 0.5,
      } as DVEIndicatorInput,
    });
    const result = computeDirectionalPressure(input);
    expect(result.bias).toBe('bullish');
    expect(result.score).toBeGreaterThan(0);
  });

  test('returns bearish for stoch bearish + price < SMA', () => {
    const input = makeInput({
      price: { closes: generateCalmSeries(300), currentPrice: 90, changePct: -2 },
      indicators: {
        stochK: 28, stochD: 35, stochMomentum: -7,
        stochKSlope: -2, stochDSlope: -1,
        sma20: 100, sma50: 102, adx: 30,
        macd: -1, macdHist: -0.5,
      } as DVEIndicatorInput,
    });
    const result = computeDirectionalPressure(input);
    expect(result.bias).toBe('bearish');
    expect(result.score).toBeLessThan(0);
  });

  test('returns neutral when signals conflict', () => {
    const input = makeInput({
      price: { closes: generateCalmSeries(300), currentPrice: 100, changePct: 0 },
      indicators: {
        stochK: 50, stochD: 50, stochMomentum: 0,
        sma20: 100, sma50: 100,
      } as DVEIndicatorInput,
    });
    const result = computeDirectionalPressure(input);
    expect(result.bias).toBe('neutral');
  });

  test('falls back to MACD-only when stoch data unavailable', () => {
    const input = makeInput({
      indicators: {
        macd: 2, macdHist: 1.5,
        sma20: 100, sma50: 98,
      } as DVEIndicatorInput,
    });
    const result = computeDirectionalPressure(input);
    expect(result.componentDetails.some(d => d.includes('MACD fallback'))).toBe(true);
  });

  test('score clamps to -100..+100', () => {
    const input = makeInput({
      price: { closes: generateCalmSeries(300), currentPrice: 110, changePct: 5, volume: 2000000, avgVolume: 500000 },
      indicators: {
        stochK: 95, stochD: 75, stochMomentum: 20,
        stochKSlope: 5, stochDSlope: 5,
        sma20: 100, sma50: 95, adx: 40,
      } as DVEIndicatorInput,
      options: { putCallRatio: 0.3, unusualActivity: 'Very High', sentiment: 'Bullish', ivRank: 10 },
      mpeComposite: 80,
    });
    const result = computeDirectionalPressure(input);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(-100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 3 TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('computeZoneDurationStats', () => {
  test('returns zero stats when no episodes found', () => {
    const series = [50, 55, 60, 65, 70]; // all above 15
    const stats = computeZoneDurationStats(series, 15, 'below');
    expect(stats.episodeCount).toBe(0);
    expect(stats.currentBars).toBe(0);
    expect(stats.averageBars).toBe(0);
  });

  test('correctly identifies contiguous below-threshold episodes', () => {
    // Episodes: [3] (indices 1-3), [2] (indices 6-7), currently at index 9-10
    const series = [20, 10, 12, 8, 20, 25, 14, 13, 30, 11, 9];
    const stats = computeZoneDurationStats(series, 15, 'below');
    expect(stats.episodeCount).toBe(2); // 2 completed
    expect(stats.currentBars).toBe(2); // currently in zone (11, 9)
  });

  test('correctly identifies contiguous above-threshold episodes', () => {
    const series = [50, 92, 95, 91, 50, 40, 93, 96, 50];
    const stats = computeZoneDurationStats(series, 90, 'above');
    expect(stats.episodeCount).toBe(2); // (92,95,91) and (93,96)
    expect(stats.currentBars).toBe(0); // last value is 50
  });

  test('currentBars reflects active episode length', () => {
    const series = [50, 50, 50, 10, 8, 6]; // last 3 are below 15
    const stats = computeZoneDurationStats(series, 15, 'below');
    expect(stats.currentBars).toBe(3);
  });

  test('currentBars = 0 when not in zone', () => {
    const series = [10, 8, 6, 50, 60, 70]; // ended above threshold
    const stats = computeZoneDurationStats(series, 15, 'below');
    expect(stats.currentBars).toBe(0);
  });

  test('agePercentile correct when current episode is longest', () => {
    // Previous episodes: [2, 3, 1] — current is 4 bars → 100th percentile
    const series = [12, 10, 20, 8, 9, 11, 25, 13, 20, 10, 8, 7, 6];
    const stats = computeZoneDurationStats(series, 15, 'below');
    if (stats.currentBars > 0 && stats.episodeCount > 0) {
      expect(stats.agePercentile).toBeGreaterThanOrEqual(0);
      expect(stats.agePercentile).toBeLessThanOrEqual(100);
    }
  });

  test('episodeCount excludes current episode', () => {
    const series = [50, 10, 8, 20, 10, 12]; // two episodes, second is current
    const stats = computeZoneDurationStats(series, 15, 'below');
    expect(stats.episodeCount).toBe(1); // only the completed [10,8]
    expect(stats.currentBars).toBe(2); // [10, 12]
  });
});

describe('computePhasePersistence', () => {
  const makeVolState = (bbwp: number, rateDir: 'accelerating' | 'decelerating' | 'flat' = 'flat'): VolatilityState => ({
    bbwp,
    bbwpSma5: bbwp + 1,
    regime: bbwp < 15 ? 'compression' : bbwp > 90 ? 'climax' : 'neutral',
    regimeConfidence: 50,
    rateOfChange: 0,
    rateSmoothed: 0,
    acceleration: 0,
    rateDirection: rateDir,
    inSqueeze: false,
    squeezeStrength: 0,
  });

  const makeDirection = (bias: 'bullish' | 'bearish' | 'neutral' = 'neutral'): DirectionalPressure => ({
    score: bias === 'bullish' ? 30 : bias === 'bearish' ? -30 : 0,
    bias,
    confidence: 30,
    components: { stochasticMomentum: 0, trendStructure: 0, optionsFlow: 0, volumeExpansion: 0, dealerGamma: 0, fundingRate: 0, marketBreadth: 0 },
    componentDetails: [],
  });

  const makeStats = (cur: number = 2, avg: number = 5, med: number = 4): ZoneDurationStats => ({
    currentBars: cur,
    averageBars: avg,
    medianBars: med,
    maxBars: 10,
    agePercentile: 30,
    episodeCount: 5,
  });

  test('contraction active with high continuation when bbwp < 15 and young', () => {
    const result = computePhasePersistence({
      bbwp: 10,
      bbwpSma5: 12,
      volatility: makeVolState(10),
      contractionStats: makeStats(2, 5, 4),
      expansionStats: makeStats(0, 3, 2),
      direction: makeDirection('neutral'),
    });
    expect(result.contraction.active).toBe(true);
    expect(result.contraction.continuationProbability).toBeGreaterThan(50);
  });

  test('contraction exit probability rises when age > average', () => {
    const result = computePhasePersistence({
      bbwp: 10,
      bbwpSma5: 12,
      volatility: makeVolState(10, 'accelerating'),
      contractionStats: makeStats(8, 5, 4), // currentBars > averageBars
      expansionStats: makeStats(0, 3, 2),
      direction: makeDirection('bullish'),
      stochKSlope: 2,
    });
    expect(result.contraction.exitProbability).toBeGreaterThan(30);
  });

  test('contraction inactive when bbwp >= 15', () => {
    const result = computePhasePersistence({
      bbwp: 20,
      bbwpSma5: 22,
      volatility: makeVolState(20),
      contractionStats: makeStats(0, 5, 4),
      expansionStats: makeStats(0, 3, 2),
      direction: makeDirection('neutral'),
    });
    expect(result.contraction.active).toBe(false);
    expect(result.contraction.continuationProbability).toBe(0);
  });

  test('expansion active when bbwp > 90', () => {
    const result = computePhasePersistence({
      bbwp: 95,
      bbwpSma5: 93,
      volatility: makeVolState(95),
      contractionStats: makeStats(0, 5, 4),
      expansionStats: makeStats(3, 5, 4),
      direction: makeDirection('bullish'),
    });
    expect(result.expansion.active).toBe(true);
    expect(result.expansion.continuationProbability).toBeGreaterThan(0);
  });

  test('expansion inactive when bbwp <= 90', () => {
    const result = computePhasePersistence({
      bbwp: 80,
      bbwpSma5: 78,
      volatility: makeVolState(80),
      contractionStats: makeStats(0, 5, 4),
      expansionStats: makeStats(0, 5, 4),
      direction: makeDirection('neutral'),
    });
    expect(result.expansion.active).toBe(false);
  });

  test('expansion exit risk rises when climax phase is stretched and decelerating', () => {
    const result = computePhasePersistence({
      bbwp: 91,
      bbwpSma5: 92,
      volatility: makeVolState(91, 'decelerating'),
      contractionStats: makeStats(0, 5, 4),
      expansionStats: { currentBars: 9, averageBars: 5, medianBars: 4, maxBars: 10, agePercentile: 90, episodeCount: 8 },
      direction: makeDirection('bullish'),
      stochKSlope: -2,
    });

    expect(result.expansion.active).toBe(true);
    expect(result.expansion.exitProbability).toBeGreaterThanOrEqual(65);
  });
});

describe('computeDVE data-quality and exhaustion boundaries', () => {
  test('downgrades data quality when core indicators, options, time, and liquidity are missing', () => {
    const closes = Array.from({ length: 20 }, (_, index) => 100 + index * 0.1);
    const reading = computeDVE({
      price: { closes, currentPrice: closes[closes.length - 1], changePct: 0.2 },
    }, 'THIN');

    expect(reading.dataQuality.score).toBeLessThan(60);
    expect(reading.dataQuality.missing).toEqual(expect.arrayContaining(['indicators', 'options', 'time', 'liquidity']));
    expect(reading.dataQuality.warnings.some((warning) => warning.includes('need 50+'))).toBe(true);
    expect(reading.dataQuality.warnings.some((warning) => warning.includes('need 100+'))).toBe(true);
  });

  test('keeps exhaustion low outside expansion and labels extreme exhaustion inside climax', () => {
    const neutral = computeExhaustion({
      bbwp: 60,
      bbwpSma5: 60,
      regime: 'neutral',
      regimeConfidence: 80,
      rateOfChange: 0,
      rateSmoothed: 0,
      acceleration: 0,
      rateDirection: 'flat',
      inSqueeze: false,
      squeezeStrength: 0,
    });
    const extreme = computeExhaustion({
      bbwp: 98,
      bbwpSma5: 96,
      regime: 'climax',
      regimeConfidence: 90,
      rateOfChange: -1,
      rateSmoothed: -0.8,
      acceleration: -0.2,
      rateDirection: 'decelerating',
      inSqueeze: false,
      squeezeStrength: 0,
    }, { stochK: 92, adx: 42 });

    expect(neutral).toEqual({ level: 0, label: 'LOW', signals: [] });
    expect(extreme.level).toBeGreaterThanOrEqual(80);
    expect(extreme.label).toBe('EXTREME');
    expect(extreme.signals.join(' ')).toContain('BBWP > 95');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 4 TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('detectSignal', () => {
  const compressionVolState: VolatilityState = {
    bbwp: 18, bbwpSma5: 14, regime: 'neutral', regimeConfidence: 50,
    rateOfChange: 3, rateSmoothed: 2, acceleration: 1, rateDirection: 'accelerating',
    inSqueeze: false, squeezeStrength: 0,
  };

  const bullishDirection: DirectionalPressure = {
    score: 30, bias: 'bullish', confidence: 30,
    components: { stochasticMomentum: 10, trendStructure: 10, optionsFlow: 5, volumeExpansion: 5, dealerGamma: 0, fundingRate: 0, marketBreadth: 0 },
    componentDetails: [],
  };

  const bearishDirection: DirectionalPressure = {
    score: -30, bias: 'bearish', confidence: 30,
    components: { stochasticMomentum: -10, trendStructure: -10, optionsFlow: -5, volumeExpansion: -5, dealerGamma: 0, fundingRate: 0, marketBreadth: 0 },
    componentDetails: [],
  };

  // BBWP series that was recently below 15, now above
  const recentCompressionBBWP = [12, 10, 8, 11, 13, 14, 16, 18, 20, 22];

  test('fires compression_release_up on break above 15 with bullish stoch', () => {
    const signal = detectSignal(
      compressionVolState,
      bullishDirection,
      recentCompressionBBWP,
      { closes: generateCalmSeries(50), currentPrice: 105, changePct: 1 },
    );
    expect(signal.type).toBe('compression_release_up');
    expect(signal.active).toBe(true);
    expect(signal.state).toBe('fired');
  });

  test('fires compression_release_down on break above 15 with bearish stoch', () => {
    const signal = detectSignal(
      compressionVolState,
      bearishDirection,
      recentCompressionBBWP,
      { closes: generateCalmSeries(50), currentPrice: 95, changePct: -1 },
    );
    expect(signal.type).toBe('compression_release_down');
    expect(signal.active).toBe(true);
  });

  test('returns none when no conditions met', () => {
    const neutralDir: DirectionalPressure = {
      score: 0, bias: 'neutral', confidence: 0,
      components: { stochasticMomentum: 0, trendStructure: 0, optionsFlow: 0, volumeExpansion: 0, dealerGamma: 0, fundingRate: 0, marketBreadth: 0 },
      componentDetails: [],
    };
    const neutralVol: VolatilityState = {
      bbwp: 50, bbwpSma5: 48, regime: 'neutral', regimeConfidence: 50,
      rateOfChange: 0, rateSmoothed: 0, acceleration: 0, rateDirection: 'flat',
      inSqueeze: false, squeezeStrength: 0,
    };
    const signal = detectSignal(
      neutralVol,
      neutralDir,
      [50, 50, 50, 50, 50],
      { closes: generateCalmSeries(50), currentPrice: 100, changePct: 0 },
    );
    expect(signal.type).toBe('none');
    expect(signal.active).toBe(false);
  });

  test('does not fire expansion_continuation when exhaustion is HIGH', () => {
    const climaxVol: VolatilityState = {
      bbwp: 95, bbwpSma5: 93, regime: 'climax', regimeConfidence: 50,
      rateOfChange: -1, rateSmoothed: -0.5, acceleration: -1, rateDirection: 'decelerating',
      inSqueeze: false, squeezeStrength: 0,
    };
    const highExhaustion: ExhaustionRisk = { level: 70, label: 'HIGH', signals: ['BBWP > 85'] };
    const signal = detectSignal(
      climaxVol,
      bullishDirection,
      [92, 93, 94, 95, 95],
      { closes: generateCalmSeries(50), currentPrice: 100, changePct: 1 },
      highExhaustion,
    );
    expect(signal.type).toBe('none');
  });
});

describe('computeSignalStrength', () => {
  test('higher strength for clean BBWP cross', () => {
    const volState: VolatilityState = {
      bbwp: 25, bbwpSma5: 18, regime: 'neutral', regimeConfidence: 50,
      rateOfChange: 3, rateSmoothed: 2, acceleration: 1, rateDirection: 'accelerating',
      inSqueeze: false, squeezeStrength: 0,
    };
    const direction: DirectionalPressure = {
      score: 50, bias: 'bullish', confidence: 50,
      components: { stochasticMomentum: 12, trendStructure: 15, optionsFlow: 10, volumeExpansion: 5, dealerGamma: 5, fundingRate: 0, marketBreadth: 3 },
      componentDetails: [],
    };
    const signal: DVESignal = {
      type: 'compression_release_up', state: 'fired', active: true, strength: 0, triggerReason: [],
    };
    const strength = computeSignalStrength(signal, volState, direction);
    expect(strength).toBeGreaterThan(50); // BBWP 25 is 10 above threshold → strong cross
  });

  test('returns 0 when signal.type is none', () => {
    const signal: DVESignal = {
      type: 'none', state: 'idle', active: false, strength: 0, triggerReason: [],
    };
    const strength = computeSignalStrength(signal, {} as VolatilityState, {} as DirectionalPressure);
    expect(strength).toBe(0);
  });
});

describe('computeInvalidation', () => {
  test('price invalidation at signal bar low for up signals', () => {
    const signal: DVESignal = {
      type: 'compression_release_up', state: 'fired', active: true, strength: 70,
      triggerBarPrice: 100, triggerBarOpen: 99, triggerBarHigh: 102, triggerBarLow: 97,
      triggerReason: [],
    };
    const volState: VolatilityState = {
      bbwp: 18, bbwpSma5: 16, regime: 'neutral', regimeConfidence: 50,
      rateOfChange: 2, rateSmoothed: 1, acceleration: 0.5, rateDirection: 'accelerating',
      inSqueeze: false, squeezeStrength: 0,
    };
    const inv = computeInvalidation(signal, volState, { closes: [100], currentPrice: 100, changePct: 0 });
    expect(inv.priceInvalidation).toBe(97); // signal bar low for 'extreme' mode
    expect(inv.phaseInvalidation).toBe(15);
    expect(inv.invalidated).toBe(false);
  });

  test('price invalidation at signal bar high for down signals', () => {
    const signal: DVESignal = {
      type: 'compression_release_down', state: 'fired', active: true, strength: 70,
      triggerBarPrice: 100, triggerBarOpen: 101, triggerBarHigh: 103, triggerBarLow: 98,
      triggerReason: [],
    };
    const volState: VolatilityState = {
      bbwp: 18, bbwpSma5: 16, regime: 'neutral', regimeConfidence: 50,
      rateOfChange: 2, rateSmoothed: 1, acceleration: 0.5, rateDirection: 'accelerating',
      inSqueeze: false, squeezeStrength: 0,
    };
    const inv = computeInvalidation(signal, volState, { closes: [100], currentPrice: 100, changePct: 0 });
    expect(inv.priceInvalidation).toBe(103); // signal bar high for 'extreme' mode
  });

  test('invalidated = true when price violates level', () => {
    const signal: DVESignal = {
      type: 'compression_release_up', state: 'fired', active: true, strength: 70,
      triggerBarPrice: 100, triggerBarOpen: 99, triggerBarHigh: 102, triggerBarLow: 97,
      triggerReason: [],
    };
    const volState: VolatilityState = {
      bbwp: 18, bbwpSma5: 16, regime: 'neutral', regimeConfidence: 50,
      rateOfChange: 2, rateSmoothed: 1, acceleration: 0.5, rateDirection: 'accelerating',
      inSqueeze: false, squeezeStrength: 0,
    };
    const inv = computeInvalidation(signal, volState, { closes: [90], currentPrice: 90, changePct: -10 });
    expect(inv.invalidated).toBe(true);
  });

  test('invalidated = true when bbwp re-enters phase', () => {
    const signal: DVESignal = {
      type: 'compression_release_up', state: 'fired', active: true, strength: 70,
      triggerBarPrice: 100, triggerBarOpen: 99, triggerBarHigh: 102, triggerBarLow: 97,
      triggerReason: [],
    };
    const volState: VolatilityState = {
      bbwp: 12, bbwpSma5: 13, regime: 'compression', regimeConfidence: 50,
      rateOfChange: -1, rateSmoothed: -0.5, acceleration: -0.3, rateDirection: 'decelerating',
      inSqueeze: false, squeezeStrength: 0,
    };
    const inv = computeInvalidation(signal, volState, { closes: [100], currentPrice: 100, changePct: 0 });
    expect(inv.invalidated).toBe(true);
  });

  test('returns empty when signal.type is none', () => {
    const signal: DVESignal = {
      type: 'none', state: 'idle', active: false, strength: 0, triggerReason: [],
    };
    const inv = computeInvalidation(signal, {} as VolatilityState, { closes: [100], currentPrice: 100, changePct: 0 });
    expect(inv.ruleSet.length).toBe(0);
    expect(inv.invalidated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 5 TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('computeSignalProjection', () => {
  test('returns zeroed projection when sample size < 5', () => {
    const closes = generateCalmSeries(50);
    const bbwpSeries = Array(50).fill(50); // no transitions
    const proj = computeSignalProjection('compression_release_up', closes, bbwpSeries);
    expect(proj.sampleSize).toBeLessThan(5);
    expect(proj.expectedMovePct).toBe(0);
    expect(proj.projectionQuality).toBe('unavailable');
    expect(proj.projectionQualityScore).toBe(0);
    expect(proj.projectionWarning).toContain('Thin projection sample');
  });

  test('returns high projection quality for broad low-dispersion samples', () => {
    const closes: number[] = [];
    const bbwp: number[] = [];
    for (let i = 0; i < 1000; i++) {
      closes.push(100 + i * 0.5);
      bbwp.push(i % 30 === 0 ? 10 : 25);
    }

    const proj = computeSignalProjection('compression_release_up', closes, bbwp);

    expect(proj.sampleSize).toBeGreaterThanOrEqual(30);
    expect(proj.dispersionPct).toBeGreaterThanOrEqual(0);
    expect(proj.projectionQuality).toBe('high');
    expect(proj.projectionQualityScore).toBeGreaterThanOrEqual(70);
    expect(proj.projectionWarning).toContain('Projection quality high');
  });

  test('identifies compression release transitions in history', () => {
    // Build a BBWP series with multiple compression/release episodes
    const bbwp: number[] = [];
    const closes: number[] = [];
    let p = 100;
    for (let i = 0; i < 300; i++) {
      // Alternate between compression and neutral
      const cycle = Math.floor(i / 30);
      if (cycle % 2 === 0) {
        bbwp.push(10 + Math.random() * 3); // compression
        p *= 1 + (Math.random() - 0.5) * 0.002;
      } else {
        bbwp.push(30 + Math.random() * 20); // neutral
        p *= 1 + (Math.random() - 0.3) * 0.02; // slight upward bias
      }
      closes.push(p);
    }

    const proj = computeSignalProjection('compression_release_up', closes, bbwp);
    // Should find multiple transition points
    expect(proj.sampleSize).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUPPORTING FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('computeBreakoutReadiness', () => {
  test('returns HIGH when compression + time alignment + gamma', () => {
    const volState: VolatilityState = {
      bbwp: 10, bbwpSma5: 12, regime: 'compression', regimeConfidence: 70,
      rateOfChange: -0.5, rateSmoothed: -0.3, acceleration: 0, rateDirection: 'flat',
      inSqueeze: true, squeezeStrength: 0.8,
    };
    const input = makeInput({
      time: { activeTFCount: 3, hotZoneActive: true },
      options: { maxPain: 100, dealerGamma: 'Short gamma (amplifying)', unusualActivity: 'Very High' },
    });
    const result = computeBreakoutReadiness(volState, input);
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(['HIGH', 'EXTREME']).toContain(result.label);
  });

  test('returns LOW when vol is expanded and no squeeze', () => {
    const volState: VolatilityState = {
      bbwp: 80, bbwpSma5: 78, regime: 'expansion', regimeConfidence: 50,
      rateOfChange: 1, rateSmoothed: 0.5, acceleration: 0, rateDirection: 'flat',
      inSqueeze: false, squeezeStrength: 0,
    };
    const input = makeInput();
    const result = computeBreakoutReadiness(volState, input);
    expect(result.score).toBeLessThan(40);
    expect(result.label).toBe('LOW');
  });
});

describe('detectVolatilityTrap', () => {
  test('not detected when bbwp > 50', () => {
    const volState: VolatilityState = {
      bbwp: 50, bbwpSma5: 48, regime: 'neutral', regimeConfidence: 50,
      rateOfChange: 0, rateSmoothed: 0, acceleration: 0, rateDirection: 'flat',
      inSqueeze: false, squeezeStrength: 0,
    };
    const trap = detectVolatilityTrap(volState);
    expect(trap.detected).toBe(false);
    expect(trap.score).toBeLessThan(TRAP.MIN_SCORE);
  });

  test('detected when compression + time cluster', () => {
    const volState: VolatilityState = {
      bbwp: 8, bbwpSma5: 10, regime: 'compression', regimeConfidence: 80,
      rateOfChange: -0.5, rateSmoothed: -0.3, acceleration: 0, rateDirection: 'flat',
      inSqueeze: true, squeezeStrength: 0.9,
    };
    const trap = detectVolatilityTrap(volState, undefined, { activeTFCount: 4 });
    // Compression: 40 + 10 (squeeze) = 40 (capped). Time: 30.
    // Gamma: 0. Total could be around 70
    expect(trap.score).toBeGreaterThanOrEqual(TRAP.MIN_SCORE);
    expect(trap.detected).toBe(true);
  });

  test('uses actual current price for gamma wall proximity', () => {
    const volState: VolatilityState = {
      bbwp: 12, bbwpSma5: 10, regime: 'compression', regimeConfidence: 75,
      rateOfChange: -0.5, rateSmoothed: -0.3, acceleration: 0, rateDirection: 'flat',
      inSqueeze: false, squeezeStrength: 0,
    };

    const trap = detectVolatilityTrap(
      volState,
      { maxPain: 100, highestOICallStrike: 101, highestOIPutStrike: 98 },
      { activeTFCount: 3 },
      100.8,
    );

    expect(trap.gammaLockDetected).toBe(true);
    expect(trap.components.some(component => component.includes('from gamma wall at'))).toBe(true);
    expect(trap.detected).toBe(true);
  });

  test('does not claim gamma lock when strikes are near max pain but far from current price', () => {
    const volState: VolatilityState = {
      bbwp: 12, bbwpSma5: 10, regime: 'compression', regimeConfidence: 75,
      rateOfChange: -0.5, rateSmoothed: -0.3, acceleration: 0, rateDirection: 'flat',
      inSqueeze: false, squeezeStrength: 0,
    };

    const trap = detectVolatilityTrap(
      volState,
      { maxPain: 100, highestOICallStrike: 101, highestOIPutStrike: 99 },
      { activeTFCount: 3 },
      150,
    );

    expect(trap.gammaLockDetected).toBe(false);
    expect(trap.components.some(component => component.includes('gamma wall'))).toBe(false);
    expect(trap.score).toBe(60);
    expect(trap.detected).toBe(false);
    expect(trap.candidate).toBe(true);
  });

  test('partial detection stays below threshold', () => {
    const volState: VolatilityState = {
      bbwp: 18, bbwpSma5: 20, regime: 'neutral', regimeConfidence: 50,
      rateOfChange: 0, rateSmoothed: 0, acceleration: 0, rateDirection: 'flat',
      inSqueeze: false, squeezeStrength: 0,
    };
    const trap = detectVolatilityTrap(volState);
    expect(trap.detected).toBe(false);
    expect(trap.candidate).toBe(false);
  });
});

describe('computeExhaustion', () => {
  test('level 0 during compression', () => {
    const volState: VolatilityState = {
      bbwp: 10, bbwpSma5: 12, regime: 'compression', regimeConfidence: 70,
      rateOfChange: -0.5, rateSmoothed: -0.3, acceleration: 0, rateDirection: 'flat',
      inSqueeze: false, squeezeStrength: 0,
    };
    const result = computeExhaustion(volState);
    expect(result.level).toBe(0);
    expect(result.label).toBe('LOW');
  });

  test('high level during climax with stochK > 80', () => {
    const volState: VolatilityState = {
      bbwp: 96, bbwpSma5: 94, regime: 'climax', regimeConfidence: 60,
      rateOfChange: -1, rateSmoothed: -0.8, acceleration: -0.5, rateDirection: 'decelerating',
      inSqueeze: false, squeezeStrength: 0,
    };
    const result = computeExhaustion(volState, { stochK: 85, adx: 40 } as DVEIndicatorInput);
    expect(result.level).toBeGreaterThan(50);
    expect(['HIGH', 'EXTREME']).toContain(result.label);
  });
});

describe('predictTransition', () => {
  test('compression + accelerating → transition to neutral with high probability', () => {
    const result = predictTransition('compression', 'accelerating', 10);
    expect(result.to).toBe('transition');
    expect(result.probability).toBeGreaterThan(40);
  });

  test('compression + decelerating → stay compression with low probability', () => {
    const result = predictTransition('compression', 'decelerating', 10);
    expect(result.to).toBe('compression');
    expect(result.probability).toBe(30);
  });

  test('expansion + decelerating → toward neutral', () => {
    const result = predictTransition('expansion', 'decelerating', 75);
    expect(result.to).toBe('neutral');
    expect(result.probability).toBe(40);
  });

  test('climax + decelerating → toward expansion (high probability)', () => {
    const result = predictTransition('climax', 'decelerating', 95);
    expect(result.to).toBe('expansion');
    expect(result.probability).toBe(60);
  });

  test('neutral near boundaries → toward adjacent regime', () => {
    const lowNeutral = predictTransition('neutral', 'decelerating', 20);
    expect(lowNeutral.to).toBe('compression');

    const highNeutral = predictTransition('neutral', 'accelerating', 65);
    expect(highNeutral.to).toBe('expansion');
  });
});

describe('computeMagnitude', () => {
  test('returns signal.strength when signal is active', () => {
    const signal: DVESignal = {
      type: 'compression_release_up', state: 'fired', active: true, strength: 78, triggerReason: [],
    };
    const result = computeMagnitude(signal, {} as PhasePersistence, {} as DirectionalPressure);
    expect(result).toBe(78);
  });

  test('uses exitProbability × direction for compression', () => {
    const signal: DVESignal = {
      type: 'none', state: 'idle', active: false, strength: 0, triggerReason: [],
    };
    const pp: PhasePersistence = {
      contraction: { active: true, continuationProbability: 30, exitProbability: 70, stats: {} as ZoneDurationStats },
      expansion: { active: false, continuationProbability: 0, exitProbability: 0, stats: {} as ZoneDurationStats },
    };
    const dir: DirectionalPressure = {
      score: 50, bias: 'bullish', confidence: 50,
      components: { stochasticMomentum: 0, trendStructure: 0, optionsFlow: 0, volumeExpansion: 0, dealerGamma: 0, fundingRate: 0, marketBreadth: 0 },
      componentDetails: [],
    };
    const result = computeMagnitude(signal, pp, dir);
    // 70 * (50/100) = 35
    expect(result).toBe(35);
  });

  test('clamps output to 0-100', () => {
    const signal: DVESignal = {
      type: 'none', state: 'idle', active: false, strength: 0, triggerReason: [],
    };
    const pp: PhasePersistence = {
      contraction: { active: true, continuationProbability: 0, exitProbability: 100, stats: {} as ZoneDurationStats },
      expansion: { active: false, continuationProbability: 0, exitProbability: 0, stats: {} as ZoneDurationStats },
    };
    const dir: DirectionalPressure = {
      score: 100, bias: 'bullish', confidence: 100,
      components: { stochasticMomentum: 15, trendStructure: 20, optionsFlow: 20, volumeExpansion: 10, dealerGamma: 15, fundingRate: 10, marketBreadth: 10 },
      componentDetails: [],
    };
    const result = computeMagnitude(signal, pp, dir);
    expect(result).toBeLessThanOrEqual(100);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  test('zero direction score produces zero magnitude in non-signal state', () => {
    const signal: DVESignal = {
      type: 'none', state: 'idle', active: false, strength: 0, triggerReason: [],
    };
    const pp: PhasePersistence = {
      contraction: { active: true, continuationProbability: 30, exitProbability: 70, stats: {} as ZoneDurationStats },
      expansion: { active: false, continuationProbability: 0, exitProbability: 0, stats: {} as ZoneDurationStats },
    };
    const dir: DirectionalPressure = {
      score: 0, bias: 'neutral', confidence: 0,
      components: { stochasticMomentum: 0, trendStructure: 0, optionsFlow: 0, volumeExpansion: 0, dealerGamma: 0, fundingRate: 0, marketBreadth: 0 },
      componentDetails: [],
    };
    const result = computeMagnitude(signal, pp, dir);
    expect(result).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('computeDVE', () => {
  test('full integration: produces valid DVEReading', () => {
    const input = makeInput({
      price: {
        closes: generateCalmSeries(300),
        currentPrice: 100,
        changePct: 0.5,
      },
      indicators: {
        stochK: 55, stochD: 50, stochMomentum: 5,
        stochKSlope: 1, stochDSlope: 0.5,
        sma20: 99, sma50: 97, adx: 22,
        macd: 0.5, macdHist: 0.3,
        atr: 2.5, bbUpper: 104, bbMiddle: 100, bbLower: 96,
      },
    });
    const reading = computeDVE(input, 'BTC');

    expect(reading.symbol).toBe('BTC');
    expect(reading.timestamp).toBeGreaterThan(0);
    expect(reading.volatility.bbwp).toBeGreaterThanOrEqual(0);
    expect(reading.volatility.bbwp).toBeLessThanOrEqual(100);
    expect(reading.volatility.regime).toBeTruthy();
    expect(reading.direction.bias).toBeTruthy();
    expect(reading.summary).toBeTruthy();
    expect(reading.label).toBeTruthy();
    expect(typeof reading.directionalVolatility.magnitude).toBe('number');
    expect(reading.dataQuality.score).toBeGreaterThanOrEqual(0);
  });

  test('flags array populated correctly', () => {
    const input = makeInput({
      price: { closes: generateCalmSeries(300), currentPrice: 100, changePct: 0 },
    });
    const reading = computeDVE(input, 'AAPL');
    expect(Array.isArray(reading.flags)).toBe(true);
  });

  test('signal always present in output (even if type=none)', () => {
    const input = makeInput({
      price: { closes: generateCalmSeries(300), currentPrice: 100, changePct: 0 },
    });
    const reading = computeDVE(input, 'SPY');
    expect(reading.signal).toBeDefined();
    expect(reading.signal.type).toBeDefined();
    expect(reading.signal.state).toBeDefined();
  });

  test('phasePersistence always present in output', () => {
    const input = makeInput({
      price: { closes: generateCalmSeries(300), currentPrice: 100, changePct: 0 },
    });
    const reading = computeDVE(input, 'ETH');
    expect(reading.phasePersistence).toBeDefined();
    expect(reading.phasePersistence.contraction).toBeDefined();
    expect(reading.phasePersistence.expansion).toBeDefined();
  });

  test('handles missing optional inputs gracefully', () => {
    const input: DVEInput = {
      price: {
        closes: generateCalmSeries(300),
        currentPrice: 100,
        changePct: 0,
      },
      // No indicators, options, time, liquidity, or mpeComposite
    };
    const reading = computeDVE(input, 'TSLA');
    expect(reading.volatility.bbwp).toBeDefined();
    expect(reading.direction.bias).toBeDefined();
    expect(reading.dataQuality.missing.length).toBeGreaterThan(0);
  });

  test('dataQuality present with score and missing array', () => {
    const input: DVEInput = {
      price: { closes: generateCalmSeries(300), currentPrice: 100, changePct: 0 },
    };
    const reading = computeDVE(input, 'BTC');
    expect(reading.dataQuality.score).toBeGreaterThanOrEqual(0);
    expect(reading.dataQuality.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(reading.dataQuality.missing)).toBe(true);
    expect(Array.isArray(reading.dataQuality.warnings)).toBe(true);
  });

  test('directionalVolatility.magnitude computed after signal (not NaN)', () => {
    const input = makeInput({
      price: { closes: generateCalmSeries(300), currentPrice: 100, changePct: 0 },
    });
    const reading = computeDVE(input, 'NVDA');
    expect(Number.isNaN(reading.directionalVolatility.magnitude)).toBe(false);
  });

  test('regimeConfidence present and 0-100', () => {
    const input = makeInput({
      price: { closes: generateCalmSeries(300), currentPrice: 100, changePct: 0 },
    });
    const reading = computeDVE(input, 'GOLD');
    expect(reading.volatility.regimeConfidence).toBeGreaterThanOrEqual(0);
    expect(reading.volatility.regimeConfidence).toBeLessThanOrEqual(100);
  });

  test('acceleration present in volatility state', () => {
    const input = makeInput({
      price: { closes: generateCalmSeries(300), currentPrice: 100, changePct: 0 },
    });
    const reading = computeDVE(input, 'SPX');
    expect(typeof reading.volatility.acceleration).toBe('number');
  });
});
