/**
 * Institutional-Grade Probability Engine
 * 
 * Converts technical signals into a direction-aware posterior probability using:
 * 1. Prior win-rate baseline in log-odds space
 * 2. Weighted, confidence-scaled signal evidence updates
 * 3. Correlation-aware confluence handling
 * 4. Guard-railed Kelly-based sizing for options
 * 
 * Based on quantitative trading frameworks used by hedge funds.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SignalInput {
  triggered: boolean;
  confidence: number;  // 0-1, how strong the signal is
  value?: number;      // Raw indicator value for display
}

export interface ProbabilityResult {
  winProbability: number;       // 0-100%
  confidenceLabel: string;      // "High Conviction", "Strong", "Moderate", "Weak", "No Signal"
  signalCount: number;          // How many signals aligned
  totalSignals: number;         // Total signals checked
  confluenceScore: number;      // 0-100 based on alignment
  direction: 'bullish' | 'bearish' | 'neutral';
  kellySizePercent: number;     // Kelly-based position size after conviction/edge gates and hard cap
  rMultiple: number;            // Risk multiple for trade sizing
  components: SignalComponent[];
}

export interface SignalComponent {
  name: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  triggered: boolean;
  confidence: number;
  contribution: number;  // Relative influence score (scaled from bounded log-odds delta)
  reason: string;
}

export interface OptionsSignals {
  // Technical Confluence
  timeConfluence?: SignalInput & { stack?: number; decompressing?: string[] };
  
  // Open Interest Analysis
  putCallRatio?: SignalInput & {
    ratio?: number;
    mode?: 'flow' | 'contrarian';
    extremeHigh?: number;
    extremeLow?: number;
  };
  maxPainDistance?: SignalInput & {
    maxPain?: number;
    currentPrice?: number;
    dte?: number;
    atr?: number;
    maxPainWindowDTE?: number;
  };
  
  // Options Flow
  unusualActivity?: SignalInput & { 
    callPremium?: number; 
    putPremium?: number;
    alertLevel?: 'high' | 'moderate' | 'low' | 'none';
  };
  
  // IV Analysis
  ivRank?: SignalInput & { rank?: number; signal?: 'buy_premium' | 'sell_premium' | 'neutral' };
  
  // Price Action
  trendAlignment?: SignalInput & { ema200Direction?: 'above' | 'below' | 'neutral' };
  
  // Momentum
  rsiMomentum?: SignalInput & { rsi?: number };
  
  // Volume
  volumeConfirmation?: SignalInput;
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORICAL WIN RATES (From backtesting/research)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * These weights represent historical win rates when each signal triggers.
 * Derived from industry research and backtesting.
 * 
 * Higher weight = more predictive power historically
 */
export const SIGNAL_WEIGHTS = {
  // Options-specific signals (higher weight - real money flow)
  unusualActivity: {
    baseWinRate: 0.65,      // 65% when smart money is betting
    weight: 0.25,           // 25% of total score
    maxContribution: 25,
  },
  putCallRatio: {
    baseWinRate: 0.58,      // P/C extremes predict reversals
    weight: 0.15,
    maxContribution: 15,
  },
  maxPainDistance: {
    baseWinRate: 0.55,      // Price tends toward max pain by expiry
    weight: 0.10,
    maxContribution: 10,
  },
  
  // Time confluence signals
  timeConfluence: {
    baseWinRate: 0.62,      // Multiple timeframes aligning
    weight: 0.20,
    maxContribution: 20,
  },
  
  // IV signals
  ivRank: {
    baseWinRate: 0.60,      // IV mean reversion is reliable
    weight: 0.10,
    maxContribution: 10,
  },
  
  // Technical signals
  trendAlignment: {
    baseWinRate: 0.58,      // Trend following works
    weight: 0.10,
    maxContribution: 10,
  },
  rsiMomentum: {
    baseWinRate: 0.55,      // RSI extremes predict bounces
    weight: 0.05,
    maxContribution: 5,
  },
  volumeConfirmation: {
    baseWinRate: 0.54,      // Volume confirms moves
    weight: 0.05,
    maxContribution: 5,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// PROBABILITY CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function logit(p: number): number {
  const x = clamp(p, 0.001, 0.999);
  return Math.log(x / (1 - x));
}

function logistic(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

type Dir = 'bullish' | 'bearish' | 'neutral';

function signForDirection(
  signalDirection: 'bullish' | 'bearish' | 'neutral',
  tradeDirection: 'bullish' | 'bearish' | 'neutral'
): number {
  if (tradeDirection === 'neutral') {
    return signalDirection === 'bullish' ? 1 : signalDirection === 'bearish' ? -1 : 0;
  }
  if (signalDirection === 'neutral') return 0;
  return signalDirection === tradeDirection ? 1 : -1;
}

function inferDirectionFromZ(z: number, priorWinRate: number, margin: number = 0.1): Dir {
  const baseline = logit(priorWinRate);
  if (z > baseline + margin) return 'bullish';
  if (z < baseline - margin) return 'bearish';
  return 'neutral';
}

function breakevenProbability(rr: number): number {
  return 1 / (rr + 1);
}

const PRIOR_WIN_RATE = 0.5;
const STRONG_EDGE = 0.15;

export interface ProbabilityEngineCalibration {
  priorWinRate: number;
  strongEdge: number;
  maxDeltaPerSignal: number;
  directionInferenceMargin: number;
  confluenceBoostCap: number;
  confluenceBoostGain: number;
  minKellyConviction: number;
  minKellySignals: number;
  maxOptionsKellyPercent: number;
  minEdgeBuffer: number;
}

export const PROBABILITY_ENGINE_CALIBRATION: ProbabilityEngineCalibration = {
  priorWinRate: PRIOR_WIN_RATE,
  strongEdge: STRONG_EDGE,
  maxDeltaPerSignal: 0.35,
  directionInferenceMargin: 0.1,
  confluenceBoostCap: 0.1,
  confluenceBoostGain: 0.08,
  minKellyConviction: 0.55,
  minKellySignals: 3,
  maxOptionsKellyPercent: 10,
  minEdgeBuffer: 0.05,
};

/**
 * Kelly Criterion Position Sizing
 * 
 * f* = (p*b - q) / b
 * where:
 *   p = win probability
 *   q = 1 - p (loss probability)
 *   b = reward/risk ratio
 * 
 * Base output is Quarter Kelly; final applied size is additionally gated and
 * capped in the options probability engine.
 */
export function kellyPositionSize(
  winProbability: number,
  rewardRiskRatio: number = 2.0
): number {
  const p = winProbability;
  const q = 1 - p;
  const b = rewardRiskRatio;
  
  const fullKelly = (p * b - q) / b;
  
  // Quarter Kelly for safety, max 25% of capital
  const quarterKelly = Math.max(0, fullKelly * 0.25);
  
  return Math.min(quarterKelly, 0.25);
}

/**
 * Calculate R-Multiple for position sizing
 * 
 * R = Account Risk / Stop Distance
 * This determines how many "R" a trade can risk.
 */
export function calculateRMultiple(
  accountSize: number,
  riskPercent: number,
  entryPrice: number,
  stopPrice: number,
  positionSize: number
): number {
  const accountRisk = accountSize * (riskPercent / 100);
  const stopDistance = Math.abs(entryPrice - stopPrice);
  const positionRisk = stopDistance * positionSize;
  
  if (positionRisk === 0) return 0;
  
  return accountRisk / positionRisk;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PROBABILITY ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate win probability from options signals
 * 
 * This is the main function for the Options Scanner Pro Mode.
 */
export function calculateOptionsProbability(
  signals: OptionsSignals,
  tradeDirection: Dir = 'neutral',
  rewardRiskRatio: number = 2.0
): ProbabilityResult {
  const components: SignalComponent[] = [];
  let totalSignals = 0;

  let z = logit(PROBABILITY_ENGINE_CALIBRATION.priorWinRate);

  let bullishCount = 0;
  let bearishCount = 0;

  let alignedWeightSum = 0;
  let activeWeightSum = 0;

  const clusterState: Record<'trend_cluster', { aligned: number; opposing: number }> = {
    trend_cluster: { aligned: 0, opposing: 0 },
  };
  
  // Helper to add signal component
  const addSignal = (
    name: string,
    signal: SignalInput | undefined,
    weightConfig: typeof SIGNAL_WEIGHTS.unusualActivity,
    signalDirection: 'bullish' | 'bearish' | 'neutral',
    reason: string,
    correlationGroup: 'none' | 'trend_cluster' = 'none'
  ) => {
    totalSignals++;
    
    if (!signal?.triggered) {
      components.push({
        name,
        direction: 'neutral',
        triggered: false,
        confidence: 0,
        contribution: 0,
        reason: 'Not triggered',
      });
      return;
    }

    const conf = clamp(signal.confidence, 0, 1);
    const baseRate = clamp(weightConfig.baseWinRate, 0.35, 0.75);
    const edge = baseRate - 0.5;
    const sign = signForDirection(signalDirection, tradeDirection);

    if (signalDirection === 'bullish') bullishCount++;
    if (signalDirection === 'bearish') bearishCount++;

    let correlationMultiplier = 1;
    if (correlationGroup !== 'none') {
      const state = clusterState[correlationGroup];
      const aligns = tradeDirection === 'neutral' ? false : sign === 1;

      if (tradeDirection === 'neutral') {
        const used = state.aligned + state.opposing;
        correlationMultiplier = used === 0 ? 1 : used === 1 ? 0.85 : 0.7;
        state.aligned += 1;
      } else if (aligns) {
        correlationMultiplier = state.aligned === 0 ? 1 : state.aligned === 1 ? 0.75 : 0.6;
        state.aligned += 1;
      } else if (sign === -1) {
        correlationMultiplier = state.opposing === 0 ? 1 : state.opposing === 1 ? 0.9 : 0.8;
        state.opposing += 1;
      }
    }

    const effectiveWeight = weightConfig.weight * correlationMultiplier;
    const rawDelta = sign * effectiveWeight * conf * (edge / PROBABILITY_ENGINE_CALIBRATION.strongEdge);
    const delta = clamp(
      rawDelta,
      -PROBABILITY_ENGINE_CALIBRATION.maxDeltaPerSignal,
      PROBABILITY_ENGINE_CALIBRATION.maxDeltaPerSignal
    );

    z += delta;
    activeWeightSum += effectiveWeight;

    if (tradeDirection !== 'neutral' && sign === 1) {
      alignedWeightSum += effectiveWeight * conf;
    }

    components.push({
      name,
      direction: signalDirection,
      triggered: true,
      confidence: conf,
      contribution: Math.round(Math.abs(delta) * 100),
      reason,
    });
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // Process each signal
  // ─────────────────────────────────────────────────────────────────────────
  
  // 1. Unusual Activity (Smart Money)
  if (signals.unusualActivity) {
    const ua = signals.unusualActivity;
    const callBias = (ua.callPremium || 0) > (ua.putPremium || 0);
    const uaDirection = callBias ? 'bullish' : (ua.putPremium || 0) > 0 ? 'bearish' : 'neutral';
    const premiumFlow = Math.max(ua.callPremium || 0, ua.putPremium || 0);
    
    addSignal(
      'Unusual Activity',
      ua,
      SIGNAL_WEIGHTS.unusualActivity,
      uaDirection,
      premiumFlow > 0 
        ? `$${premiumFlow.toLocaleString()} ${callBias ? 'call' : 'put'} premium (${ua.alertLevel} alert)`
        : 'Smart money detected'
    );
  } else {
    addSignal('Unusual Activity', undefined, SIGNAL_WEIGHTS.unusualActivity, 'neutral', '');
  }
  
  // 2. Put/Call Ratio
  if (signals.putCallRatio) {
    const pcr = signals.putCallRatio;
    const ratio = pcr.ratio ?? 1;

    const mode = pcr.mode ?? 'flow';
    const extremeHigh = pcr.extremeHigh ?? 1.3;
    const extremeLow = pcr.extremeLow ?? 0.7;

    let pcrDirection: Dir = 'neutral';
    let reasonTag = 'Balanced';

    if (mode === 'flow') {
      if (ratio < extremeLow) {
        pcrDirection = 'bullish';
        reasonTag = 'Call-heavy';
      } else if (ratio > 1.0) {
        pcrDirection = 'bearish';
        reasonTag = 'Put-heavy';
      }
    } else {
      if (ratio >= extremeHigh) {
        pcrDirection = 'bullish';
        reasonTag = 'Fear extreme (contrarian)';
      } else if (ratio <= extremeLow) {
        pcrDirection = 'bearish';
        reasonTag = 'Euphoria extreme (contrarian)';
      }
    }
    
    addSignal(
      'Put/Call Ratio',
      pcr,
      SIGNAL_WEIGHTS.putCallRatio,
      pcrDirection,
      `P/C ${ratio.toFixed(2)} (${mode}) - ${reasonTag}`
    );
  } else {
    addSignal('Put/Call Ratio', undefined, SIGNAL_WEIGHTS.putCallRatio, 'neutral', '');
  }
  
  // 3. Max Pain Distance
  if (signals.maxPainDistance) {
    const mpd = signals.maxPainDistance;
    const maxPain = mpd.maxPain;
    const price = mpd.currentPrice;
    const dte = mpd.dte ?? null;
    const maxPainWindowDTE = mpd.maxPainWindowDTE ?? 10;
    const withinWindow = dte === null ? true : dte <= maxPainWindowDTE;

    if (mpd.triggered && withinWindow && maxPain != null && price != null) {
      const diff = price - maxPain;
      const mpdDirection: Dir = diff > 0 ? 'bearish' : diff < 0 ? 'bullish' : 'neutral';

      addSignal(
        'Max Pain Gravity',
        mpd,
        SIGNAL_WEIGHTS.maxPainDistance,
        mpdDirection,
        `Price $${Math.abs(diff).toFixed(2)} ${diff > 0 ? 'above' : 'below'} Max Pain $${maxPain.toFixed(2)}${dte !== null ? ` | DTE ${dte}` : ''}`
      );
    } else {
      addSignal(
        'Max Pain Gravity',
        { triggered: false, confidence: 0 },
        SIGNAL_WEIGHTS.maxPainDistance,
        'neutral',
        withinWindow ? 'Not triggered' : `Outside max pain window (DTE>${maxPainWindowDTE})`
      );
    }
  } else {
    addSignal('Max Pain Gravity', undefined, SIGNAL_WEIGHTS.maxPainDistance, 'neutral', '');
  }
  
  // 4. Time Confluence
  if (signals.timeConfluence) {
    const tc = signals.timeConfluence;
    const tcDirection = 'neutral' as const;
    
    addSignal(
      'Time Confluence',
      tc,
      SIGNAL_WEIGHTS.timeConfluence,
      tcDirection,
      `Stack: ${tc.stack || 0} | ${(tc.decompressing || []).join(', ') || 'No decompression'}`
    );
  } else {
    addSignal('Time Confluence', undefined, SIGNAL_WEIGHTS.timeConfluence, 'neutral', '');
  }
  
  // 5. IV Rank
  if (signals.ivRank) {
    const iv = signals.ivRank;
    // IV doesn't determine direction, but affects strategy choice
    const ivDirection = 'neutral' as const;
    
    addSignal(
      'IV Environment',
      iv,
      SIGNAL_WEIGHTS.ivRank,
      ivDirection,
      `IV Rank ${iv.rank || 50}% - ${iv.signal === 'sell_premium' ? 'Sell premium' : iv.signal === 'buy_premium' ? 'Buy premium' : 'Either works'}`
    );
  } else {
    addSignal('IV Environment', undefined, SIGNAL_WEIGHTS.ivRank, 'neutral', '');
  }
  
  // 6. Trend Alignment
  if (signals.trendAlignment) {
    const ta = signals.trendAlignment;
    const taDirection: Dir = ta.ema200Direction === 'above' ? 'bullish' : ta.ema200Direction === 'below' ? 'bearish' : 'neutral';
    
    addSignal(
      'Trend Alignment',
      ta,
      SIGNAL_WEIGHTS.trendAlignment,
      taDirection,
      `Price ${ta.ema200Direction || 'near'} EMA200`,
      'trend_cluster'
    );
  } else {
    addSignal('Trend Alignment', undefined, SIGNAL_WEIGHTS.trendAlignment, 'neutral', '');
  }
  
  // 7. RSI Momentum
  if (signals.rsiMomentum) {
    const rsi = signals.rsiMomentum;
    const rsiVal = rsi.rsi ?? 50;
    const trendRegime = signals.trendAlignment?.ema200Direction ?? 'neutral';
    let rsiDirection: Dir = 'neutral';

    if (trendRegime === 'above') {
      rsiDirection = rsiVal < 30 ? 'bullish' : 'neutral';
    } else if (trendRegime === 'below') {
      rsiDirection = rsiVal > 70 ? 'bearish' : 'neutral';
    } else {
      rsiDirection = rsiVal < 30 ? 'bullish' : rsiVal > 70 ? 'bearish' : 'neutral';
    }
    
    addSignal(
      'RSI Momentum',
      rsi,
      SIGNAL_WEIGHTS.rsiMomentum,
      rsiDirection,
      `RSI ${rsiVal.toFixed(0)} (${trendRegime})`,
      'trend_cluster'
    );
  } else {
    addSignal('RSI Momentum', undefined, SIGNAL_WEIGHTS.rsiMomentum, 'neutral', '');
  }
  
  // 8. Volume Confirmation
  if (signals.volumeConfirmation) {
    const volumeDirection: Dir = tradeDirection === 'neutral' ? 'neutral' : tradeDirection;

    addSignal(
      'Volume Confirmation',
      signals.volumeConfirmation,
      SIGNAL_WEIGHTS.volumeConfirmation,
      volumeDirection,
      signals.volumeConfirmation.triggered ? 'Above-average volume' : 'Normal volume',
      'trend_cluster'
    );
  } else {
    addSignal('Volume Confirmation', undefined, SIGNAL_WEIGHTS.volumeConfirmation, 'neutral', '');
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Calculate final probability
  // ─────────────────────────────────────────────────────────────────────────
  
  if (tradeDirection !== 'neutral' && activeWeightSum > 0) {
    const quality = clamp(alignedWeightSum / activeWeightSum, 0, 1);
    const boost = clamp(
      PROBABILITY_ENGINE_CALIBRATION.confluenceBoostGain * quality,
      0,
      PROBABILITY_ENGINE_CALIBRATION.confluenceBoostCap
    );
    z += boost;
  }

  const dominantDirection: Dir = tradeDirection !== 'neutral'
    ? tradeDirection
    : inferDirectionFromZ(
      z,
      PROBABILITY_ENGINE_CALIBRATION.priorWinRate,
      PROBABILITY_ENGINE_CALIBRATION.directionInferenceMargin
    );

  let winProbability = logistic(z);
  winProbability = clamp(winProbability, 0.35, 0.8);
  
  // Convert to percentage
  const winProbabilityPercent = Math.round(winProbability * 100);
  
  const confluenceScore = tradeDirection !== 'neutral' && activeWeightSum > 0
    ? Math.round((alignedWeightSum / activeWeightSum) * 100)
    : 0;

  const alignedCount = tradeDirection === 'neutral'
    ? Math.max(bullishCount, bearishCount)
    : components.filter((component) => (
      component.triggered && signForDirection(component.direction, tradeDirection) === 1
    )).length;
  
  // Determine confidence label
  let confidenceLabel: string;
  if (dominantDirection === 'neutral') confidenceLabel = 'No Clear Signal';
  else if (winProbabilityPercent >= 72) confidenceLabel = 'High Conviction';
  else if (winProbabilityPercent >= 65) confidenceLabel = 'Strong';
  else if (winProbabilityPercent >= 55) confidenceLabel = 'Moderate';
  else if (winProbabilityPercent >= 45) confidenceLabel = 'Weak';
  else confidenceLabel = dominantDirection === 'bearish' ? 'Bearish Lean' : 'Bullish Lean';
  
  const minimumEdgeProbability = breakevenProbability(rewardRiskRatio);
  const allowKelly = alignedCount >= PROBABILITY_ENGINE_CALIBRATION.minKellySignals
    && winProbability >= PROBABILITY_ENGINE_CALIBRATION.minKellyConviction
    && winProbability > minimumEdgeProbability + PROBABILITY_ENGINE_CALIBRATION.minEdgeBuffer;

  const kellySizePercent = allowKelly
    ? Math.min(
      PROBABILITY_ENGINE_CALIBRATION.maxOptionsKellyPercent,
      kellyPositionSize(winProbability, rewardRiskRatio) * 100
    )
    : 0;
  
  return {
    winProbability: winProbabilityPercent,
    confidenceLabel,
    signalCount: alignedCount,
    totalSignals,
    confluenceScore,
    direction: dominantDirection,
    kellySizePercent: Math.round(kellySizePercent * 10) / 10,
    rMultiple: rewardRiskRatio,
    components,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DISPLAY HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get color for probability display
 */
export function getProbabilityColor(probability: number): string {
  if (probability >= 70) return '#10B981'; // Green
  if (probability >= 60) return '#22C55E'; // Light green
  if (probability >= 50) return '#F59E0B'; // Yellow/orange
  if (probability >= 40) return '#F97316'; // Orange
  return '#EF4444'; // Red
}

/**
 * Get confidence badge style
 */
export function getConfidenceBadgeStyle(label: string): { bg: string; text: string; border: string } {
  switch (label) {
    case 'High Conviction':
      return { bg: 'rgba(16,185,129,0.2)', text: '#10B981', border: 'rgba(16,185,129,0.5)' };
    case 'Strong':
      return { bg: 'rgba(34,197,94,0.2)', text: '#22C55E', border: 'rgba(34,197,94,0.5)' };
    case 'Moderate':
      return { bg: 'rgba(245,158,11,0.2)', text: '#F59E0B', border: 'rgba(245,158,11,0.5)' };
    case 'Weak':
      return { bg: 'rgba(249,115,22,0.2)', text: '#F97316', border: 'rgba(249,115,22,0.5)' };
    default:
      return { bg: 'rgba(239,68,68,0.2)', text: '#EF4444', border: 'rgba(239,68,68,0.5)' };
  }
}

/**
 * Format Kelly size for display
 */
export function formatKellySize(kellyPercent: number): string {
  if (kellyPercent <= 0) return 'No Position';
  if (kellyPercent < 5) return `${kellyPercent.toFixed(1)}% (Small)`;
  if (kellyPercent < 15) return `${kellyPercent.toFixed(1)}% (Standard)`;
  if (kellyPercent < 20) return `${kellyPercent.toFixed(1)}% (Aggressive)`;
  return `${kellyPercent.toFixed(1)}% (Max)`;
}
