import { DEFAULT_OPTION_MULTIPLIER } from '@/lib/options/contractQuote';

/**
 * One unit convention for Journal options trades, used everywhere downstream (marks, P&L x100,
 * open R, the Close modal and Portfolio): entry, stop, target and exit are the option PREMIUM PER
 * SHARE, as quoted (e.g. 2.35). Quantity is the number of CONTRACTS; one contract = 100 shares.
 */
export type EntryTradeType = 'Spot' | 'Options' | 'Futures' | 'Margin';

export function entryUnitLabels(tradeType: EntryTradeType) {
  if (tradeType === 'Options') {
    return {
      entry: 'Entry Premium (per share) *',
      entryPlaceholder: 'e.g. 2.35',
      quantity: 'Contracts *',
      help: `Enter option prices per share, as quoted. One contract = ${DEFAULT_OPTION_MULTIPLIER} shares, so a 2.35 premium costs $${(2.35 * DEFAULT_OPTION_MULTIPLIER).toFixed(0)} per contract. Stop and target are premiums per share too.`,
    };
  }
  return { entry: 'Entry Price *', entryPlaceholder: '0.00', quantity: 'Quantity *', help: null as string | null };
}

/** Dollar risk to the stop for the preview: options apply the contract multiplier. */
export function entryRiskUsd(tradeType: EntryTradeType, entry: number, stop: number, quantity: number): number | undefined {
  if (![entry, stop, quantity].every(Number.isFinite) || quantity <= 0) return undefined;
  const perUnit = Math.abs(entry - stop);
  if (!(perUnit > 0)) return undefined;
  return perUnit * quantity * (tradeType === 'Options' ? DEFAULT_OPTION_MULTIPLIER : 1);
}

/**
 * Non-blocking check for the two common unit mistakes on an options entry: typing the underlying's
 * share price, or a per-contract amount (100x the per-share premium). Premium at or above the strike
 * is almost never right (a put can't be worth more than its strike; a call only if the stock is 2x the strike).
 */
export function optionEntryWarning(entryPremium: number, strike: number | null | undefined): string | null {
  if (!Number.isFinite(entryPremium) || entryPremium <= 0) return null;
  if (strike != null && Number.isFinite(strike) && strike > 0 && entryPremium >= strike) {
    return `Premium ${entryPremium} is at or above the ${strike} strike. Check it's the option premium per share, not the stock price or a per-contract amount.`;
  }
  return null;
}
