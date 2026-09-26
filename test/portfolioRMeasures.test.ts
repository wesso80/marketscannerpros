import { describe, it, expect } from 'vitest';
import { closedTradeR, formatR, formatRiskUnits, riskUnitDollars, summarize, toRiskUnits } from '@/lib/portfolio/rMeasures';
import { positionUnits } from '@/lib/portfolio/positionValue';

describe('risk units (TR-5): one definition, never called R', () => {
  it('1 risk unit = account equity x max risk per trade %', () => {
    expect(riskUnitDollars(25000, 1)).toBe(250);
    expect(toRiskUnits(500, 250)).toBe(2);
    expect(formatRiskUnits(2)).toBe('+2.00 risk units');
    expect(formatRiskUnits(-0.5)).toBe('-0.50 risk units');
    expect(riskUnitDollars(0, 1)).toBeNull();
    expect(formatRiskUnits(toRiskUnits(100, null))).toBe('— risk units');
    expect(formatRiskUnits(1)).not.toMatch(/\bR\b/);
  });
});

describe('closedTradeR: R only against a real stop', () => {
  it('uses the journal R when a stop was recorded', () => {
    expect(closedTradeR({ side: 'LONG', entryPrice: 100, realizedPL: 300, rMultiple: 1.5 }, 10)).toBe(1.5);
  });
  it('computes R from a stop kept on this device', () => {
    // long 10 @ 100, stop 95 -> $50 risk; +$150 = +3R
    expect(closedTradeR({ side: 'LONG', entryPrice: 100, realizedPL: 150, stopPrice: 95 }, 10)).toBeCloseTo(3);
  });
  it('is unavailable without a stop (no more notional x risk% "R")', () => {
    expect(closedTradeR({ side: 'LONG', entryPrice: 100, realizedPL: 5000 }, 10)).toBeNull();
    expect(closedTradeR({ side: 'LONG', entryPrice: 100, realizedPL: 50, stopPrice: 100 }, 10)).toBeNull();
  });
  it('options closes use the x100 multiplier once tradeType is known', () => {
    const optionClose = { side: 'LONG' as const, entryPrice: 2.35, realizedPL: 170, stopPrice: 1.5, quantity: 2, tradeType: 'Options' };
    const units = positionUnits(optionClose);
    expect(units).toBe(200);
    expect(closedTradeR(optionClose, units)).toBeCloseTo(1); // $170 risk (0.85 x 200)
  });
});

describe('summarize / formatR', () => {
  it('ignores trades without R and reports the count', () => {
    expect(summarize([1, null, -0.5, undefined, 2])).toEqual({ count: 3, avg: 2.5 / 3, best: 2, worst: -0.5 });
    expect(summarize([null])).toEqual({ count: 0, avg: null, best: null, worst: null });
    expect(formatR(null)).toBe('—');
    expect(formatR(1.234)).toBe('+1.23R');
  });
});
