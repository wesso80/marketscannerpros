import { DEFAULT_OPTION_MULTIPLIER, optionContractSpec, type OptionContractSpec } from '@/lib/options/contractQuote';

type PositionLike = {
  symbol?: string;
  quantity: number;
  tradeType?: string;
  optionType?: string;
  strikePrice?: number;
  expirationDate?: string;
};

/** Option positions carry premium per share; one contract = 100 shares. Everything else is 1:1. */
export function positionMultiplier(position: Pick<PositionLike, 'tradeType'>): number {
  return position.tradeType === 'Options' ? DEFAULT_OPTION_MULTIPLIER : 1;
}

/** Quantity in price units (contracts × multiplier) for value, P&L and weight. */
export function positionUnits(position: Pick<PositionLike, 'quantity' | 'tradeType'>): number {
  return position.quantity * positionMultiplier(position);
}

type OpenBookPosition = Pick<PositionLike, 'quantity' | 'tradeType'> & {
  side?: string | null;
  entryPrice: number;
  currentPrice: number;
};

/** LONG in any case is long. Every other side, including blank, is short. GET, refresh and split use this same rule. */
export function isLongSide(side: string | null | undefined): boolean {
  return String(side ?? '').trim().toUpperCase() === 'LONG';
}

/** +1 long, −1 short. A short's market value and cost are liabilities, so value − cost stays equal to P&L. */
export function positionSideSign(side: string | null | undefined): 1 | -1 {
  return isLongSide(side) ? 1 : -1;
}

/** A usable mark. Blank, non-finite and non-positive prices are not a current price. */
export function hasCurrentPrice(price: unknown): boolean {
  const n = typeof price === 'number' ? price : Number(price);
  return Number.isFinite(n) && n > 0;
}

function finiteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** One open position: long gains when price rises, short gains when price falls. Uses the same units as value and cost. Null when the current price or entry is missing — never a stand-in zero. */
export function openPositionPL(position: OpenBookPosition): number | null {
  const current = finiteNumber(position.currentPrice);
  const entry = finiteNumber(position.entryPrice);
  if (current == null || !hasCurrentPrice(current) || entry == null) return null;
  const pl = (current - entry) * positionUnits(position) * positionSideSign(position.side);
  return Number.isFinite(pl) ? pl : null;
}

/** P&L as a percent of entry cost. Null when P&L or a positive entry cost is missing. */
export function openPositionPLPercent(position: OpenBookPosition): number | null {
  const pl = openPositionPL(position);
  const entry = finiteNumber(position.entryPrice);
  if (pl == null || entry == null) return null;
  const basis = entry * positionUnits(position);
  if (!(basis > 0)) return null;
  const pct = (pl / basis) * 100;
  return Number.isFinite(pct) ? pct : null;
}

/** Signed market value. Shorts are negative. Null when the current price is missing. */
export function signedPositionValue(position: OpenBookPosition): number | null {
  const current = finiteNumber(position.currentPrice);
  if (current == null || !hasCurrentPrice(current)) return null;
  const value = current * positionUnits(position) * positionSideSign(position.side);
  return Number.isFinite(value) ? value : null;
}

/** Signed entry cost, with the same sign as value. Null when entry or the current price is missing, so the position stays out of both totals. */
export function signedPositionCost(position: OpenBookPosition): number | null {
  if (signedPositionValue(position) == null) return null;
  const entry = finiteNumber(position.entryPrice);
  if (entry == null) return null;
  const cost = entry * positionUnits(position) * positionSideSign(position.side);
  return Number.isFinite(cost) ? cost : null;
}

export type OpenBookTotals = { value: number; cost: number; pl: number; unpriced: number };

/** Signed value, signed cost and open P&L for positions that have a current price. Value − cost = P&L. */
export function openBookTotals(positions: readonly OpenBookPosition[]): OpenBookTotals {
  let value = 0;
  let cost = 0;
  let pl = 0;
  let unpriced = 0;
  for (const position of positions) {
    if (!hasCurrentPrice(position.currentPrice)) {
      unpriced += 1;
      continue;
    }
    const positionValue = signedPositionValue(position);
    const positionCost = signedPositionCost(position);
    const positionPL = openPositionPL(position);
    if (positionValue == null || positionCost == null || positionPL == null) continue;
    value += positionValue;
    cost += positionCost;
    pl += positionPL;
  }
  return { value, cost, pl, unpriced };
}

/** Open P&L for the book. Stored per-row `pl` is not an input. Positions with no current price are left out. */
export function sumOpenPositionPL(positions: readonly OpenBookPosition[]): number {
  return openBookTotals(positions).pl;
}

/** The recorded contract of an option position, or null (not an option / strike, expiry or right missing). */
export function positionOptionContract(position: PositionLike): OptionContractSpec | null {
  if (position.tradeType !== 'Options') return null;
  return optionContractSpec({
    symbol: position.symbol,
    optionType: position.optionType,
    strikePrice: position.strikePrice,
    expirationDate: position.expirationDate,
  });
}
