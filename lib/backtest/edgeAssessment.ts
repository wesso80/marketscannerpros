/**
 * One rule for "is this backtest edge invalidated / validated / mixed", shared by the
 * validation badge (validationPayload.ts) and the diagnostics panel (diagnostics.ts).
 *
 * Before, the two disagreed: the badge invalidated any run with a win rate under 40%
 * (even with a positive return and a profit factor above 1), while diagnostics only
 * invalidated when return < 0% and profit factor < 1. A run could show "Invalidated"
 * next to "70/100 healthy".
 *
 * Now:
 *  - invalidated: return below 0% AND profit factor below 1 (money was lost and losses
 *    outweighed wins). A low win rate on its own is only a flag.
 *  - validated: positive return, profit factor score >= 1.2, and no flags.
 *  - mixed: everything else, with the flags that held it back.
 * Profit factor uses the shared scoring (profitFactorScore.ts): a run with winners and
 * no losing trades scores at the top of the scale, not 0.
 */
import {
  MIN_TRADES_FOR_EXECUTE,
  scoreProfitFactor,
  type ProfitFactorInput,
} from '@/lib/backtest/profitFactorScore';

/** Win rate under this is flagged (the threshold diagnostics already used for low_win_rate). */
export const LOW_WIN_RATE_PCT = 45;
/** Profit factor score needed for "validated". */
export const VALIDATED_MIN_PROFIT_FACTOR = 1.2;

export type EdgeFlag =
  | 'no_trades'
  | 'low_sample_size'
  | 'low_win_rate'
  | 'negative_return'
  | 'no_positive_return'
  | 'weak_profit_factor';

export type EdgeStatus = 'validated' | 'mixed' | 'invalidated';

export interface EdgeAssessmentInput extends ProfitFactorInput {
  winRate: number;
  totalReturn: number;
}

export interface EdgeAssessment {
  status: EdgeStatus;
  flags: EdgeFlag[];
  profitFactorScore: number;
}

export const EDGE_INVALIDATION_RULE =
  'Invalidated when return < 0% and profit factor < 1.00 (a low win rate alone is a flag, not invalidation)';

export function assessBacktestEdge(r: EdgeAssessmentInput): EdgeAssessment {
  const profitFactorScore = scoreProfitFactor(r);
  const flags: EdgeFlag[] = [];

  if (!(r.totalTrades > 0)) {
    flags.push('no_trades');
    return { status: 'mixed', flags, profitFactorScore };
  }

  if (r.totalTrades < MIN_TRADES_FOR_EXECUTE) flags.push('low_sample_size');
  if (r.winRate < LOW_WIN_RATE_PCT) flags.push('low_win_rate');
  if (r.totalReturn < 0) flags.push('negative_return');
  else if (r.totalReturn === 0) flags.push('no_positive_return');
  if (profitFactorScore < VALIDATED_MIN_PROFIT_FACTOR) flags.push('weak_profit_factor');

  const invalidated = r.totalReturn < 0 && profitFactorScore < 1;
  const status: EdgeStatus = invalidated ? 'invalidated' : flags.length === 0 ? 'validated' : 'mixed';
  return { status, flags, profitFactorScore };
}

export function describeEdgeFlag(flag: EdgeFlag, r: EdgeAssessmentInput): string {
  switch (flag) {
    case 'no_trades': return 'no completed trades';
    case 'low_sample_size': return `small sample (${r.totalTrades} trade${r.totalTrades === 1 ? '' : 's'}, fewer than ${MIN_TRADES_FOR_EXECUTE})`;
    case 'low_win_rate': return `low win rate (${r.winRate.toFixed(1)}%, under ${LOW_WIN_RATE_PCT}%)`;
    case 'negative_return': return 'negative return';
    case 'no_positive_return': return 'no positive return';
    case 'weak_profit_factor': return `profit factor under ${VALIDATED_MIN_PROFIT_FACTOR.toFixed(2)}`;
  }
}
