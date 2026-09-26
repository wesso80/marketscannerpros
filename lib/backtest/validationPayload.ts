import type { BacktestValidation } from '@/lib/backtest/engine';
import { assessBacktestEdge, describeEdgeFlag } from '@/lib/backtest/edgeAssessment';
import { formatProfitFactorValue } from '@/lib/backtest/profitFactorScore';
import { getAlternativeBacktestStrategies } from '@/lib/strategies/registry';

export function buildValidationPayload(
  strategyId: string,
  strategyDirection: 'bullish' | 'bearish' | 'both',
  result: {
    winRate: number;
    profitFactor: number | null;
    totalReturn: number;
    profitFactorLabel?: string;
    totalTrades: number;
    winningTrades?: number;
    losingTrades?: number;
  },
): BacktestValidation {
  // Same rule as the diagnostics panel (lib/backtest/edgeAssessment.ts): invalidated only
  // when return < 0% and profit factor < 1; a low win rate is a flag, not invalidation.
  const input = result;
  const assessment = assessBacktestEdge(input);
  const status: BacktestValidation['status'] = assessment.status;
  const profitFactorText = result.profitFactor != null
    ? result.profitFactor.toFixed(2)
    : assessment.profitFactorScore > 0
      ? formatProfitFactorValue(input)
      : result.profitFactorLabel ?? 'no losing trades in sample';

  const metrics = `WR ${result.winRate.toFixed(1)}%, PF ${profitFactorText}, Return ${result.totalReturn.toFixed(2)}%.`;
  const flagText = assessment.flags.length > 0
    ? ` Flags: ${assessment.flags.map((flag) => describeEdgeFlag(flag, input)).join('; ')}.`
    : '';
  const reason = status === 'invalidated'
    ? `Invalidated: ${metrics}${flagText}`
    : status === 'validated'
      ? `Validated: ${metrics}`
      : `Mixed: ${metrics}${flagText}`;

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
