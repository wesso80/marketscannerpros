import type { CoinGeckoMarketData, CoinGeckoPrice } from '@/lib/coingecko';

export type ObservedCryptoQuote = NonNullable<ReturnType<typeof buildObservedCryptoQuote>>;

/** A completed daily candle is not a current quote. Use provider-stamped spot data. */
export function buildObservedCryptoQuote(point: CoinGeckoPrice | undefined, nowMs = Date.now(), source = 'coingecko_simple_price') {
  if (!point || !Number.isFinite(point.usd) || point.usd <= 0 || !point.last_updated_at ||
      nowMs - point.last_updated_at * 1000 > 15 * 60_000 || point.last_updated_at * 1000 > nowMs + 60_000) return null;
  const changePct = typeof point.usd_24h_change === 'number' && Number.isFinite(point.usd_24h_change) && point.usd_24h_change > -100
    ? point.usd_24h_change : null;
  const prevClose = changePct === null ? null : point.usd / (1 + changePct / 100);
  const updatedAt = new Date(point.last_updated_at * 1000).toISOString();
  return {
    price: point.usd, open: null, high: null, low: null, prevClose,
    volume: typeof point.usd_24h_vol === 'number' && Number.isFinite(point.usd_24h_vol) && point.usd_24h_vol >= 0 ? point.usd_24h_vol : null,
    changeAmt: prevClose === null ? null : point.usd - prevClose, changePct,
    latestDay: updatedAt.slice(0, 10), updatedAt, source,
  };
}

/**
 * The same observed quote from a `/coins/markets` row (one call covers up to 250 coins) instead of a per-coin
 * `/simple/price` call. Field mapping: current_price → usd, price_change_percentage_24h → usd_24h_change,
 * total_volume → usd_24h_vol, last_updated (ISO) → last_updated_at. The quote shape is identical; only `source` differs.
 */
export function buildObservedCryptoQuoteFromMarket(row: CoinGeckoMarketData | undefined, nowMs = Date.now()) {
  if (!row) return null;
  const updatedMs = row.last_updated ? Date.parse(row.last_updated) : Number.NaN;
  const point: CoinGeckoPrice = {
    usd: row.current_price,
    ...(typeof row.price_change_percentage_24h === 'number' ? { usd_24h_change: row.price_change_percentage_24h } : {}),
    ...(typeof row.total_volume === 'number' ? { usd_24h_vol: row.total_volume } : {}),
    ...(Number.isFinite(updatedMs) ? { last_updated_at: updatedMs / 1000 } : {}),
  };
  return buildObservedCryptoQuote(point, nowMs, 'coingecko_markets');
}

export const MARKETS_IDS_PER_CALL = 250;

export interface CryptoQuoteSnapshot {
  /** Symbol (upper-case) → observed quote. */
  quotes: Map<string, ObservedCryptoQuote>;
  /** CoinGecko calls made (one per 250 coin ids). */
  calls: number;
  /** Symbols with a coin id but no usable quote in the response (stale, missing or failed chunk). */
  missing: string[];
  fetchedAt: number;
}

/**
 * One `/coins/markets?ids=…&precision=full` call per 250 coins gives every crypto consumer in the worker a spot quote
 * for the cycle. Several tickers may share a coin id (aliases); each gets the quote.
 */
export async function fetchCryptoQuoteSnapshot(
  symbols: Array<{ symbol: string; coinId: string }>,
  getMarkets: (ids: string[]) => Promise<CoinGeckoMarketData[] | null>,
  nowMs = Date.now(),
): Promise<CryptoQuoteSnapshot> {
  const byId = new Map<string, string[]>();
  for (const { symbol, coinId } of symbols) {
    if (!coinId) continue;
    const list = byId.get(coinId) ?? [];
    if (!list.includes(symbol.toUpperCase())) list.push(symbol.toUpperCase());
    byId.set(coinId, list);
  }
  const ids = [...byId.keys()];
  const quotes = new Map<string, ObservedCryptoQuote>();
  let calls = 0;
  for (let i = 0; i < ids.length; i += MARKETS_IDS_PER_CALL) {
    const chunk = ids.slice(i, i + MARKETS_IDS_PER_CALL);
    calls++;
    let rows: CoinGeckoMarketData[] | null = null;
    try { rows = await getMarkets(chunk); } catch { rows = null; }
    for (const row of rows ?? []) {
      const quote = buildObservedCryptoQuoteFromMarket(row, nowMs);
      if (!quote) continue;
      for (const symbol of byId.get(row.id) ?? []) quotes.set(symbol, quote);
    }
  }
  const missing = [...byId.values()].flat().filter((s) => !quotes.has(s));
  return { quotes, calls, missing, fetchedAt: nowMs };
}
