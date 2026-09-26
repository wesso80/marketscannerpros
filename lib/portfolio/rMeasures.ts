/**
 * Two clearly separate measures on the Portfolio page (TR-5):
 *
 *  - R: P&L divided by the risk to a REAL stop (entry-to-stop distance x units). Only shown where a stop
 *    exists: open positions with a stop, closed trades whose journal entry recorded a stop (journal R), or
 *    closed trades that kept a stop on this device. Otherwise '—'.
 *  - Risk units: P&L divided by the account risk per trade (account equity x max risk per trade %). One
 *    definition, used everywhere a stop isn't available, and never called R.
 */

/**
 * The account equity risk units are measured against, or null when the account has no capital recorded (starting
 * capital + net deposits <= 0) or equity is not positive. Risk units are then unavailable: no invented base.
 */
export function riskUnitBase(input: { startingCapital: number; netDeposits: number; accountEquity: number }): number | null {
  const funded = Number(input.startingCapital) + Number(input.netDeposits);
  if (!Number.isFinite(funded) || funded <= 0) return null;
  return Number.isFinite(input.accountEquity) && input.accountEquity > 0 ? input.accountEquity : null;
}

/** Shown where risk units would appear when there is no account equity to measure them against. */
export const RISK_UNITS_NEED_EQUITY = 'Set Starting Capital to see risk units';

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
  /** Exit price (same units as entryPrice). When known, R is worked out from prices, so no contract multiplier is needed. */
  closePrice?: number | null;
}

/** R for a closed trade, or null when no real stop is known. `units` = quantity x contract multiplier. */
export function closedTradeR(trade: ClosedForR, units: number): number | null {
  if (trade.rMultiple != null && Number.isFinite(trade.rMultiple)) return trade.rMultiple;
  const stop = Number(trade.stopPrice);
  if (!Number.isFinite(stop) || stop <= 0) return null;
  const riskPerUnit = trade.side === 'LONG' ? trade.entryPrice - stop : stop - trade.entryPrice;
  if (!(riskPerUnit > 0)) return null;
  // Multiplier-free: P&L and risk both scale with quantity x multiplier, so R = price move / risk per unit. This keeps an
  // option close right (x100 on both sides) even when the row no longer says it is an option (a close with no linked
  // journal entry has no tradeType), where P&L / (risk x units) used to take x1 units.
  const close = Number(trade.closePrice);
  if (trade.closePrice != null && Number.isFinite(close) && close >= 0) {
    return (trade.side === 'LONG' ? close - trade.entryPrice : trade.entryPrice - close) / riskPerUnit;
  }
  if (!(units > 0)) return null;
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
