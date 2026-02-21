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
    weights: { SQ: 0.10, TA: 0.35, VA: 0.10, LL: 0.05, MTF: 0.30, FD: 0.10 },
    gates: { TA: 50, MTF: 40 },
    description: 'Strong trend — Technical Alignment (0.35) and Multi-Timeframe (0.30) drive conviction. Gate: TA≥50, MTF≥40.',
  },
  TREND_MATURE: {
    regime: 'TREND_MATURE',
    weights: { SQ: 0.10, TA: 0.10, VA: 0.30, LL: 0.10, MTF: 0.10, FD: 0.30 },
    gates: { VA: 40, FD: 35 },
    description: 'Aging trend — Volume (0.30) and Derivatives (0.30) divergence critical. Gate: VA≥40, FD≥35.',
  },
  RANGE_COMPRESSION: {
    regime: 'RANGE_COMPRESSION',
    weights: { SQ: 0.35, TA: 0.10, VA: 0.15, LL: 0.20, MTF: 0.05, FD: 0.15 },
    gates: { SQ: 55, LL: 40 },
    description: 'Range/chop — Signal Quality (0.35) must be exceptional. Liquidity (0.20) for clean fills. Gate: SQ≥55, LL≥40.',
  },
  VOL_EXPANSION: {
    regime: 'VOL_EXPANSION',
    weights: { SQ: 0.05, TA: 0.10, VA: 0.10, LL: 0.35, MTF: 0.05, FD: 0.35 },
    gates: { LL: 50, FD: 40 },
    description: 'Volatility spiking — Liquidity (0.35) and Fundamentals (0.35) dominate. Gate: LL≥50, FD≥40.',
  },
  TRANSITION: {
    regime: 'TRANSITION',
    weights: { SQ: 0.25, TA: 0.10, VA: 0.10, LL: 0.10, MTF: 0.35, FD: 0.10 },
    gates: { MTF: 50, SQ: 50 },
    description: 'Regime uncertain — MTF confirmation (0.35) and Signal Quality (0.25) required. Gate: MTF≥50, SQ≥50.',
  },
};

/**
 * Map platform Regime type (from risk-governor-hard) to scoring regime
 */
export function mapToScoringRegime(regime: string): ScoringRegime {
  const r = regime.toUpperCase();
  if (r === 'TREND_UP') return 'TREND_EXPANSION';
  if (r === 'TREND_DOWN') return 'TREND_MATURE'; // Downtrends = mature treatment (VA/FD emphasis, conservative)
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

  // Weighted total (linear)
  const linearWeightedScore =
    breakdown.SQ + breakdown.TA + breakdown.VA +
    breakdown.LL + breakdown.MTF + breakdown.FD;

  // === NONLINEAR CONVICTION CURVE ===
  // Mild convexity: inflates high-confidence scores, compresses mid-range
  // Creates visual separation in strong environments without destabilizing mid-range
  // Formula: score^1.08 for scores > 50, with +5 bonus above 75
  let rawWeightedScore: number;
  if (linearWeightedScore > 75) {
    rawWeightedScore = Math.pow(linearWeightedScore / 100, 1.08) * 100 + 5;
  } else if (linearWeightedScore > 50) {
    rawWeightedScore = Math.pow(linearWeightedScore / 100, 1.08) * 100;
  } else {
    // Below 50: apply mild concavity (makes weak scores slightly weaker)
    rawWeightedScore = Math.pow(linearWeightedScore / 100, 0.95) * 100;
  }
  rawWeightedScore = clamp(rawWeightedScore, 0, 100);

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

// =====================================================
// REGIME CONFIDENCE — Multi-Signal Agreement Score
// =====================================================

export interface RegimeAgreementInput {
  /** ADX value — used for trend/range classification */
  adx?: number;
  /** RSI value — confirms directional extreme or neutrality */
  rsi?: number;
  /** Aroon Up */
  aroonUp?: number;
  /** Aroon Down */
  aroonDown?: number;
  /** MTF alignment count 0-5 */
  mtfAlignment?: number;
  /** Inferred regime string (from inferRegimeFromData or similar) */
  inferredRegime?: string;
}

/**
 * Derive regimeConfidence from multi-signal agreement instead of static default.
 *
 * Agreement dimensions (each 0 or 1):
 *   1. ADX classification — does ADX agree with regime? (trend→ADX>25, range→ADX<20)
 *   2. RSI confirmation — RSI extreme for vol expansion, or directional for trend
 *   3. Aroon direction — Aroon spread confirms regime direction
 *   4. MTF alignment — 3+ timeframes agree
 *
 * Scoring: 4/4=85, 3/4=70, 2/4=55, 1/4=40, 0/4=30
 * If fewer than 2 indicators are available, clamp at floor of 45 (insufficient data).
 */
export function deriveRegimeConfidence(input: RegimeAgreementInput): {
  confidence: number;
  agreementCount: number;
  totalChecks: number;
  details: string[];
} {
  const regime = (input.inferredRegime || 'RANGE_NEUTRAL').toUpperCase();
  let agreements = 0;
  let checks = 0;
  const details: string[] = [];

  // Dimension 1: ADX classification
  if (input.adx !== undefined && !isNaN(input.adx)) {
    checks++;
    const isTrend = regime.includes('TREND');
    const isRange = regime.includes('RANGE') || regime.includes('CONTRACTION');
    const isVol = regime.includes('VOL') || regime.includes('STRESS');
    if (isTrend && input.adx > 25) {
      agreements++;
      details.push(`ADX=${input.adx.toFixed(0)} confirms trend (>25)`);
    } else if (isRange && input.adx < 20) {
      agreements++;
      details.push(`ADX=${input.adx.toFixed(0)} confirms range (<20)`);
    } else if (isVol && input.adx > 20) {
      agreements++;
      details.push(`ADX=${input.adx.toFixed(0)} supports vol expansion (>20)`);
    } else {
      details.push(`ADX=${input.adx.toFixed(0)} DISAGREES with ${regime}`);
    }
  }

  // Dimension 2: RSI confirmation
  if (input.rsi !== undefined && !isNaN(input.rsi)) {
    checks++;
    const isTrendUp = regime === 'TREND_UP' || regime === 'TREND_EXPANSION';
    const isTrendDown = regime === 'TREND_DOWN' || regime === 'TREND_MATURE';
    const isVolExpansion = regime.includes('VOL') || regime.includes('STRESS');
    if (isTrendUp && input.rsi >= 50) {
      agreements++;
      details.push(`RSI=${input.rsi.toFixed(0)} confirms bullish trend (≥50)`);
    } else if (isTrendDown && input.rsi <= 50) {
      agreements++;
      details.push(`RSI=${input.rsi.toFixed(0)} confirms bearish trend (≤50)`);
    } else if (isVolExpansion && (input.rsi > 75 || input.rsi < 25)) {
      agreements++;
      details.push(`RSI=${input.rsi.toFixed(0)} confirms extreme volatility`);
    } else if (!isTrendUp && !isTrendDown && !isVolExpansion && input.rsi >= 35 && input.rsi <= 65) {
      agreements++;
      details.push(`RSI=${input.rsi.toFixed(0)} confirms range-bound (35-65)`);
    } else {
      details.push(`RSI=${input.rsi.toFixed(0)} DISAGREES with ${regime}`);
    }
  }

  // Dimension 3: Aroon direction agreement
  if (input.aroonUp !== undefined && input.aroonDown !== undefined &&
      !isNaN(input.aroonUp) && !isNaN(input.aroonDown)) {
    checks++;
    const isTrendUp = regime === 'TREND_UP' || regime === 'TREND_EXPANSION';
    const isTrendDown = regime === 'TREND_DOWN' || regime === 'TREND_MATURE';
    if (isTrendUp && input.aroonUp > 70 && input.aroonDown < 50) {
      agreements++;
      details.push(`Aroon ${input.aroonUp.toFixed(0)}/${input.aroonDown.toFixed(0)} confirms uptrend`);
    } else if (isTrendDown && input.aroonDown > 70 && input.aroonUp < 50) {
      agreements++;
      details.push(`Aroon ${input.aroonUp.toFixed(0)}/${input.aroonDown.toFixed(0)} confirms downtrend`);
    } else if (!isTrendUp && !isTrendDown && Math.abs(input.aroonUp - input.aroonDown) < 30) {
      agreements++;
      details.push(`Aroon spread ${Math.abs(input.aroonUp - input.aroonDown).toFixed(0)} confirms no clear direction`);
    } else {
      details.push(`Aroon ${input.aroonUp.toFixed(0)}/${input.aroonDown.toFixed(0)} DISAGREES with ${regime}`);
    }
  }

  // Dimension 4: MTF alignment
  if (input.mtfAlignment !== undefined && !isNaN(input.mtfAlignment)) {
    checks++;
    if (input.mtfAlignment >= 3) {
      agreements++;
      details.push(`MTF=${input.mtfAlignment}/5 aligned (strong)`);
    } else {
      details.push(`MTF=${input.mtfAlignment}/5 aligned (weak)`);
    }
  }

  // Scoring: map agreement ratio to confidence
  // 4/4 = 85, 3/4 = 70, 2/4 = 55, 1/4 = 40, 0/4 = 30
  // If <2 indicators available, floor at 45 (insufficient data)
  let confidence: number;
  if (checks < 2) {
    confidence = 45; // Insufficient data — conservative floor
    details.push(`INSUFFICIENT_DATA: only ${checks} signals available, floor=45`);
  } else {
    const ratio = agreements / checks;
    if (ratio >= 1.0) confidence = 85;
    else if (ratio >= 0.75) confidence = 70;
    else if (ratio >= 0.50) confidence = 55;
    else if (ratio >= 0.25) confidence = 40;
    else confidence = 30;
  }

  return { confidence, agreementCount: agreements, totalChecks: checks, details };
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
  const mtfCount = opts.mtfAlignment ?? 3; // Default moderate (was 2, which auto-failed TRANSITION gate)
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
