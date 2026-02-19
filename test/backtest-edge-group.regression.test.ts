import { describe, expect, it } from 'vitest';
import { BACKTEST_STRATEGY_CATEGORIES } from '../lib/strategies/registry';
import {
  findEdgeGroupForStrategy,
  getPreferredStrategyForEdgeGroup,
  STRATEGY_EDGE_GROUPS,
} from '../lib/backtest/edgeGroups';

function buildEdgeGroupCategories() {
  const categoryMap = new Map(BACKTEST_STRATEGY_CATEGORIES.map((category) => [category.id, category]));

  return STRATEGY_EDGE_GROUPS.map((group) => ({
    ...group,
    categories: group.categoryIds
      .map((id) => categoryMap.get(id))
      .filter((category): category is (typeof BACKTEST_STRATEGY_CATEGORIES)[number] => Boolean(category)),
  }));
}

describe('backtest edge-group regression', () => {
  it('does not snap back after manually changing edge group', () => {
    let strategy = 'msp_day_trader';

    const initialGroup = findEdgeGroupForStrategy(strategy, STRATEGY_EDGE_GROUPS);
    expect(initialGroup?.id).toBe('msp_aio_systems');

    const userSelectedEdgeGroup = 'trend_following';
    const edgeGroupCategories = buildEdgeGroupCategories();
    const activeGroup = edgeGroupCategories.find((group) => group.id === userSelectedEdgeGroup);
    expect(activeGroup).toBeTruthy();

    const strategyAllowed = activeGroup!.categories.some((category) =>
      category.strategies.some((item) => item.id === strategy)
    );

    if (!strategyAllowed) {
      strategy = activeGroup!.categories.flatMap((category) => category.strategies)[0].id;
    }

    expect(strategy).toBe('ema_crossover');

    const normalizedGroup = findEdgeGroupForStrategy(strategy, STRATEGY_EDGE_GROUPS);
    expect(normalizedGroup?.id).toBe('trend_following');
  });

  it('maps direct strategy changes to the expected edge group', () => {
    const group = findEdgeGroupForStrategy('multi_macd_adx', STRATEGY_EDGE_GROUPS);
    expect(group?.id).toBe('liquidity_play');
  });

  it('includes breakdown play edge for bears', () => {
    const edgeGroupCategories = buildEdgeGroupCategories();
    const bearsGroup = edgeGroupCategories.find((group) => group.id === 'breakdown_play_bears');

    expect(bearsGroup).toBeTruthy();

    const strategyIds = new Set(
      bearsGroup!.categories.flatMap((category) => category.strategies.map((strategy) => strategy.id))
    );

    expect(strategyIds.has('msp_day_trader')).toBe(true);
    expect(strategyIds.has('adx_trend')).toBe(true);

    const preferred = getPreferredStrategyForEdgeGroup('breakdown_play_bears', Array.from(strategyIds));
    expect(preferred).toBe('msp_day_trader_strict');
  });
});
