export interface ExecutionPlanInput {
  symbol: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  permission: 'ALLOW' | 'ALLOW_SMALL' | 'BLOCK';
  flowState: 'ACCUMULATION' | 'POSITIONING' | 'LAUNCH' | 'EXHAUSTION';
  stopStyle: string;
  finalSize: number;
  nextAbove?: number;
  nextBelow?: number;
}

export interface ExecutionPlanOutput {
  entryType: 'breakout' | 'pullback' | 'reclaim' | 'sweep' | 'none';
  triggers: string[];
  stopRule: string;
  targets: string[];
  management: string[];
  size: number;
}

export function buildExecutionPlan(input: ExecutionPlanInput): ExecutionPlanOutput {
  if (input.permission === 'BLOCK') {
    return {
      entryType: 'none',
      triggers: ['No-trade: permission blocked by governance'],
      stopRule: 'No active position',
      targets: [],
      management: ['Wait for governance reset'],
      size: 0,
    };
  }

  const entryType: ExecutionPlanOutput['entryType'] = input.flowState === 'LAUNCH'
    ? 'breakout'
    : input.flowState === 'POSITIONING'
      ? 'pullback'
      : input.flowState === 'ACCUMULATION'
        ? 'sweep'
        : 'reclaim';

  const directionLabel = input.bias === 'bearish' ? 'short' : 'long';
  const targets = [
    input.nextAbove && input.bias !== 'bearish' ? `Liquidity target ${input.nextAbove.toFixed(2)}` : 'Target 1 at 2R',
    input.nextBelow && input.bias === 'bearish' ? `Liquidity target ${input.nextBelow.toFixed(2)}` : 'Target 2 at 3R',
  ];

  return {
    entryType,
    triggers: [
      `${entryType.toUpperCase()} trigger confirmed for ${directionLabel} bias`,
      'Require close-through confirmation before entry',
    ],
    stopRule: `Use ${input.stopStyle.replace(/_/g, ' ')} stop logic`,
    targets,
    management: ['Move stop to BE at +1R', 'Take partial at +2R', 'Trail runner by structure/ATR'],
    size: Number(input.finalSize.toFixed(2)),
  };
}
