import type { BacktestValidation } from '@/lib/backtest/engine';
import { getAlternativeBacktestStrategies } from '@/lib/strategies/registry';

export function buildValidationPayload(
  strategyId: string,
  strategyDirection: 'bullish' | 'bearish' | 'both',
  result: { winRate: number; profitFactor: number; totalReturn: number },
): BacktestValidation {
  const invalidated = result.winRate < 40 || result.profitFactor < 1 || result.totalReturn <= 0;
  const validated = result.winRate >= 50 && result.profitFactor >= 1.2 && result.totalReturn > 0;

  const status: BacktestValidation['status'] = invalidated
    ? 'invalidated'
    : validated
      ? 'validated'
      : 'mixed';

  const reason = status === 'invalidated'
    ? `Invalidated: WR ${result.winRate.toFixed(1)}%, PF ${result.profitFactor.toFixed(2)}, Return ${result.totalReturn.toFixed(2)}%.`
    : status === 'validated'
      ? `Validated: WR ${result.winRate.toFixed(1)}%, PF ${result.profitFactor.toFixed(2)}, Return ${result.totalReturn.toFixed(2)}%.`
      : `Mixed: WR ${result.winRate.toFixed(1)}%, PF ${result.profitFactor.toFixed(2)}, Return ${result.totalReturn.toFixed(2)}%.`;

  let suggestedAlternatives: BacktestValidation['suggestedAlternatives'] | undefined;
  if (status === 'invalidated' && strategyDirection !== 'both') {
    const targetDirection = strategyDirection === 'bullish' ? 'bearish' : 'bullish';
    const alternatives = getAlternativeBacktestStrategies(strategyId, targetDirection);
    if (alternatives.length > 0) {
      suggestedAlternatives = alternatives.map((candidate) => ({
        strategyId: candidate.id,
        why: `${candidate.label} aligns with ${targetDirection} bias${candidate.patternType ? ` (${candidate.patternType.replace('_', ' ')})` : ''}.`,
      }));
    }
  }

  return {
    status,
    direction: strategyDirection,
    reason,
    suggestedAlternatives,
  };
}
