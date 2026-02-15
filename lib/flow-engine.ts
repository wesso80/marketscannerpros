export interface LeadershipItem {
  symbol: string;
  score: number;
}

export interface FlowEngineInput {
  symbol: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  flowScore: number;
  liquidityScore: number;
  pTrend: number;
  pPin: number;
  pExpansion: number;
}

export interface FlowEngineOutput {
  flowBias: 'bullish' | 'bearish' | 'neutral';
  leadershipList: LeadershipItem[];
  rotationMap: string[];
  flowStrength: number;
  score: number;
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function computeFlowEngine(input: FlowEngineInput): FlowEngineOutput {
  const flowStrength = clamp((input.flowScore * 0.6) + (input.liquidityScore * 0.4), 0, 100);
  const dominant = input.pTrend >= input.pPin && input.pTrend >= input.pExpansion
    ? 'trend'
    : input.pPin >= input.pTrend && input.pPin >= input.pExpansion
      ? 'pin'
      : 'expansion';

  const rotationMap = [
    dominant === 'trend' ? 'Leadership in directional names' : dominant === 'pin' ? 'Mean-reversion concentration' : 'Volatility-led rotation',
    input.bias === 'bullish' ? 'Risk-on sectors leading' : input.bias === 'bearish' ? 'Defensive rotation leading' : 'Balanced rotation map',
  ];

  return {
    flowBias: input.bias,
    leadershipList: [{ symbol: input.symbol.toUpperCase(), score: Number(flowStrength.toFixed(1)) }],
    rotationMap,
    flowStrength: Number(flowStrength.toFixed(1)),
    score: Number(flowStrength.toFixed(1)),
  };
}
