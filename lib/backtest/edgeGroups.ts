import { BACKTEST_STRATEGY_CATEGORIES } from '../strategies/registry';

export type EdgeGroupId =
  | 'msp_aio_systems'
  | 'scalping_edge'
  | 'trend_following'
  | 'mean_reversion'
  | 'breakdown_play_bears'
  | 'breakout'
  | 'liquidity_play';

export interface StrategyEdgeGroup {
  id: EdgeGroupId;
  label: string;
  categoryIds: (typeof BACKTEST_STRATEGY_CATEGORIES)[number]['id'][];
}

export const STRATEGY_EDGE_GROUPS: readonly StrategyEdgeGroup[] = [
  {
    id: 'msp_aio_systems',
    label: 'MSP AIO Systems',
    categoryIds: ['msp_elite'],
  },
  {
    id: 'scalping_edge',
    label: 'Scalping Edge',
    categoryIds: ['intraday_scalping'],
  },
  {
    id: 'trend_following',
    label: 'Trend Following',
    categoryIds: ['moving_averages', 'trend_filters'],
  },
  {
    id: 'mean_reversion',
    label: 'Mean Reversion',
    categoryIds: ['mean_reversion', 'momentum'],
  },
  {
    id: 'breakdown_play_bears',
    label: 'Breakdown Play (Bears)',
    categoryIds: ['msp_elite', 'trend_filters', 'momentum', 'volume_analysis'],
  },
  {
    id: 'breakout',
    label: 'Breakout',
    categoryIds: ['swing', 'volatility', 'volume_analysis'],
  },
  {
    id: 'liquidity_play',
    label: 'Liquidity Play',
    categoryIds: ['multi_indicator'],
  },
] as const;

export function findEdgeGroupForStrategy(
  strategyId: string,
  groups: readonly StrategyEdgeGroup[]
): StrategyEdgeGroup | null {
  return (
    groups.find((group) =>
      group.categoryIds.some((categoryId) =>
        BACKTEST_STRATEGY_CATEGORIES
          .find((category) => category.id === categoryId)
          ?.strategies.some((strategy) => strategy.id === strategyId)
      )
    ) || null
  );
}

export function edgeGroupContainsStrategy(
  edgeGroupId: EdgeGroupId,
  strategyId: string,
  groups: readonly StrategyEdgeGroup[]
): boolean {
  const group = groups.find((item) => item.id === edgeGroupId);
  if (!group) return false;

  return group.categoryIds.some((categoryId) =>
    BACKTEST_STRATEGY_CATEGORIES
      .find((category) => category.id === categoryId)
      ?.strategies.some((strategy) => strategy.id === strategyId)
  );
}

export function findEdgeGroupForStrategyWithPreference(
  strategyId: string,
  currentEdgeGroupId: EdgeGroupId | null,
  groups: readonly StrategyEdgeGroup[]
): StrategyEdgeGroup | null {
  if (currentEdgeGroupId && edgeGroupContainsStrategy(currentEdgeGroupId, strategyId, groups)) {
    return groups.find((group) => group.id === currentEdgeGroupId) || null;
  }

  return findEdgeGroupForStrategy(strategyId, groups);
}

export function getFirstStrategyForEdgeGroup(
  edgeGroupId: EdgeGroupId,
  groups: readonly (StrategyEdgeGroup & { categories: Array<(typeof BACKTEST_STRATEGY_CATEGORIES)[number]> })[]
): string | null {
  const group = groups.find((item) => item.id === edgeGroupId);
  if (!group) return null;

  const first = group.categories.flatMap((category) => category.strategies)[0];
  return first?.id || null;
}

export function getPreferredStrategyForEdgeGroup(
  edgeGroupId: EdgeGroupId,
  availableStrategyIds: readonly string[]
): string | null {
  const preferredByGroup: Record<EdgeGroupId, readonly string[]> = {
    msp_aio_systems: ['msp_day_trader'],
    scalping_edge: ['scalp_vwap_bounce'],
    trend_following: ['ema_crossover'],
    mean_reversion: ['rsi_reversal'],
    breakdown_play_bears: ['msp_day_trader_strict', 'supertrend', 'adx_trend', 'macd_momentum'],
    breakout: ['swing_breakout'],
    liquidity_play: ['multi_confluence_5', 'multi_macd_adx'],
  };

  const preferred = preferredByGroup[edgeGroupId];
  if (!preferred?.length) return availableStrategyIds[0] || null;

  for (const strategyId of preferred) {
    if (availableStrategyIds.includes(strategyId)) return strategyId;
  }

  return availableStrategyIds[0] || null;
}
