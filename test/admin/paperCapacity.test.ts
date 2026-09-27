import { describe, expect, it } from 'vitest';
import { remainingCapacity } from '@/lib/admin/portfolio-lab/portfolioCapacity';
import { sizePosition } from '@/lib/admin/portfolio-lab/positionSizing';
import { ARCA_DEFAULT_SETTINGS } from '@/lib/admin/portfolio-lab/constants';
import type { ArcaPortfolio, ArcaPosition, ArcaSimOrder } from '@/lib/admin/portfolio-lab/types';
const settings = { ...ARCA_DEFAULT_SETTINGS, slippagePctEstimate: 0, feesPctEstimate: 0 };
const portfolio = { totalEquity: 200000, currentCash: 200000, settings } as ArcaPortfolio;
const size = (capacity: ReturnType<typeof remainingCapacity>) => sizePosition({ equity: 200000, entry: 10, stop: 9.95, side: 'LONG', assetClass: 'crypto', settings, maxNotional: capacity.notional, maxRiskDollars: capacity.riskDollars });
describe('paper capacity sizing', () => {
  it('shrinks a tight-stop trade to the 25% crypto cap', () => {
    const result = size(remainingCapacity(portfolio, 'crypto', [], []));
    expect(result.ok).toBe(true);
    expect(result.notional).toBe(50000);
    expect(result.quantity).toBe(5000);
    expect(result.riskDollars).toBeCloseTo(250);
  });
  it('reserves pending orders together with open positions', () => {
    const positions = [{ assetClass: 'crypto', currentPrice: 10, quantity: 2000, openRisk: 1000 }] as ArcaPosition[];
    const orders = [{ assetClass: 'crypto', plannedEntry: 10, stopLoss: 9, quantity: 2500, status: 'WAITING_FOR_TRIGGER' }] as ArcaSimOrder[];
    const capacity = remainingCapacity(portfolio, 'crypto', positions, orders);
    expect(capacity.notional).toBe(5000);
    expect(capacity.riskDollars).toBe(6500);
    expect(size(capacity).notional).toBe(5000);
    orders.push({ ...orders[0], quantity: 500 });
    expect(size(remainingCapacity(portfolio, 'crypto', positions, orders)).ok).toBe(false);
  });
  it('does not spend short-sale proceeds beyond unleveraged equity', () => {
    const p = { ...portfolio, currentCash: 380000 };
    const positions = [{ assetClass: 'equity', currentPrice: 100, quantity: 1800, openRisk: 1000, side: 'SHORT' }] as ArcaPosition[];
    expect(remainingCapacity(p, 'crypto', positions, []).notional).toBe(20000);
  });
  it('rejects unknown pending risk rather than treating it as zero', () => {
    expect(() => remainingCapacity(portfolio, 'crypto', [], [{ status: 'PLANNED', quantity: 1, plannedEntry: 10, stopLoss: null }] as ArcaSimOrder[])).toThrow('risk levels');
  });
  it('rounds down and reserves slippage within capacity', () => {
    const r = sizePosition({ equity: 200000, entry: 7, stop: 6, side: 'LONG', assetClass: 'crypto', settings, maxNotional: 100, maxRiskDollars: 20, slippagePct: 1 });
    expect(r.quantity * 7 * 1.01).toBeLessThanOrEqual(100);
    expect(r.riskDollars).toBeLessThanOrEqual(20);
    expect(r.riskDollars).toBe(r.quantity * r.perUnitRisk);
  });
});
