/**
 * Two clearly separate measures on the Portfolio page (TR-5):
 *
 *  - R: P&L divided by the risk to a REAL stop (entry-to-stop distance x units). Only shown where a stop
 *    exists: open positions with a stop, closed trades whose journal entry recorded a stop (journal R), or
 *    closed trades that kept a stop on this device. Otherwise '—'.
 *  - Risk units: P&L divided by the account risk per trade (account equity x max risk per trade %). One
 *    definition, used everywhere a stop isn't available, and never called R.
 */

/** Dollar size of one risk unit, or null when the account base or risk % is unusable. */
export function riskUnitDollars(accountEquity: number, maxRiskPerTradePct: number): number | null {
  if (!Number.isFinite(accountEquity) || accountEquity <= 0) return null;
  if (!Number.isFinite(maxRiskPerTradePct) || maxRiskPerTradePct <= 0) return null;
  return accountEquity * (maxRiskPerTradePct / 100);
}

export function toRiskUnits(amount: number, unitDollars: number | null): number | null {
  if (unitDollars == null || !(unitDollars > 0) || !Number.isFinite(amount)) return null;
  return amount / unitDollars;
}

export function formatRiskUnits(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '— risk units';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(2)} risk units`;
}

export interface ClosedForR {
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  realizedPL: number;
  /** R already computed against a recorded stop (journal-linked closes). */
  rMultiple?: number | null;
  /** Stop kept on this device for a manual position. */
  stopPrice?: number | null;
}

/** R for a closed trade, or null when no real stop is known. `units` = quantity x contract multiplier. */
export function closedTradeR(trade: ClosedForR, units: number): number | null {
  if (trade.rMultiple != null && Number.isFinite(trade.rMultiple)) return trade.rMultiple;
  const stop = Number(trade.stopPrice);
  if (!Number.isFinite(stop) || stop <= 0 || !(units > 0)) return null;
  const riskPerUnit = trade.side === 'LONG' ? trade.entryPrice - stop : stop - trade.entryPrice;
  if (!(riskPerUnit > 0)) return null;
  return trade.realizedPL / (riskPerUnit * units);
}

export interface Summary {
  count: number;
  avg: number | null;
  best: number | null;
  worst: number | null;
}

export function summarize(values: Array<number | null | undefined>): Summary {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (xs.length === 0) return { count: 0, avg: null, best: null, worst: null };
  return {
    count: xs.length,
    avg: xs.reduce((a, b) => a + b, 0) / xs.length,
    best: Math.max(...xs),
    worst: Math.min(...xs),
  };
}

export function formatR(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
}
