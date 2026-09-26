import { describe, it, expect } from 'vitest';
import { matchesAssetClassFilter } from '@/lib/journal/assetClassFilter';
import { mapJournalResponseToPayload } from '@/lib/journal/mapPayload';

describe('Journal Asset Class filter (TR-10)', () => {
  // As mapped from /api/journal: an options trade is stored with assetClass 'equity' and tradeType 'Options'.
  const spyCall = { assetClass: 'equity' as const, tradeType: 'Options' as const };
  const aapl = { assetClass: 'equity' as const, tradeType: 'Spot' as const };
  const btc = { assetClass: 'crypto' as const, tradeType: 'Spot' as const };

  it('"Options" lists options trades', () => {
    expect(matchesAssetClassFilter(spyCall, 'options')).toBe(true);
    expect(matchesAssetClassFilter(aapl, 'options')).toBe(false);
    expect(matchesAssetClassFilter(btc, 'options')).toBe(false);
  });

  it('"Stocks" no longer includes options trades', () => {
    expect(matchesAssetClassFilter(aapl, 'equity')).toBe(true);
    expect(matchesAssetClassFilter(spyCall, 'equity')).toBe(false);
  });

  it('other classes and "all" are unchanged', () => {
    expect(matchesAssetClassFilter(btc, 'crypto')).toBe(true);
    expect(matchesAssetClassFilter(aapl, 'crypto')).toBe(false);
    for (const t of [spyCall, aapl, btc]) expect(matchesAssetClassFilter(t, undefined)).toBe(true);
  });

  it('works on rows as mapped from the journal API', () => {
    const payload = mapJournalResponseToPayload({ entries: [
      { id: 1, symbol: 'SPY', side: 'LONG', tradeType: 'Options', assetClass: 'equity', optionType: 'call', strikePrice: 500, expirationDate: '2026-10-16', entryPrice: 2.35, quantity: 1, isOpen: true, date: '2026-09-25' },
      { id: 2, symbol: 'AAPL', side: 'LONG', tradeType: 'Spot', assetClass: 'equity', entryPrice: 190, quantity: 10, isOpen: true, date: '2026-09-25' },
    ] });
    const rows = payload.trades;
    expect(rows.filter((r) => matchesAssetClassFilter(r, 'options')).map((r) => r.symbol)).toEqual(['SPY']);
    expect(rows.filter((r) => matchesAssetClassFilter(r, 'equity')).map((r) => r.symbol)).toEqual(['AAPL']);
  });
});
