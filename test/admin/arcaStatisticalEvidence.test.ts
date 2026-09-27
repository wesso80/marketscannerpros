import { describe, expect, it } from 'vitest';
import { completedDailyReturns, dailyRiskAdjusted, lastValuesByUtcDay, latestContinuousReturns } from '@/lib/admin/portfolio-lab/statisticalEvidence';

describe('calendar-day valuation evidence', () => {
  it('selects the latest same-day value independently of store ordering', () => {
    const rows = [
      { at: '2026-05-01T20:00:00Z', value: 110 },
      { at: '2026-05-01T10:00:00Z', value: 100 },
      { at: 'invalid', value: 1000 },
      { at: '2026-05-02T20:00:00Z', value: NaN },
    ];
    expect([...lastValuesByUtcDay(rows).values()]).toEqual([110]);
    expect([...lastValuesByUtcDay(rows.reverse()).values()]).toEqual([110]);
  });

  it('does not invent returns across missing days or the incomplete current day', () => {
    const days = ['2026-05-01', '2026-05-02', '2026-05-05', '2026-05-06', '2026-05-07'];
    const now = Date.parse('2026-05-07T12:00:00Z');
    const returns = completedDailyReturns(days, [100, 110, 200, 220, 440], now);
    expect(returns).toEqual([null, 0.1, null, 0.1, null]);
    expect(latestContinuousReturns(days, returns, now)).toEqual([0.1]);
  });

  it('uses calendar-day annualisation and all observations for downside deviation', () => {
    const returns = Array.from({ length: 30 }, (_, i) => i % 2 ? -0.01 : 0.02);
    const result = dailyRiskAdjusted(returns);
    // mean 0.005; downside variance = 15 * 0.01^2 / 30.
    expect(result.sortino).toBeCloseTo(0.005 / Math.sqrt(0.00005) * Math.sqrt(365), 8);
    expect(result.annVol).toBeCloseTo(Math.sqrt(30 * 0.015 ** 2 / 29) * Math.sqrt(365) * 100, 8);
    expect(dailyRiskAdjusted(returns.slice(0, 29)).sharpe).toBeNull();
    expect(dailyRiskAdjusted([...returns, NaN]).sharpe).toBeNull();
  });
});
