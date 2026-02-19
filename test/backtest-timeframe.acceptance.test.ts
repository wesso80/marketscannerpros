import { describe, expect, it } from 'vitest';
import {
  computeCoverage,
  isStrategyTimeframeCompatible,
  parseBacktestTimeframe,
} from '../lib/backtest/timeframe';

describe('backtest timeframe acceptance', () => {
  it('accepts free intraday timeframe formats', () => {
    const sixMinute = parseBacktestTimeframe('6m');
    const twelveMinute = parseBacktestTimeframe('12min');
    const twoHour = parseBacktestTimeframe('2h');

    expect(sixMinute?.normalized).toBe('6min');
    expect(sixMinute?.kind).toBe('intraday');

    expect(twelveMinute?.normalized).toBe('12min');
    expect(twelveMinute?.kind).toBe('intraday');

    expect(twoHour?.normalized).toBe('120min');
    expect(twoHour?.kind).toBe('intraday');
  });

  it('keeps intraday compatibility for strategies that support intraday presets', () => {
    const parsed = parseBacktestTimeframe('12m');
    expect(parsed).toBeTruthy();

    const compatible = isStrategyTimeframeCompatible(['1min', '5min', '15min', 'daily'], parsed!);
    expect(compatible).toBe(true);
  });

  it('auto-clamps applied range to available coverage', () => {
    const priceData = {
      '2024-01-10': { open: 1, high: 2, low: 1, close: 2, volume: 10 },
      '2024-01-11': { open: 2, high: 3, low: 1, close: 2, volume: 12 },
      '2024-01-12': { open: 2, high: 4, low: 2, close: 3, volume: 14 },
    };

    const coverage = computeCoverage(priceData, '2024-01-01', '2024-01-31');

    expect(coverage.minAvailable).toBe('2024-01-10');
    expect(coverage.maxAvailable).toBe('2024-01-12');
    expect(coverage.appliedStartDate).toBe('2024-01-10');
    expect(coverage.appliedEndDate).toBe('2024-01-12');
    expect(coverage.bars).toBe(3);
  });
});
