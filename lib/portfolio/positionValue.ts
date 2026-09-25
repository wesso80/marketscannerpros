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
