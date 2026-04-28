import { describe, expect, test } from 'vitest';
import { computePlaybookExpectancy, PLAYBOOK_EXPECTANCY_MIN_SAMPLE } from '../lib/journal/playbookExpectancy';
import type { TradeRowModel } from '../types/journal';

function closedTrade(playbook: string, rMultiple: number, id: number): TradeRowModel {
  return {
    id: String(id),
    symbol: 'AAPL',
    assetClass: 'equity',
    side: 'long',
    status: 'closed',
    entry: { price: 100, ts: '2026-04-01T14:30:00.000Z' },
    exit: { price: 101, ts: '2026-04-01T15:30:00.000Z' },
    qty: 1,
    pnlUsd: rMultiple * 100,
    pnlPct: rMultiple,
    rMultiple,
    strategyTag: playbook,
  };
}

describe('journal playbook expectancy', () => {
  test('marks thin samples as uncalibrated and includes confidence intervals', () => {
    const result = computePlaybookExpectancy([
      closedTrade('breakout', 1.2, 1),
      closedTrade('breakout', -0.8, 2),
      closedTrade('breakout', 0.4, 3),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      playbook: 'breakout',
      sampleSize: 3,
      minSampleSize: PLAYBOOK_EXPECTANCY_MIN_SAMPLE,
      sampleStatus: 'insufficient',
      isMinimumMet: false,
    });
    expect(result[0].warning).toContain('Thin sample');
    expect(result[0].warning).toContain('do not treat expectancy as calibrated');
    expect(result[0].winRateCiLow).toBeLessThan(result[0].winRateCiHigh);
    expect(result[0].expectancyCiLow).toBeLessThan(result[0].expectancyCiHigh);
  });

  test('marks playbooks with at least 30 R-labeled trades as minimum sample met', () => {
    const trades = Array.from({ length: 30 }, (_, index) => closedTrade('mean_reversion', index % 2 === 0 ? 1 : -0.5, index + 1));
    const [result] = computePlaybookExpectancy(trades);

    expect(result.sampleStatus).toBe('minimum_met');
    expect(result.isMinimumMet).toBe(true);
    expect(result.warning).toContain('Minimum sample met');
    expect(result.expectancyR).toBeCloseTo(0.25, 5);
  });

  test('ignores open trades and closed trades without R multiples', () => {
    const openTrade = { ...closedTrade('trend', 2, 2), id: '2', status: 'open' as const, exit: undefined };
    const missingR = { ...closedTrade('trend', 1, 3), id: '3', rMultiple: undefined };
    const result = computePlaybookExpectancy([closedTrade('trend', 1, 1), openTrade, missingR]);

    expect(result).toHaveLength(1);
    expect(result[0].sampleSize).toBe(1);
    expect(result[0].expectancyR).toBe(1);
  });
});
