import { describe, expect, it } from 'vitest';
import {
  getAlternativeBacktestStrategies,
  getBacktestStrategy,
} from '../lib/strategies/registry';

describe('backtest validation metadata acceptance', () => {
  it('applies default direction and pattern metadata on registry strategies', () => {
    const breakout = getBacktestStrategy('swing_breakout');
    const meanReversion = getBacktestStrategy('rsi_reversal');

    expect(breakout?.direction).toBe('bullish');
    expect(breakout?.patternType).toBe('breakout');

    expect(meanReversion?.direction).toBe('bullish');
    expect(meanReversion?.patternType).toBe('mean_reversion');
  });

  it('returns direction-filtered alternatives for invalidation coaching', () => {
    const alternatives = getAlternativeBacktestStrategies('swing_breakout', 'bullish');

    expect(alternatives.length).toBeGreaterThan(0);
    for (const candidate of alternatives) {
      expect(candidate.id).not.toBe('swing_breakout');
      expect(candidate.direction).toBe('bullish');
    }
  });
});
