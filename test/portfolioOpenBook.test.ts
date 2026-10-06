import { describe, expect, it } from 'vitest';
import { isLongSide, openBookTotals, openPositionPL, openPositionPLPercent, positionUnits, sumOpenPositionPL } from '@/lib/portfolio/positionValue';

const long = { side: 'LONG' as const, quantity: 10, entryPrice: 100, currentPrice: 110, pl: -121470 };
const short = { side: 'SHORT' as const, quantity: 5, entryPrice: 200, currentPrice: 180, pl: -50000 };
const option = { side: 'LONG' as const, quantity: 2, entryPrice: 1.5, currentPrice: 2, tradeType: 'Options', pl: 0 };
const risingShort = { side: 'SHORT' as const, quantity: 4, entryPrice: 50, currentPrice: 70, tradeType: 'Options' };

describe('open P&L from the same inputs as value and cost', () => {
  it('is long-positive when price rises and short-positive when price falls', () => {
    expect(openPositionPL(long)).toBe(100);
    expect(openPositionPL(short)).toBe(100);
    expect(openPositionPL(option)).toBe(100);
    expect(positionUnits(option)).toBe(200);
    expect(openPositionPL(risingShort)).toBe(-8000);
  });

  it('ignores a stored pl of -121470 and keeps long-only value minus cost equal to open P&L', () => {
    const longs = [long, option];
    const value = longs.reduce((sum, p) => sum + p.currentPrice * positionUnits(p), 0);
    const cost = longs.reduce((sum, p) => sum + p.entryPrice * positionUnits(p), 0);
    expect(value).toBe(1500);
    expect(cost).toBe(1300);
    expect(sumOpenPositionPL(longs)).toBe(200);
    expect(value - cost).toBe(sumOpenPositionPL(longs));
    expect(long.pl).toBe(-121470);
  });

  it('signs short value and cost so value minus cost equals open P&L', () => {
    const book = [long, short, option];
    const totals = openBookTotals(book);
    expect(totals.value).toBe(600);
    expect(totals.cost).toBe(300);
    expect(totals.pl).toBe(300);
    expect(totals.value - totals.cost).toBe(totals.pl);
    expect(totals.unpriced).toBe(0);
    expect(sumOpenPositionPL(book)).toBe(300);
  });

  it('treats any side that is not LONG as short, ignoring case', () => {
    expect(isLongSide('long')).toBe(true);
    expect(isLongSide('Long')).toBe(true);
    expect(isLongSide('short')).toBe(false);
    expect(isLongSide('')).toBe(false);
    expect(openPositionPL({ ...long, side: 'long' })).toBe(100);
    expect(openPositionPL({ ...short, side: 'short' })).toBe(100);
    expect(openPositionPL({ ...long, side: 'cover' })).toBe(-100);
    expect(openPositionPLPercent(long)).toBe(10);
  });

  it('leaves a missing current price out of the totals instead of a zero P&L', () => {
    const missing = { ...long, currentPrice: Number.NaN, pl: 0 };
    expect(openPositionPL(missing)).toBeNull();
    expect(openPositionPLPercent(missing)).toBeNull();
    const totals = openBookTotals([long, missing]);
    expect(totals.unpriced).toBe(1);
    expect(totals.value).toBe(1100);
    expect(totals.cost).toBe(1000);
    expect(totals.pl).toBe(100);
    expect(totals.value - totals.cost).toBe(totals.pl);
  });
});
