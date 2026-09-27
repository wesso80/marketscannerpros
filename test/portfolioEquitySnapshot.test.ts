import { describe, expect, it } from 'vitest';
import { accountEquityValues, updateTodaySnapshot } from '@/lib/portfolio/equitySnapshot';

describe('directional account equity', () => {
  it('values profitable shorts as gains and includes the short liability in cash', () => {
    expect(accountEquityValues(10000, 500, 100, [{ side: 'SHORT', quantity: 10, entryPrice: 100, currentPrice: 80 }]))
      .toEqual({ equity: 10800, cash: 11600, totalPL: 300 });
  });
  it('values a mixed long and short option book using contract units', () => {
    expect(accountEquityValues(10000, -1000, -100, [
      { side: 'LONG', quantity: 10, entryPrice: 100, currentPrice: 110 },
      { side: 'SHORT', quantity: 2, tradeType: 'Options', entryPrice: 3, currentPrice: 4 },
    ])).toEqual({ equity: 8800, cash: 8500, totalPL: -200 });
  });
});

describe('daily observation refresh', () => {
  const prior = { timestamp: '2026-09-25T00:00:00.000Z', totalValue: 10000, totalPL: 0, basis: 'account_equity_v2' };
  const today = { ...prior, timestamp: '2026-09-27T10:00:00.000Z', totalValue: 10200, totalPL: 200 };
  it('updates an existing same-day snapshot without changing previous dates or adding missing days', () => {
    const old = { ...today, totalValue: 10100, totalPL: 100 };
    expect(updateTodaySnapshot([prior, old], today)).toEqual([prior, today]);
    expect(updateTodaySnapshot([prior], today)).toEqual([prior, today]);
  });
  it('keeps the same array when only the timestamp changes', () => {
    const history = [today];
    expect(updateTodaySnapshot(history, { ...today, timestamp: '2026-09-27T11:00:00.000Z' })).toBe(history);
  });
  it('refuses invalid observations', () => {
    const history = [prior];
    expect(updateTodaySnapshot(history, { ...today, totalValue: NaN })).toBe(history);
  });
});
