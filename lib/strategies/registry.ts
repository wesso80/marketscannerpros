import {
  BACKTEST_TIMEFRAMES,
  type BacktestStrategyCategory,
  type BacktestStrategyDirection,
  type BacktestStrategyDefinition,
  type BacktestStrategyPatternType,
  type BacktestTimeframe,
  type BacktestTimeframeGroup,
} from './types';

const ALL_TIMEFRAMES = [...BACKTEST_TIMEFRAMES] as const;

export const DEFAULT_BACKTEST_STRATEGY = 'msp_day_trader';

const RAW_BACKTEST_STRATEGY_CATEGORIES: readonly BacktestStrategyCategory[] = [
  {
    id: 'msp_elite',
    label: '🔥 MSP Elite Strategies',
    strategies: [
      { id: 'brain_signal_replay', label: '🧠 Brain Signal Replay (Decision Packets)', timeframes: ALL_TIMEFRAMES },
      { id: 'options_signal_replay', label: '🎯 Options Confluence Replay', timeframes: ALL_TIMEFRAMES },
      { id: 'time_scanner_signal_replay', label: '⏱️ Time Scanner Replay', timeframes: ALL_TIMEFRAMES },
      { id: 'msp_day_trader', label: 'MSP Day Trader AIO (Score 5+)', timeframes: ALL_TIMEFRAMES },
      { id: 'msp_day_trader_strict', label: 'MSP Day Trader Strict (Score 6+)', timeframes: ALL_TIMEFRAMES },
      { id: 'msp_day_trader_v3', label: '📈 Day Trader v3 Optimized (More Trades)', timeframes: ALL_TIMEFRAMES },
      { id: 'msp_day_trader_v3_aggressive', label: '🚀 Day Trader v3 Aggressive (Max Trades)', timeframes: ALL_TIMEFRAMES },
      { id: 'msp_multi_tf', label: 'MSP Multi-TF Dashboard (Bias 6+)', timeframes: ALL_TIMEFRAMES },
      { id: 'msp_multi_tf_strict', label: 'MSP Multi-TF Strict (Bias 8+)', timeframes: ALL_TIMEFRAMES },
      { id: 'msp_trend_pullback', label: 'MSP Trend Pullback', timeframes: ALL_TIMEFRAMES },
      { id: 'msp_liquidity_reversal', label: 'MSP Liquidity Reversal', timeframes: ALL_TIMEFRAMES },
    ],
  },
  {
    id: 'intraday_scalping',
    label: '⚡ Intraday Scalping',
    strategies: [
      { id: 'scalp_vwap_bounce', label: 'VWAP Bounce Scalper', timeframes: ALL_TIMEFRAMES },
      { id: 'scalp_orb_15', label: 'Opening Range Breakout (15m)', timeframes: ALL_TIMEFRAMES },
      { id: 'scalp_momentum_burst', label: 'Momentum Burst', timeframes: ALL_TIMEFRAMES },
      { id: 'scalp_mean_revert', label: 'Mean Reversion Scalp', timeframes: ALL_TIMEFRAMES },
    ],
  },
  {
    id: 'swing',
    label: '🎯 Swing Trading',
    strategies: [
      { id: 'swing_pullback_buy', label: 'Pullback Buy Setup', timeframes: ALL_TIMEFRAMES },
      { id: 'swing_breakout', label: 'Breakout Swing', timeframes: ALL_TIMEFRAMES },
      { id: 'swing_earnings_drift', label: 'Post-Earnings Drift', timeframes: ALL_TIMEFRAMES },
    ],
  },
  {
    id: 'moving_averages',
    label: 'Moving Averages',
    strategies: [
      { id: 'ema_crossover', label: 'EMA Crossover (9/21)', timeframes: ALL_TIMEFRAMES },
      { id: 'sma_crossover', label: 'SMA Crossover (50/200)', timeframes: ALL_TIMEFRAMES },
      { id: 'triple_ema', label: 'Triple EMA Ribbon', timeframes: ALL_TIMEFRAMES },
    ],
  },
  {
    id: 'momentum',
    label: 'Momentum',
    strategies: [
      { id: 'rsi_reversal', label: 'RSI Mean Reversion', timeframes: ALL_TIMEFRAMES },
      { id: 'rsi_trend', label: 'RSI Trend Following', timeframes: ALL_TIMEFRAMES },
      { id: 'rsi_divergence', label: 'RSI Divergence', timeframes: ALL_TIMEFRAMES },
      { id: 'macd_momentum', label: 'MACD Momentum', timeframes: ALL_TIMEFRAMES },
      { id: 'macd_crossover', label: 'MACD Signal Crossover', timeframes: ALL_TIMEFRAMES },
      { id: 'macd_histogram_reversal', label: 'MACD Histogram Reversal', timeframes: ALL_TIMEFRAMES },
    ],
  },
  {
    id: 'volatility',
    label: 'Volatility',
    strategies: [
      { id: 'bbands_squeeze', label: 'Bollinger Bands Squeeze', timeframes: ALL_TIMEFRAMES },
      { id: 'bbands_breakout', label: 'Bollinger Bands Breakout', timeframes: ALL_TIMEFRAMES },
      { id: 'keltner_atr_breakout', label: 'Keltner ATR Breakout', timeframes: ALL_TIMEFRAMES },
    ],
  },
  {
    id: 'volume_analysis',
    label: 'Volume Analysis',
    strategies: [
      { id: 'volume_breakout', label: 'Volume Breakout', timeframes: ALL_TIMEFRAMES },
      { id: 'obv_volume', label: 'OBV Volume Confirmation', timeframes: ALL_TIMEFRAMES },
      { id: 'volume_climax_reversal', label: 'Volume Climax Reversal', timeframes: ALL_TIMEFRAMES },
    ],
  },
  {
    id: 'trend_filters',
    label: 'Trend Filters',
    strategies: [
      { id: 'adx_trend', label: 'ADX Trend Filter', timeframes: ALL_TIMEFRAMES },
      { id: 'supertrend', label: 'SuperTrend Strategy', timeframes: ALL_TIMEFRAMES },
      { id: 'ichimoku_cloud', label: 'Ichimoku Cloud', timeframes: ALL_TIMEFRAMES },
    ],
  },
  {
    id: 'mean_reversion',
    label: 'Mean Reversion',
    strategies: [
      { id: 'stoch_oversold', label: 'Stochastic Oversold', timeframes: ALL_TIMEFRAMES },
      { id: 'cci_reversal', label: 'CCI Reversal', timeframes: ALL_TIMEFRAMES },
      { id: 'williams_r', label: 'Williams %R Extremes', timeframes: ALL_TIMEFRAMES },
    ],
  },
  {
    id: 'multi_indicator',
    label: 'Multi-Indicator Confluence',
    strategies: [
      { id: 'multi_ema_rsi', label: 'Multi: EMA + RSI', timeframes: ALL_TIMEFRAMES },
      { id: 'multi_macd_adx', label: 'Multi: MACD + ADX', timeframes: ALL_TIMEFRAMES },
      { id: 'multi_bb_stoch', label: 'Multi: BB + Stochastic', timeframes: ALL_TIMEFRAMES },
      { id: 'multi_confluence_5', label: '5-Indicator Confluence', timeframes: ALL_TIMEFRAMES },
    ],
  },
] as const;

function inferDirectionFromStrategyId(strategyId: string): BacktestStrategyDirection {
  const lowered = strategyId.toLowerCase();
  if (/(bear|short|breakdown|downtrend)/.test(lowered)) return 'bearish';
  if (/(both|bi[-_]?direction|two[-_]?way)/.test(lowered)) return 'both';
  return 'bullish';
}

function inferPatternType(categoryId: string, strategyId: string): BacktestStrategyPatternType | undefined {
  const lowered = strategyId.toLowerCase();
  if (/breakdown|downtrend|short/.test(lowered)) return 'breakdown';
  if (/breakout|orb|momentum/.test(lowered)) return 'breakout';
  if (/pullback/.test(lowered)) return 'trend_pullback';
  if (/revert|reversal|mean|williams|stoch|cci|rsi/.test(lowered)) return 'mean_reversion';

  if (categoryId === 'mean_reversion') return 'mean_reversion';
  if (categoryId === 'swing') return 'trend_pullback';
  if (categoryId === 'volatility' || categoryId === 'volume_analysis') return 'breakout';
  return undefined;
}

function normalizeStrategy(
  categoryId: string,
  strategy: BacktestStrategyDefinition,
): BacktestStrategyDefinition {
  return {
    ...strategy,
    direction: strategy.direction ?? inferDirectionFromStrategyId(strategy.id),
    patternType: strategy.patternType ?? inferPatternType(categoryId, strategy.id),
  };
}

export const BACKTEST_STRATEGY_CATEGORIES: readonly BacktestStrategyCategory[] = RAW_BACKTEST_STRATEGY_CATEGORIES.map((category) => ({
  ...category,
  strategies: category.strategies.map((strategy) => normalizeStrategy(category.id, strategy)),
}));

const strategyMap = new Map<string, BacktestStrategyDefinition>();
for (const category of BACKTEST_STRATEGY_CATEGORIES) {
  for (const strategy of category.strategies) {
    strategyMap.set(strategy.id, strategy);
  }
}

export const BACKTEST_STRATEGY_IDS = Array.from(strategyMap.keys());

export const BACKTEST_TIMEFRAME_GROUPS: readonly BacktestTimeframeGroup[] = [
  {
    id: 'scalping',
    label: '⚡ Scalping',
    timeframes: ['1min', '5min'],
  },
  {
    id: 'intraday',
    label: '📈 Intraday',
    timeframes: ['15min', '30min', '60min'],
  },
  {
    id: 'swing',
    label: '📊 Swing',
    timeframes: ['daily'],
  },
] as const;

export function getBacktestStrategy(id: string): BacktestStrategyDefinition | undefined {
  return strategyMap.get(id);
}

export function getAlternativeBacktestStrategies(
  strategyId: string,
  targetDirection: BacktestStrategyDirection,
): BacktestStrategyDefinition[] {
  const current = strategyMap.get(strategyId);
  if (!current) return [];

  const candidates = Array.from(strategyMap.values())
    .filter((strategy) => strategy.id !== strategyId)
    .filter((strategy) => strategy.direction === targetDirection);

  const samePattern = current.patternType
    ? candidates.filter((strategy) => strategy.patternType === current.patternType)
    : [];

  const pool = samePattern.length > 0 ? samePattern : candidates;
  return pool.slice(0, 3);
}

export function isBacktestStrategy(id: string): boolean {
  return strategyMap.has(id);
}

export function getBacktestStrategyLabel(id: string): string {
  return strategyMap.get(id)?.label ?? id;
}

export function isBacktestTimeframeSupported(strategyId: string, timeframe: BacktestTimeframe): boolean {
  const strategy = strategyMap.get(strategyId);
  if (!strategy) return false;
  return strategy.timeframes.includes(timeframe);
}
