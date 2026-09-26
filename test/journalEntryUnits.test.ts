import { describe, expect, it } from 'vitest';
import { entryRiskUsd, entryUnitLabels, optionEntryWarning } from '@/lib/journal/entryUnits';
import { enrichTradesWithLivePrices, journalQuoteRequest } from '@/lib/journal/markToMarket';
import type { TradeRowModel } from '@/types/journal';

describe('Journal options entry units (TR-30)', () => {
  it('labels the options entry as premium per share and quantity as contracts', () => {
    const l = entryUnitLabels('Options');
    expect(l.entry).toBe('Entry Premium (per share) *');
    expect(l.quantity).toBe('Contracts *');
    expect(l.help).toContain('One contract = 100 shares');
    expect(entryUnitLabels('Spot')).toMatchObject({ entry: 'Entry Price *', quantity: 'Quantity *', help: null });
  });

  it('risk preview applies the x100 multiplier for options only', () => {
    expect(entryRiskUsd('Options', 2.35, 1.35, 2)).toBeCloseTo(200); // 1.00 x 2 contracts x 100
    expect(entryRiskUsd('Spot', 50, 48, 10)).toBeCloseTo(20);
    expect(entryRiskUsd('Options', 2, Number.NaN, 1)).toBeUndefined();
    expect(entryRiskUsd('Options', 2, 2, 1)).toBeUndefined();
  });

  it('the per-share entry is exactly what open P&L uses (x100 per contract)', () => {
    const trade = {
      id: '1', symbol: 'SPY', assetClass: 'equity', side: 'long', status: 'open', tradeType: 'Options',
      option: { right: 'call', strike: 500, expiration: '2026-10-16' },
      entry: { price: 2.35, ts: '2026-09-25' }, qty: 2,
    } as unknown as TradeRowModel;
    const key = journalQuoteRequest(trade)!.key;
    const [row] = enrichTradesWithLivePrices([trade], { [key]: { price: 2.85, observedAt: null, retrievedAt: '2026-09-26T00:00:00Z', basis: 'EOD', asOfDate: '2026-09-25' } });
    // (0.50 per share) x 2 contracts x 100 = $100 — only true if entry is per share
    expect(row.pnlUsd).toBeCloseTo(100);
  });

  it('warns (without blocking) when the premium looks like a stock price or per-contract amount', () => {
    expect(optionEntryWarning(512.3, 500)).toMatch(/not the stock price or a per-contract amount/);
    expect(optionEntryWarning(235, 200)).not.toBeNull();
    expect(optionEntryWarning(2.35, 500)).toBeNull();
    expect(optionEntryWarning(2.35, undefined)).toBeNull();
    expect(optionEntryWarning(2.35, Number.NaN)).toBeNull();
  });
});
