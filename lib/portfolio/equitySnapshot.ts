import { hasCurrentPrice, positionSideSign, positionUnits } from './positionValue';

type Position = { side: 'LONG' | 'SHORT'; quantity: number; entryPrice: number; currentPrice: number; tradeType?: string };
export type EquitySnapshot = { timestamp: string; totalValue: number; totalPL: number; basis?: string };

/** Equity is contributed capital plus realized and directional unrealized P&L.
 * Short-sale proceeds are cash and the short market value is a liability.
 */
export function accountEquityValues(startingCapital: number, netDeposits: number, realizedPL: number, positions: Position[]) {
  const priced = positions.filter((p) => hasCurrentPrice(p.currentPrice) && Number.isFinite(p.entryPrice));
  const unrealizedPL = priced.reduce((sum, p) => sum + (p.currentPrice - p.entryPrice) * positionUnits(p) * positionSideSign(p.side), 0);
  const netMarketValue = priced.reduce((sum, p) => sum + p.currentPrice * positionUnits(p) * positionSideSign(p.side), 0);
  const totalPL = realizedPL + unrealizedPL;
  const equity = startingCapital + netDeposits + totalPL;
  return { equity, cash: equity - netMarketValue, totalPL };
}

/** Refresh only today's observation. Never manufacture missing historical days. */
export function updateTodaySnapshot<T extends EquitySnapshot>(history: T[], snapshot: T): T[] {
  if (![snapshot.totalValue, snapshot.totalPL, Date.parse(snapshot.timestamp)].every(Number.isFinite)) return history;
  const day = snapshot.timestamp.slice(0, 10);
  const index = history.findIndex(s => s.timestamp.slice(0, 10) === day);
  if (index < 0) return [...history, snapshot];
  const old = history[index];
  if (old.totalValue === snapshot.totalValue && old.totalPL === snapshot.totalPL && old.basis === snapshot.basis) return history;
  return history.map((s, i) => i === index ? snapshot : s);
}
