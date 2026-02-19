import type { BacktestEngineResult, BacktestTrade } from '@/lib/backtest/engine';

export type StrategyDirection = 'bullish' | 'bearish' | 'both';

export interface BacktestAdjustmentSuggestion {
  key: string;
  title: string;
  reason: string;
}

export interface BacktestDiagnostics {
  score: number;
  verdict: 'healthy' | 'watch' | 'invalidated';
  failureTags: string[];
  adjustments: BacktestAdjustmentSuggestion[];
  summary: string;
  invalidation: {
    status: 'valid' | 'watch' | 'invalidated';
    rule: string;
    reason: string;
  };
}

function uniquePush(target: string[], value: string) {
  if (!target.includes(value)) {
    target.push(value);
  }
}

export function inferStrategyDirection(strategyId: string, trades: BacktestTrade[]): StrategyDirection {
  const hasLong = trades.some((trade) => trade.side === 'LONG');
  const hasShort = trades.some((trade) => trade.side === 'SHORT');
  if (hasLong && hasShort) return 'both';
  if (hasShort && !hasLong) return 'bearish';

  const lowered = strategyId.toLowerCase();
  if (/(bear|short|breakdown|downtrend)/.test(lowered)) return 'bearish';
  if (/(both|bi[-_]?direction|two[-_]?way)/.test(lowered)) return 'both';
  return 'bullish';
}

export function buildBacktestDiagnostics(
  result: BacktestEngineResult,
  strategyDirection: StrategyDirection,
  timeframe: string,
  bars: number,
): BacktestDiagnostics {
  const failureTags: string[] = [];
  const adjustments: BacktestAdjustmentSuggestion[] = [];

  if (result.totalTrades < 8) {
    uniquePush(failureTags, 'low_sample_size');
    adjustments.push({
      key: 'expand_sample',
      title: 'Expand sample window',
      reason: `Only ${result.totalTrades} trades were generated. Extend the date range so the setup is tested across more conditions.`,
    });
  }

  if (result.winRate < 45) {
    uniquePush(failureTags, 'low_win_rate');
    adjustments.push({
      key: 'tighten_entries',
      title: 'Tighten entry quality',
      reason: `Win rate is ${result.winRate.toFixed(1)}%. Require stronger confirmation before entry (higher confluence / stricter trigger).`,
    });
  }

  if (result.profitFactor < 1) {
    uniquePush(failureTags, 'negative_expectancy');
    adjustments.push({
      key: 'raise_expectancy',
      title: 'Improve expectancy',
      reason: `Profit factor is ${result.profitFactor.toFixed(2)}. Focus on filtering weaker setups or reducing churn exits.`,
    });
  }

  if (result.maxDrawdown > 20) {
    uniquePush(failureTags, 'high_drawdown');
    adjustments.push({
      key: 'reduce_drawdown',
      title: 'Reduce drawdown',
      reason: `Max drawdown is ${result.maxDrawdown.toFixed(1)}%. Tighten invalidation and reduce risk per trade.`,
    });
  }

  if (Math.abs(result.avgLoss) > Math.abs(result.avgWin) && result.avgWin !== 0) {
    uniquePush(failureTags, 'poor_risk_reward');
    adjustments.push({
      key: 'improve_rr',
      title: 'Improve risk/reward',
      reason: `Average loss (${result.avgLoss.toFixed(2)}) is larger than average win (${result.avgWin.toFixed(2)}). Shift targets/stops to lift reward-to-risk.`,
    });
  }

  if (bars < 120) {
    uniquePush(failureTags, 'limited_coverage');
    adjustments.push({
      key: 'increase_coverage',
      title: 'Increase historical coverage',
      reason: `Only ${bars} bars were available in the applied range. Expand date coverage for stronger confidence.`,
    });
  }

  const invalidationRule = strategyDirection === 'both'
    ? 'Invalidated when return < 0% and profit factor < 1.00'
    : `Invalidated when ${strategyDirection} edge has return < 0% or profit factor < 1.00`;

  const invalidationStatus: 'valid' | 'watch' | 'invalidated' =
    result.totalReturn < 0 && result.profitFactor < 1
      ? 'invalidated'
      : result.totalReturn < 0 || result.profitFactor < 1 || result.winRate < 45
      ? 'watch'
      : 'valid';

  const invalidationReason = invalidationStatus === 'invalidated'
    ? `Setup is currently invalidated (${result.totalReturn.toFixed(2)}% return, PF ${result.profitFactor.toFixed(2)}).`
    : invalidationStatus === 'watch'
    ? `Setup is fragile (${result.totalReturn.toFixed(2)}% return, PF ${result.profitFactor.toFixed(2)}, WR ${result.winRate.toFixed(1)}%).`
    : `Setup remains valid (${result.totalReturn.toFixed(2)}% return, PF ${result.profitFactor.toFixed(2)}).`;

  const scoreRaw =
    (result.profitFactor * 35) +
    (result.winRate * 0.35) +
    (Math.max(result.totalReturn, -40) * 0.4) -
    (result.maxDrawdown * 1.1);

  const score = Math.max(0, Math.min(100, Math.round(scoreRaw)));
  const verdict: 'healthy' | 'watch' | 'invalidated' =
    invalidationStatus === 'invalidated' ? 'invalidated' : score >= 60 ? 'healthy' : 'watch';

  const summary = verdict === 'healthy'
    ? `Edge is stable on ${timeframe} with score ${score}/100. Maintain current rule set and monitor drift.`
    : verdict === 'invalidated'
    ? `Edge is invalidated on ${timeframe}. Prioritize the top adjustments before deploying.`
    : `Edge is borderline on ${timeframe} with score ${score}/100. Tighten rules before execution.`;

  return {
    score,
    verdict,
    failureTags,
    adjustments: adjustments.slice(0, 4),
    summary,
    invalidation: {
      status: invalidationStatus,
      rule: invalidationRule,
      reason: invalidationReason,
    },
  };
}