import { describe, expect, it } from 'vitest';
import { paperEquity } from '@/lib/admin/portfolio-lab/paperEquity';

describe('paper ledger valuation', () => {
  it('preserves equity when cash becomes a long position', () => {
    expect(paperEquity(190000, [{ side: 'LONG', quantity: 100, averageEntry: 100, currentPrice: 100 }])).toBe(200000);
  });
  it('includes long market value without adding unrealised profit twice', () => {
    expect(paperEquity(190000, [{ side: 'LONG', quantity: 100, averageEntry: 100, currentPrice: 110 }])).toBe(201000);
  });
  it('subtracts short liabilities from cash containing sale proceeds', () => {
    expect(paperEquity(210000, [{ side: 'SHORT', quantity: 100, averageEntry: 100, currentPrice: 110 }])).toBe(199000);
  });
  it('reconciles mixed long and short books', () => {
    expect(paperEquity(200000, [
      { side: 'LONG', quantity: 100, averageEntry: 100, currentPrice: 110 },
      { side: 'SHORT', quantity: 100, averageEntry: 100, currentPrice: 90 },
    ])).toBe(202000);
  });
  it('refuses invalid marks rather than publishing a false balance', () => {
    expect(() => paperEquity(200000, [{ side: 'LONG', quantity: 1, averageEntry: 100, currentPrice: NaN }])).toThrow();
  });
});
