import { describe, it, expect } from 'vitest';
import { resolveEntryLevels } from '@/lib/journal/entryLevels';

describe('resolveEntryLevels (TR-9: no invented stops)', () => {
  it('stores no stop, no risk amount and no R:R when the stop is left blank', () => {
    for (const blank of [undefined, null, '', 0, '0', 'abc']) {
      const r = resolveEntryLevels({ side: 'LONG', entryPrice: 190, quantity: 10, assetClass: 'equity', stopLoss: blank });
      expect(r.stopLoss).toBeNull();
      expect(r.riskAmount).toBeNull();
      expect(r.plannedRR).toBeNull();
    }
    // Crypto and forex used to get 5% / 1.5% stops, options premiums 2%: none now.
    expect(resolveEntryLevels({ side: 'SHORT', entryPrice: 60000, quantity: 0.1, assetClass: 'crypto' }).stopLoss).toBeNull();
    expect(resolveEntryLevels({ side: 'LONG', entryPrice: 2.35, quantity: 1, assetClass: 'equity' }).stopLoss).toBeNull();
  });

  it('uses the stop the trader entered for risk and R:R', () => {
    const r = resolveEntryLevels({ side: 'LONG', entryPrice: 100, quantity: 10, stopLoss: '95', target: '110' });
    expect(r).toEqual({ stopLoss: 95, target: 110, riskAmount: 50, plannedRR: 2 });
  });

  it('keeps the existing target default (unchanged)', () => {
    expect(resolveEntryLevels({ side: 'LONG', entryPrice: 100, quantity: 1, assetClass: 'equity' }).target).toBe(104);
    expect(resolveEntryLevels({ side: 'SHORT', entryPrice: 100, quantity: 1, assetClass: 'crypto' }).target).toBe(90);
  });
});
