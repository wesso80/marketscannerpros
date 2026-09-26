import { isOptionsTrade } from '@/lib/journal/closePrefill';
import type { TradeAssetClass, TradeRowModel } from '@/types/journal';

/**
 * Journal "Asset Class" filter. Options trades are identified by tradeType === 'Options' (the stored
 * asset class of an options trade is its underlying's class, usually equity), so:
 *  - "Options" lists options trades;
 *  - "Stocks" (equity) lists equity trades that are not options;
 *  - other classes match on the stored asset class.
 */
export function matchesAssetClassFilter(
  trade: Pick<TradeRowModel, 'assetClass' | 'tradeType'>,
  filter: TradeAssetClass | undefined,
): boolean {
  if (!filter) return true;
  if (filter === 'options') return isOptionsTrade(trade);
  if (filter === 'equity') return trade.assetClass === 'equity' && !isOptionsTrade(trade);
  return trade.assetClass === filter;
}
