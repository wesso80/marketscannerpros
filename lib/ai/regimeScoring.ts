// lib/ai/regimeScoring.ts
// Regime-Calibrated Scoring Weights — 5 regime matrices × 6 components + gating rules

/**
 * The 6 confluence components scored 0-100 each
 */
export interface ConfluenceComponents {
  /** Signal Quality — scanner score authority, signal clarity, setup classification */
  SQ: number;
  /** Technical Alignment — indicator hierarchy compliance (Regime→Momentum→Timing→Risk) */
  TA: number;
  /** Volume/Activity — OBV trend, volume ratio, derivatives flow confirmation */
  VA: number;
  /** Liquidity Level — session timing, spread conditions, options chain depth */
  LL: number;
  /** Multi-Timeframe — cross-timeframe agreement (aligned/mixed/conflicting) */
  MTF: number;
  /** Fundamental/Derivatives — macro context, OI/Funding/L-S ratio signals */
  FD: number;
}

export type ScoringRegime =
  | 'TREND_EXPANSION'
  | 'TREND_MATURE'
  | 'RANGE_COMPRESSION'
  | 'VOL_EXPANSION'
  | 'TRANSITION';

export type TradeBias = 'NEUTRAL' | 'CONDITIONAL' | 'VALID' | 'HIGH_CONFLUENCE';

export interface RegimeWeightMatrix {
  regime: ScoringRegime;
  weights: Record<keyof ConfluenceComponents, number>;
  /** Hard gate: component score below this blocks the setup regardless of weighted total */
  gates: Partial<Record<keyof ConfluenceComponents, number>>;
  /** Description for prompt injection */
  description: string;
}

export interface RegimeScoringResult {
  regime: ScoringRegime;
  rawComponents: ConfluenceComponents;
  weights: Record<keyof ConfluenceComponents, number>;
  weightedScore: number;
  gateViolations: string[];
  gated: boolean;
  tradeBias: TradeBias;
  /** Breakdown: component → weighted contribution */
  breakdown: Record<keyof ConfluenceComponents, number>;
}

// =====================================================
// 5 REGIME WEIGHT MATRICES
// Weights sum to ~1.0 per regime (allow slight over/under for emphasis)
// =====================================================

const REGIME_MATRICES: Record<ScoringRegime, RegimeWeightMatrix> = {
  TREND_EXPANSION: {
    regime: 'TREND_EXPANSION',
    weights: { SQ: 0.20, TA: 0.25, VA: 0.15, LL: 0.10, MTF: 0.20, FD: 0.10 },
    gates: { TA: 50, MTF: 40 },
    description: 'Strong trend — Technical Alignment and Multi-Timeframe drive conviction. Gate: TA≥50, MTF≥40.',
  },
  TREND_MATURE: {
    regime: 'TREND_MATURE',
    weights: { SQ: 0.15, TA: 0.20, VA: 0.20, LL: 0.10, MTF: 0.15, FD: 0.20 },
    gates: { VA: 40, FD: 35 },
    description: 'Aging trend — Volume confirmation and Derivatives divergence become critical. Gate: VA≥40, FD≥35.',
  },
  RANGE_COMPRESSION: {
    regime: 'RANGE_COMPRESSION',
    weights: { SQ: 0.25, TA: 0.15, VA: 0.20, LL: 0.15, MTF: 0.10, FD: 0.15 },
    gates: { SQ: 55, LL: 40 },
    description: 'Range/chop — Signal Quality must be exceptional. Liquidity matters for clean fills. Gate: SQ≥55, LL≥40.',
  },
  VOL_EXPANSION: {
    regime: 'VOL_EXPANSION',
    weights: { SQ: 0.15, TA: 0.15, VA: 0.10, LL: 0.25, MTF: 0.10, FD: 0.25 },
    gates: { LL: 50, FD: 40 },
    description: 'Volatility spiking — Liquidity and Fundamental context dominate. Gate: LL≥50, FD≥40.',
  },
  TRANSITION: {
    regime: 'TRANSITION',
    weights: { SQ: 0.20, TA: 0.15, VA: 0.15, LL: 0.15, MTF: 0.20, FD: 0.15 },
    gates: { MTF: 50, SQ: 50 },
    description: 'Regime uncertain — Multi-Timeframe confirmation and Signal Quality required. Gate: MTF≥50, SQ≥50.',
  },
};

/**
 * Map platform Regime type (from risk-governor-hard) to scoring regime
 */
export function mapToScoringRegime(regime: string): ScoringRegime {
  const r = regime.toUpperCase();
  if (r === 'TREND_UP' || r === 'TREND_DOWN') return 'TREND_EXPANSION';
  if (r === 'RANGE_NEUTRAL') return 'RANGE_COMPRESSION';
  if (r === 'VOL_EXPANSION') return 'VOL_EXPANSION';
  if (r === 'VOL_CONTRACTION') return 'RANGE_COMPRESSION';
  if (r === 'RISK_OFF_STRESS') return 'VOL_EXPANSION';
  // Check for human-readable labels from API
  if (r.includes('TREND') && r.includes('MATURE')) return 'TREND_MATURE';
  if (r.includes('TREND')) return 'TREND_EXPANSION';
  if (r.includes('RANGE') || r.includes('COMPRESSION') || r.includes('CHOP')) return 'RANGE_COMPRESSION';
  if (r.includes('VOL') || r.includes('VOLATILE') || r.includes('STRESS')) return 'VOL_EXPANSION';
  if (r.includes('TRANSITION')) return 'TRANSITION';
  return 'TRANSITION'; // Default to most conservative
}

/**
 * Get the weight matrix for a given regime
 */
export function getRegimeWeights(regime: ScoringRegime): RegimeWeightMatrix {
  return REGIME_MATRICES[regime];
}

/**
 * Get all regime matrices (for prompt injection)
 */
export function getAllRegimeMatrices(): Record<ScoringRegime, RegimeWeightMatrix> {
  return { ...REGIME_MATRICES };
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Compute regime-calibrated weighted score with gating
 * 
 * Formula: Σ(weight_i × component_i) then apply gates + penalties
 * Trade Bias: <55 Neutral, 55-70 Conditional, 70-85 Valid, 85+ High Confluence
 */
export function computeRegimeScore(
  components: ConfluenceComponents,
  regime: ScoringRegime
): RegimeScoringResult {
  const matrix = REGIME_MATRICES[regime];
  const weights = matrix.weights;

  // Clamp all components to 0-100
  const clamped: ConfluenceComponents = {
    SQ: clamp(components.SQ),
    TA: clamp(components.TA),
    VA: clamp(components.VA),
    LL: clamp(components.LL),
    MTF: clamp(components.MTF),
    FD: clamp(components.FD),
  };

  // Compute weighted contributions
  const breakdown: Record<keyof ConfluenceComponents, number> = {
    SQ: clamped.SQ * weights.SQ,
    TA: clamped.TA * weights.TA,
    VA: clamped.VA * weights.VA,
    LL: clamped.LL * weights.LL,
    MTF: clamped.MTF * weights.MTF,
    FD: clamped.FD * weights.FD,
  };

  // Weighted total
  const rawWeightedScore =
    breakdown.SQ + breakdown.TA + breakdown.VA +
    breakdown.LL + breakdown.MTF + breakdown.FD;

  // Check gates
  const gateViolations: string[] = [];
  for (const [comp, minValue] of Object.entries(matrix.gates)) {
    const key = comp as keyof ConfluenceComponents;
    if (clamped[key] < (minValue as number)) {
      gateViolations.push(`${key}=${clamped[key].toFixed(0)} < gate ${minValue}`);
    }
  }

  const gated = gateViolations.length > 0;

  // If gated, cap the score at 55 (forces NEUTRAL/CONDITIONAL at best)
  const weightedScore = gated
    ? Math.min(rawWeightedScore, 55)
    : clamp(rawWeightedScore, 0, 100);

  // Map to trade bias
  let tradeBias: TradeBias;
  if (weightedScore < 55) {
    tradeBias = 'NEUTRAL';
  } else if (weightedScore < 70) {
    tradeBias = 'CONDITIONAL';
  } else if (weightedScore < 85) {
    tradeBias = 'VALID';
  } else {
    tradeBias = 'HIGH_CONFLUENCE';
  }

  return {
    regime,
    rawComponents: clamped,
    weights,
    weightedScore: Number(weightedScore.toFixed(1)),
    gateViolations,
    gated,
    tradeBias,
    breakdown: {
      SQ: Number(breakdown.SQ.toFixed(2)),
      TA: Number(breakdown.TA.toFixed(2)),
      VA: Number(breakdown.VA.toFixed(2)),
      LL: Number(breakdown.LL.toFixed(2)),
      MTF: Number(breakdown.MTF.toFixed(2)),
      FD: Number(breakdown.FD.toFixed(2)),
    },
  };
}

/**
 * Estimate components from scanner/institutional-filter data
 * Used when full component scores are not available (backward compatibility)
 */
export function estimateComponentsFromContext(opts: {
  scannerScore?: number;
  regime?: string;
  adx?: number;
  rsi?: number;
  cci?: number;
  aroonUp?: number;
  aroonDown?: number;
  obv?: number;
  volumeRatio?: number;
  session?: string;
  mtfAlignment?: number; // 0-5 how many TFs align
  derivativesAvailable?: boolean;
  fundingRate?: number;
  oiChange24h?: number;
  fearGreed?: number;
  ivRank?: number;
}): ConfluenceComponents {
  // SQ: Signal Quality from scanner score
  const SQ = clamp(opts.scannerScore ?? 50);

  // TA: Technical Alignment estimate
  let TA = 50;
  if (opts.rsi !== undefined) {
    if (opts.rsi > 50 && opts.rsi < 70) TA += 15; // Bullish confirmation
    else if (opts.rsi < 50 && opts.rsi > 30) TA -= 10; // Bearish pressure
    else if (opts.rsi >= 70 || opts.rsi <= 30) TA -= 5; // Overbought/oversold
  }
  if (opts.adx !== undefined) {
    if (opts.adx > 25) TA += 10; // Trend strength
    else if (opts.adx < 15) TA -= 10; // No trend
  }
  if (opts.cci !== undefined) {
    if (opts.cci > 0) TA += 5;
    else if (opts.cci < -100) TA -= 10;
  }
  TA = clamp(TA);

  // VA: Volume/Activity
  let VA = 50;
  if (opts.volumeRatio !== undefined) {
    if (opts.volumeRatio > 1.5) VA += 20;
    else if (opts.volumeRatio > 1.0) VA += 10;
    else if (opts.volumeRatio < 0.6) VA -= 15;
  }
  VA = clamp(VA);

  // LL: Liquidity Level
  let LL = 60; // Default: regular session assumed
  if (opts.session) {
    const s = opts.session.toLowerCase();
    if (s === 'premarket' || s === 'afterhours') LL = 40;
    else if (s === 'closed') LL = 20;
    else if (s === 'regular') LL = 70;
  }
  LL = clamp(LL);

  // MTF: Multi-Timeframe
  const mtfCount = opts.mtfAlignment ?? 2; // Default conservative
  const MTF = clamp(mtfCount * 20); // 0TF=0, 1TF=20, 2TF=40, 3TF=60, 4TF=80, 5TF=100

  // FD: Fundamental/Derivatives
  let FD = 45; // Default: no derivatives data
  if (opts.derivativesAvailable) {
    FD = 55; // Bump for having data at all
    if (opts.oiChange24h !== undefined) {
      if (Math.abs(opts.oiChange24h) > 5) FD += 10; // High conviction signal
    }
    if (opts.fundingRate !== undefined) {
      if (Math.abs(opts.fundingRate) > 0.05) FD += 5; // Extreme funding
    }
    if (opts.fearGreed !== undefined) {
      if (opts.fearGreed < 25 || opts.fearGreed > 75) FD += 10; // Extreme sentiment
    }
  }
  if (opts.ivRank !== undefined) {
    if (opts.ivRank > 70) FD += 5; // Elevated IV = important data
    if (opts.ivRank < 30) FD += 5;
  }
  FD = clamp(FD);

  return { SQ, TA, VA, LL, MTF, FD };
}
