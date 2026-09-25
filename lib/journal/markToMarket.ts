import type { TradeRowModel } from '@/types/journal';
import {
  DEFAULT_OPTION_MULTIPLIER,
  isOptionMarkCurrent,
  optionContractKey,
  optionContractSpec,
  optionQuoteUrl,
  type OptionContractSpec,
} from '@/lib/options/contractQuote';

export type QuoteObservation = { price: number; observedAt: string | null; retrievedAt: string; basis?: 'EOD' | 'REALTIME'; asOfDate?: string };
export type LivePriceMap = Record<string, QuoteObservation>;

type QuoteTrade = Pick<TradeRowModel, 'symbol' | 'assetClass' | 'tradeType'> & Partial<Pick<TradeRowModel, 'option'>>;
export type JournalQuoteRequest =
  | { type: 'stock' | 'crypto'; symbol: string; key: string; url: string }
  | { type: 'option'; symbol: string; key: string; url: string; contract: OptionContractSpec };

/** Option trades are marked from their own contract; the underlying's price is never used for them. */
export function journalOptionContract(trade: QuoteTrade): OptionContractSpec | null {
  if (trade.tradeType !== 'Options') return null;
  return optionContractSpec({
    symbol: trade.symbol,
    optionType: trade.option?.right,
    strikePrice: trade.option?.strike,
    expirationDate: trade.option?.expiration,
  });
}

/** Contract multiplier for P&L/value (premium is quoted per share). */
export function tradeContractMultiplier(trade: Pick<TradeRowModel, 'tradeType'>): number {
  return trade.tradeType === 'Options' ? DEFAULT_OPTION_MULTIPLIER : 1;
}

export function journalQuoteRequest(trade: QuoteTrade): JournalQuoteRequest | null {
  if (trade.tradeType === 'Options') {
    const contract = journalOptionContract(trade);
    if (!contract) return null; // strike/expiry/right not recorded: no contract to quote
    return { type: 'option', symbol: contract.underlying, key: optionContractKey(contract), url: optionQuoteUrl(contract), contract };
  }
  if (trade.tradeType === 'Futures' || trade.assetClass === 'options') return null;
  if (trade.assetClass !== 'equity' && trade.assetClass !== 'crypto') return null;
  const type = trade.assetClass === 'crypto' ? 'crypto' : 'stock';
  const symbol = type === 'crypto'
    ? trade.symbol.toUpperCase().trim().replace(/[-_/]?(USDT?|USDC|EUR|PERP)$/i, '')
    : trade.symbol.toUpperCase().trim();
  return { type, symbol, key: `${type}:${symbol}`, url: `/api/quote?symbol=${encodeURIComponent(symbol)}&type=${type}&market=USD` };
}

export function parseJournalQuote(raw: any, nowMs = Date.now()): QuoteObservation | null {
  if (!raw?.ok || typeof raw.price !== 'number' || !Number.isFinite(raw.price) || raw.price <= 0) return null;
  const observedMs = raw.observedAt == null ? null : Date.parse(raw.observedAt);
  if (observedMs != null && (!Number.isFinite(observedMs) || observedMs > nowMs + 60_000 || nowMs - observedMs > 15 * 60_000)) return null;
  return { price: raw.price, observedAt: observedMs == null ? null : new Date(observedMs).toISOString(), retrievedAt: new Date(nowMs).toISOString() };
}

/** Option marks are dated per session (EOD unless premium realtime): accept current/previous session, keep the label. */
export function parseJournalOptionQuote(raw: any, nowMs = Date.now()): QuoteObservation | null {
  if (!raw?.ok || typeof raw.price !== 'number' || !Number.isFinite(raw.price) || raw.price <= 0) return null;
  const asOfDate = typeof raw.asOfDate === 'string' ? raw.asOfDate.slice(0, 10) : null;
  if (!asOfDate || !isOptionMarkCurrent(asOfDate, nowMs)) return null;
  return {
    price: raw.price,
    observedAt: null,
    retrievedAt: new Date(nowMs).toISOString(),
    basis: raw.basis === 'REALTIME' ? 'REALTIME' : 'EOD',
    asOfDate,
  };
}

export function parseJournalQuoteFor(request: JournalQuoteRequest, raw: any, nowMs = Date.now()): QuoteObservation | null {
  return request.type === 'option' ? parseJournalOptionQuote(raw, nowMs) : parseJournalQuote(raw, nowMs);
}

export function enrichTradesWithLivePrices(trades: TradeRowModel[], prices: LivePriceMap): TradeRowModel[] {
  return trades.map(trade => {
    if (trade.status !== 'open') return trade;
    const request = journalQuoteRequest(trade);
    const quote = request ? prices[request.key] : undefined;
    if (!quote || trade.entry.price <= 0 || !Number.isFinite(trade.qty) || trade.qty <= 0) return { ...trade, mark: undefined, pnlUsd: undefined, pnlPct: undefined, rMultiple: undefined };
    const direction = trade.side === 'long' ? 1 : -1;
    const multiplier = tradeContractMultiplier(trade);
    const pnlUsd = (quote.price - trade.entry.price) * trade.qty * multiplier * direction;
    return { ...trade, mark: quote, pnlUsd, pnlPct: pnlUsd / (trade.entry.price * trade.qty * multiplier) * 100,
      rMultiple: openRMultiple(trade, pnlUsd, multiplier) };
  });
}

/**
 * Open R in the same units as entry and stop. For options both are premium per share, so a stop on the wrong side
 * of the entry premium (e.g. an underlying-price stop on a long option) cannot be a premium stop → R unavailable.
 */
function openRMultiple(trade: TradeRowModel, pnlUsd: number, multiplier: number): number | undefined {
  if (trade.stop == null || !Number.isFinite(trade.stop)) return undefined;
  if (trade.tradeType === 'Options') {
    const premiumStop = trade.side === 'long' ? trade.stop >= 0 && trade.stop < trade.entry.price : trade.stop > trade.entry.price;
    if (!premiumStop) return undefined;
  }
  const riskPerUnit = Math.abs(trade.entry.price - trade.stop);
  return riskPerUnit > 0 ? pnlUsd / (riskPerUnit * trade.qty * multiplier) : undefined;
}
