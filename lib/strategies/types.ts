export const BACKTEST_TIMEFRAMES = ['1min', '5min', '15min', '30min', '60min', 'daily'] as const;

export type BacktestTimeframe = (typeof BACKTEST_TIMEFRAMES)[number];

export type BacktestStrategyDirection = 'bullish' | 'bearish' | 'both';
export type BacktestStrategyPatternType = 'breakout' | 'breakdown' | 'mean_reversion' | 'trend_pullback';

export interface BacktestStrategyDefinition {
  id: string;
  label: string;
  timeframes: readonly BacktestTimeframe[];
  direction?: BacktestStrategyDirection;
  patternType?: BacktestStrategyPatternType;
}

export interface BacktestStrategyCategory {
  id: string;
  label: string;
  strategies: readonly BacktestStrategyDefinition[];
}

export interface BacktestTimeframeGroup {
  id: string;
  label: string;
  timeframes: readonly BacktestTimeframe[];
}
