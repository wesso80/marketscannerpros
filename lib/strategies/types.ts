export const BACKTEST_TIMEFRAMES = ['1min', '5min', '15min', '30min', '60min', 'daily'] as const;

export type BacktestTimeframe = (typeof BACKTEST_TIMEFRAMES)[number];

export interface BacktestStrategyDefinition {
  id: string;
  label: string;
  timeframes: readonly BacktestTimeframe[];
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
