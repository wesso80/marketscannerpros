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
  side?: string;
  entryPrice: number;
  currentPrice: number;
};

/** One open position: long gains when price rises, short gains when price falls. Uses the same units as value and cost. */
export function openPositionPL(position: OpenBookPosition): number {
  const units = positionUnits(position);
  const move = position.side === 'SHORT'
    ? position.entryPrice - position.currentPrice
    : position.currentPrice - position.entryPrice;
  const pl = move * units;
  return Number.isFinite(pl) ? pl : 0;
}

/** Open P&L for the book. Stored per-row `pl` is not an input. */
export function sumOpenPositionPL(positions: readonly OpenBookPosition[]): number {
  return positions.reduce((sum, position) => sum + openPositionPL(position), 0);
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
