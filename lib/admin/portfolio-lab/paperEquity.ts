import type { ArcaPosition } from './types';

/** Cash already includes short-sale proceeds. Subtract short liabilities; never add P&L twice. */
export function paperEquity(cash: number, positions: Pick<ArcaPosition, 'side' | 'quantity' | 'currentPrice' | 'averageEntry'>[]): number {
  const value = positions.reduce((sum, p) => {
    const price = p.currentPrice ?? p.averageEntry;
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(p.quantity) || p.quantity < 0) {
      throw new Error('Cannot value paper position with invalid price or quantity');
    }
    return sum + (p.side === 'LONG' ? 1 : -1) * price * p.quantity;
  }, 0);
  if (!Number.isFinite(cash)) throw new Error('Invalid paper cash balance');
  return Math.round((cash + value) * 100) / 100;
}
