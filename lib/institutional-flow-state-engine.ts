export type InstitutionalFlowState = 'ACCUMULATION' | 'POSITIONING' | 'LAUNCH' | 'EXHAUSTION';
export type InstitutionalBias = 'bullish' | 'bearish' | 'neutral';

export interface InstitutionalFlowStateInput {
  symbol: string;
  marketType: 'equity' | 'crypto';
  bias: InstitutionalBias;
  probabilities: {
    trend: number;        // 0-100
    pin: number;          // 0-100
    expansion: number;    // 0-100
  };
  probabilityShift: {
    deltaTrend?: number;      // -100..100
    deltaExpansion?: number;  // -100..100
  };
  structure: {
    trendStructure: number; // 0-100
    vwapSlope: number;      // -100..100 (flat ~0)
    breakoutPressure: number; // 0-100
    momentumDivergence?: boolean;
  };
  liquidity: {
    nextAbove?: number;
    nextBelow?: number;
    currentPrice: number;
    targetHit?: boolean;
  };
  volatility: {
    compressionScore: number;  // 0-100
    atrExpansionRate: number;  // 0-100
  };
  flow: {
    flowImbalanceShort: number; // -100..100
    flowImbalanceLong: number;  // -100..100
  };
  dataHealth: {
    freshnessScore: number;   // 0-100
  };
}

export interface InstitutionalFlowStateOutput {
  state: InstitutionalFlowState;
  confidence: number;
  bias: InstitutionalBias;
  rationale: string[];
  suggestedPlaybook: string;
  nextLiquidity: { above?: number; below?: number };
  riskMode: 'low' | 'medium' | 'high';
  stateProbabilities: {
    accumulation: number;
    positioning: number;
    launch: number;
    exhaustion: number;
  };
}

const lastStateBySymbol = new Map<string, { state: InstitutionalFlowState; confidence: number }>();

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function normalizeMinusOneToOne(value: number, scale = 100): number {
  return Math.max(-1, Math.min(1, value / scale));
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function softmax(values: number[]): number[] {
  const max = Math.max(...values);
  const exp = values.map((value) => Math.exp(value - max));
  const sum = exp.reduce((acc, value) => acc + value, 0);
  return exp.map((value) => value / Math.max(sum, 1e-9));
}

function riskModeFromState(state: InstitutionalFlowState, confidence: number, dataScore: number): 'low' | 'medium' | 'high' {
  if (dataScore < 55) return 'high';
  if (state === 'LAUNCH' && confidence >= 70) return 'medium';
  if (state === 'ACCUMULATION' && confidence >= 65) return 'low';
  if (state === 'EXHAUSTION') return 'high';
  return 'medium';
}

function playbookForState(state: InstitutionalFlowState): string {
  switch (state) {
    case 'ACCUMULATION':
      return 'Range mean-reversion only; avoid breakout chasing';
    case 'POSITIONING':
      return 'Breakout-prep; first pullback entries only with tight risk';
    case 'LAUNCH':
      return 'Trend continuation + retest adds; trail stops into liquidity';
    case 'EXHAUSTION':
      return 'Reduce size, take profits into liquidity, wait for reversal confirmation';
    default:
      return 'Wait for clearer phase structure';
  }
}

export function computeInstitutionalFlowState(input: InstitutionalFlowStateInput): InstitutionalFlowStateOutput {
  const marketWeightPin = input.marketType === 'crypto' ? 0.18 : 0.35;
  const marketWeightVol = input.marketType === 'crypto' ? 0.32 : 0.20;

  const pTrend = clamp(input.probabilities.trend);
  const pPin = clamp(input.probabilities.pin);
  const pExpansion = clamp(input.probabilities.expansion);

  const compression = clamp(input.volatility.compressionScore) / 100;
  const atrExpand = clamp(input.volatility.atrExpansionRate) / 100;
  const trendStructure = clamp(input.structure.trendStructure) / 100;
  const breakoutPressure = clamp(input.structure.breakoutPressure) / 100;

  const vwapFlat = 1 - Math.min(1, Math.abs(input.structure.vwapSlope) / 45);
  const vwapSlopeStrength = Math.min(1, Math.abs(input.structure.vwapSlope) / 45);

  const flowVelocityRaw = normalizeMinusOneToOne(input.flow.flowImbalanceShort - input.flow.flowImbalanceLong, 65);
  const flowVelocityUp = sigmoid(flowVelocityRaw * 3);
  const flowVelocityDown = 1 - flowVelocityUp;

  const dPExpansion = Math.max(-1, Math.min(1, (input.probabilityShift.deltaExpansion ?? 0) / 30));
  const dPTrendDown = Math.max(0, -(input.probabilityShift.deltaTrend ?? 0) / 30);

  const liquidityTargetHit = !!input.liquidity.targetHit;
  const momentumDivergence = !!input.structure.momentumDivergence;

  const accScore =
    ((pPin / 100) * marketWeightPin) +
    (compression * 0.35) +
    (vwapFlat * 0.15) +
    ((1 - Math.abs(flowVelocityRaw)) * 0.15);

  const posScore =
    (Math.max(0, dPExpansion) * 0.35) +
    (flowVelocityUp * 0.30) +
    (compression * 0.20) +
    (trendStructure * 0.15);

  const launchScore =
    (atrExpand * 0.35) +
    ((pTrend / 100) * 0.30) +
    (vwapSlopeStrength * 0.20) +
    (breakoutPressure * 0.15);

  const exhScore =
    ((liquidityTargetHit ? 1 : 0) * 0.30) +
    (dPTrendDown * 0.25) +
    (flowVelocityDown * 0.25) +
    ((momentumDivergence ? 1 : 0) * 0.20);

  const [accP, posP, launchP, exhP] = softmax([accScore, posScore, launchScore, exhScore]).map((v) => Math.round(v * 100));

  const states: InstitutionalFlowState[] = ['ACCUMULATION', 'POSITIONING', 'LAUNCH', 'EXHAUSTION'];
  const probs = [accP, posP, launchP, exhP];
  const maxIdx = probs.indexOf(Math.max(...probs));
  let state = states[maxIdx];
  let confidence = probs[maxIdx];

  const second = [...probs].sort((a, b) => b - a)[1] ?? 0;
  const margin = confidence - second;
  const hysteresisMargin = 6;
  const persistThreshold = 55;

  const key = `${input.marketType}:${input.symbol.toUpperCase()}`;
  const prev = lastStateBySymbol.get(key);
  if (prev && prev.state !== state && margin < hysteresisMargin && confidence < persistThreshold) {
    state = prev.state;
    confidence = Math.max(prev.confidence - 2, confidence);
  }

  lastStateBySymbol.set(key, { state, confidence });

  const rationale: string[] = [];
  if (state === 'ACCUMULATION') {
    rationale.push('Pin/Reversion probability dominating with compressed volatility');
    rationale.push('VWAP behavior remains rotational rather than directional');
  }
  if (state === 'POSITIONING') {
    rationale.push('Expansion probability accelerating while structure aligns');
    rationale.push('Flow velocity rising into compression backdrop');
  }
  if (state === 'LAUNCH') {
    rationale.push('ATR expansion + trend probability indicate regime ignition');
    rationale.push('VWAP slope and breakout pressure support continuation');
  }
  if (state === 'EXHAUSTION') {
    rationale.push('Trend edge fading as flow velocity stalls/flips');
    rationale.push('Liquidity objective hit or momentum divergence present');
  }

  if (input.dataHealth.freshnessScore < 60) {
    rationale.push('Data freshness reduced — confidence gated');
    confidence = Math.round(confidence * 0.9);
  }

  const riskMode = riskModeFromState(state, confidence, input.dataHealth.freshnessScore);

  return {
    state,
    confidence: clamp(confidence),
    bias: input.bias,
    rationale,
    suggestedPlaybook: playbookForState(state),
    nextLiquidity: {
      above: input.liquidity.nextAbove,
      below: input.liquidity.nextBelow,
    },
    riskMode,
    stateProbabilities: {
      accumulation: accP,
      positioning: posP,
      launch: launchP,
      exhaustion: exhP,
    },
  };
}
