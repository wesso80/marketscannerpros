import { describe, expect, it } from 'vitest';
import { closeExitPrefill } from '@/lib/journal/closePrefill';

const NOW = Date.parse('2026-09-25T15:00:00Z');
const mark = (price: number) => ({ price, observedAt: null, retrievedAt: new Date(NOW).toISOString(), basis: 'EOD' as const, asOfDate: '2026-09-24' });

describe('Close Trade modal exit pre-fill (TR-8)', () => {
  it('options trade with a mark pre-fills the option premium mark', () => {
    const r = closeExitPrefill({ symbol: 'XYZ', assetClass: 'equity', tradeType: 'Options', mark: mark(3.45) }, NOW);
    expect(r).toEqual({ kind: 'value', price: 3.45, source: 'mark' });
  });

  it('options trade without a mark leaves the field empty and never fetches the underlying stock quote', () => {
    const r = closeExitPrefill({ symbol: 'XYZ', assetClass: 'equity', tradeType: 'Options' }, NOW);
    expect(r).toEqual({ kind: 'manual', reason: 'option_mark_unavailable' });
  });

  it('assetClass "options" is treated as an options trade too', () => {
    const r = closeExitPrefill({ symbol: 'XYZ', assetClass: 'options', tradeType: 'Spot' }, NOW);
    expect(r).toEqual({ kind: 'manual', reason: 'option_mark_unavailable' });
  });

  it('ignores a zero / non-finite mark on an options trade', () => {
    expect(closeExitPrefill({ symbol: 'XYZ', assetClass: 'equity', tradeType: 'Options', mark: mark(0) }, NOW).kind).toBe('manual');
    expect(closeExitPrefill({ symbol: 'XYZ', assetClass: 'equity', tradeType: 'Options', mark: mark(Number.NaN) }, NOW).kind).toBe('manual');
  });

  it('stock trade prefers the mark over a quote fetch', () => {
    const r = closeExitPrefill({ symbol: 'xyz', assetClass: 'equity', tradeType: 'Spot', mark: mark(101.5) }, NOW);
    expect(r).toEqual({ kind: 'value', price: 101.5, source: 'mark' });
  });

  it('stock trade with no mark still fetches a stock quote (unchanged behaviour)', () => {
    const r = closeExitPrefill({ symbol: 'xyz', assetClass: 'equity', tradeType: 'Spot' }, NOW);
    expect(r).toEqual({ kind: 'fetch', quoteType: 'stock', url: `/api/quote?symbol=XYZ&type=stock&market=USD&_t=${NOW}` });
  });

  it('crypto trade with no mark fetches a crypto quote for the base symbol (unchanged behaviour)', () => {
    const r = closeExitPrefill({ symbol: 'ABC-USDT', assetClass: 'crypto', tradeType: 'Spot' }, NOW);
    expect(r).toEqual({ kind: 'fetch', quoteType: 'crypto', url: `/api/quote?symbol=ABC&type=crypto&market=USD&_t=${NOW}` });
  });

  it('a recorded exit price is still used when there is no mark', () => {
    const r = closeExitPrefill({ symbol: 'XYZ', assetClass: 'equity', tradeType: 'Options', exit: { price: 2.1, ts: '2026-09-24' } }, NOW);
    expect(r).toEqual({ kind: 'value', price: 2.1, source: 'exit' });
  });

  it('mark wins over a recorded exit', () => {
    const r = closeExitPrefill({ symbol: 'XYZ', assetClass: 'equity', tradeType: 'Spot', mark: mark(10), exit: { price: 9, ts: '2026-09-24' } }, NOW);
    expect(r).toEqual({ kind: 'value', price: 10, source: 'mark' });
  });

  it('no trade or empty symbol → manual entry', () => {
    expect(closeExitPrefill(undefined, NOW)).toEqual({ kind: 'manual', reason: 'no_symbol' });
    expect(closeExitPrefill({ symbol: '  ', assetClass: 'equity' }, NOW)).toEqual({ kind: 'manual', reason: 'no_symbol' });
  });
});
