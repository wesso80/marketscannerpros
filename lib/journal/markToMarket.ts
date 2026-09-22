import type { TradeRowModel } from '@/types/journal';

export type QuoteObservation = { price: number; observedAt: string | null; retrievedAt: string };
export type LivePriceMap = Record<string, QuoteObservation>;

export function journalQuoteRequest(trade: Pick<TradeRowModel, 'symbol' | 'assetClass' | 'tradeType'>) {
  if (trade.tradeType === 'Options' || trade.tradeType === 'Futures' || trade.assetClass === 'options') return null;
  if (trade.assetClass !== 'equity' && trade.assetClass !== 'crypto') return null;
  const type = trade.assetClass === 'crypto' ? 'crypto' : 'stock';
  const symbol = type === 'crypto'
    ? trade.symbol.toUpperCase().trim().replace(/[-_/]?(USDT?|USDC|EUR|PERP)$/i, '')
    : trade.symbol.toUpperCase().trim();
  return { type, symbol, key: `${type}:${symbol}` };
}

export function parseJournalQuote(raw: any, nowMs = Date.now()): QuoteObservation | null {
  if (!raw?.ok || typeof raw.price !== 'number' || !Number.isFinite(raw.price) || raw.price <= 0) return null;
  const observedMs = raw.observedAt == null ? null : Date.parse(raw.observedAt);
  if (observedMs != null && (!Number.isFinite(observedMs) || observedMs > nowMs + 60_000 || nowMs - observedMs > 15 * 60_000)) return null;
  return { price: raw.price, observedAt: observedMs == null ? null : new Date(observedMs).toISOString(), retrievedAt: new Date(nowMs).toISOString() };
}

export function enrichTradesWithLivePrices(trades: TradeRowModel[], prices: LivePriceMap): TradeRowModel[] {
  return trades.map(trade => {
    if (trade.status !== 'open') return trade;
    const request = journalQuoteRequest(trade);
    const quote = request ? prices[request.key] : undefined;
    if (!quote || trade.entry.price <= 0 || !Number.isFinite(trade.qty) || trade.qty <= 0) return { ...trade, mark: undefined, pnlUsd: undefined, pnlPct: undefined, rMultiple: undefined };
    const direction = trade.side === 'long' ? 1 : -1;
    const pnlUsd = (quote.price - trade.entry.price) * trade.qty * direction;
    const riskPerUnit = trade.stop == null ? 0 : Math.abs(trade.entry.price - trade.stop);
    return { ...trade, mark: quote, pnlUsd, pnlPct: pnlUsd / (trade.entry.price * trade.qty) * 100,
      rMultiple: riskPerUnit > 0 ? pnlUsd / (riskPerUnit * trade.qty) : undefined };
  });
}
