import { describe, expect, it } from 'vitest';
import { openPositionPL, positionUnits, sumOpenPositionPL } from '@/lib/portfolio/positionValue';

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

  it('sums a mixed book from each side, which is not value minus cost once a short is included', () => {
    const book = [long, short, option];
    const value = book.reduce((sum, p) => sum + p.currentPrice * positionUnits(p), 0);
    const cost = book.reduce((sum, p) => sum + p.entryPrice * positionUnits(p), 0);
    expect(value).toBe(2400);
    expect(cost).toBe(2300);
    expect(sumOpenPositionPL(book)).toBe(300);
    expect(value - cost).toBe(100);
  });
});
