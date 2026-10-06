import { describe, expect, it } from 'vitest';
import { goldAssessment } from '@/lib/commodities/goldAssessment';

const present = {
  copperChange: 1,
  energyChange: 0.5,
  usdTrend: 'DOWN' as const,
  realRatesTrend: 'DOWN' as const,
  energyLead: false,
  metalsLead: true,
  agLead: false,
};

describe('gold assessment leaves a missing gold change out', () => {
  it('uses the existing formula when gold is present', () => {
    const row = goldAssessment({ ...present, goldChange: 0.4 });
    expect(row.impulseType).toBe('INFLATION');
    expect(row.copperVsGold).toBeCloseTo(1 - 0.4, 8);
    expect(row.growthTrend).toBe('UP');
    expect(row.growthSupport).toBe('SUPPORTIVE');
    expect(1 + 0.5 - 0.4).toBeGreaterThan(0.8);
  });

  it('keeps a real 0% gold change in the formula', () => {
    const row = goldAssessment({ ...present, goldChange: 0 });
    expect(row.impulseType).toBe('MIXED');
    expect(row.copperVsGold).toBe(1);
    expect(row.growthTrend).toBe('UP');
    expect(row.growthSupport).toBe('SUPPORTIVE');
  });

  it('does not treat a missing gold change as 0', () => {
    const row = goldAssessment({ ...present, goldChange: null });
    expect(row.impulseType).toBe('MIXED');
    expect(row.impulseType).not.toBe('INFLATION');
    expect(row.growthTrend).toBeNull();
    expect(row.growthSupport).toBeNull();
    expect(row.copperVsGold).toBeNull();
  });
});
