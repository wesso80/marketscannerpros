import type { TradeRowModel } from '@/types/journal';

type PrefillTrade = Pick<TradeRowModel, 'symbol' | 'assetClass' | 'tradeType'> &
  Partial<Pick<TradeRowModel, 'exit' | 'mark'>>;

/**
 * What the Close Trade modal should put in the Exit Price field when it opens.
 *
 * - `value`: pre-fill with this price right away.
 * - `fetch`: nothing on hand; fetch a quote from `url` (stocks/crypto only).
 * - `manual`: leave the field empty; the user must type the exit price.
 */
export type CloseExitPrefill =
  | { kind: 'value'; price: number; source: 'mark' | 'exit' }
  | { kind: 'fetch'; quoteType: 'stock' | 'crypto'; url: string }
  | { kind: 'manual'; reason: 'option_mark_unavailable' | 'no_symbol' };

function positivePrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function isOptionsTrade(trade: Pick<TradeRowModel, 'assetClass' | 'tradeType'>): boolean {
  return trade.tradeType === 'Options' || trade.assetClass === 'options';
}

/**
 * Options: the exit is a premium per share, so only the trade's own option mark (or an
 * already-recorded exit) may pre-fill it. The underlying's share price is never used; with
 * no option mark the field stays empty.
 * Stocks/crypto/other: prefer the current mark, then a recorded exit, then fetch a quote.
 */
export function closeExitPrefill(trade: PrefillTrade | undefined, nowMs = Date.now()): CloseExitPrefill {
  if (!trade) return { kind: 'manual', reason: 'no_symbol' };

  const markPrice = positivePrice(trade.mark?.price);
  if (markPrice != null) return { kind: 'value', price: markPrice, source: 'mark' };

  const exitPrice = positivePrice(trade.exit?.price);
  if (exitPrice != null) return { kind: 'value', price: exitPrice, source: 'exit' };

  if (isOptionsTrade(trade)) return { kind: 'manual', reason: 'option_mark_unavailable' };

  const sym = (trade.symbol || '').toUpperCase().trim();
  if (!sym) return { kind: 'manual', reason: 'no_symbol' };
  const isCrypto = /[-_/](USDT?|EUR|PERP)$/i.test(sym) || trade.assetClass === 'crypto';
  const base = sym.replace(/[-_/]?USDT?$/i, '').replace(/[-_/]?EUR$/i, '').replace(/[-_/]?PERP$/i, '');
  const quoteType = isCrypto ? 'crypto' : 'stock';
  return {
    kind: 'fetch',
    quoteType,
    url: `/api/quote?symbol=${encodeURIComponent(base)}&type=${quoteType}&market=USD&_t=${nowMs}`,
  };
}
