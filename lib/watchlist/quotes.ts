/**
 * Watchlist pricing helpers (pure; safe to import from client and server).
 *
 * - Each item is priced by its saved asset type (crypto / forex / commodity / equity).
 * - Requests to /api/scanner/quotes are split into chunks of at most 20 (its per-request cap).
 * - Commodities go to /api/commodities (the repo's existing commodity path).
 * - When no live quote comes back, the cached price already returned by
 *   /api/watchlists/items is used and marked as cached.
 * - "Updated" is the quote's own time (provider timestamp or trading day), never "now".
 */

export type WatchlistAssetType = 'equity' | 'crypto' | 'forex' | 'commodity';

export const QUOTES_CHUNK_SIZE = 20;

export interface WatchlistQuote {
  symbol: string;
  price: number;
  change: number | null;
  changePercent: number | null;
  /** ISO timestamp, or YYYY-MM-DD when only a trading day is known; null when unknown. */
  asOf: string | null;
  asOfKind: 'timestamp' | 'trading_day' | null;
  /** 'live' = fetched now from the provider; 'cached' = last stored price from the database. */
  source: 'live' | 'cached';
  /** Extra honesty note, e.g. "USO ETF proxy". */
  note?: string;
}

export interface PricedItem {
  symbol: string;
  asset_type?: string | null;
  current_price?: number | string | null;
  change_percent?: number | string | null;
  quote_fetched_at?: string | null;
  quote_trading_day?: string | null;
}

/** Commodity symbols /api/commodities knows (keys of its COMMODITIES table). */
export const KNOWN_COMMODITIES = new Set([
  'WTI', 'BRENT', 'NATURAL_GAS', 'GOLD', 'SILVER', 'COPPER', 'ALUMINUM',
  'WHEAT', 'CORN', 'COTTON', 'SUGAR', 'COFFEE',
]);

export function normalizeAssetType(raw: string | null | undefined): WatchlistAssetType {
  const t = String(raw ?? '').trim().toLowerCase();
  if (t === 'crypto' || t === 'cryptocurrency') return 'crypto';
  if (t === 'forex' || t === 'fx' || t === 'currency') return 'forex';
  if (t === 'commodity' || t === 'commodities') return 'commodity';
  return 'equity';
}

export function chunk<T>(arr: T[], size = QUOTES_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
}

/** "EURUSD", "EUR/USD", "EUR-USD" -> { from: 'EUR', to: 'USD' }; "EUR" -> EUR/USD. */
export function splitFxPair(symbol: string): { from: string; to: string } | null {
  const s = symbol.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length === 6) return { from: s.slice(0, 3), to: s.slice(3) };
  if (s.length === 3) return { from: s, to: 'USD' };
  return null;
}

/** Alpha Vantage GLOBAL_QUOTE -> price/change and the trading day it belongs to. */
export function parseAvGlobalQuote(data: unknown): Omit<WatchlistQuote, 'symbol' | 'source'> | null {
  const d = (data ?? {}) as Record<string, any>;
  const gq = d['Global Quote'] || d['Global Quote - DATA DELAYED BY 15 MINUTES'];
  const price = num(gq?.['05. price']);
  if (price == null || price <= 0) return null;
  const day = typeof gq?.['07. latest trading day'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(gq['07. latest trading day'])
    ? gq['07. latest trading day']
    : null;
  return {
    price,
    change: num(gq?.['09. change']),
    changePercent: num(gq?.['10. change percent']),
    asOf: day,
    asOfKind: day ? 'trading_day' : null,
  };
}

/** Alpha Vantage CURRENCY_EXCHANGE_RATE -> rate and its "Last Refreshed" time. */
export function parseAvExchangeRate(data: unknown): Omit<WatchlistQuote, 'symbol' | 'source'> | null {
  const d = (data ?? {}) as Record<string, any>;
  const r = d['Realtime Currency Exchange Rate'];
  const price = num(r?.['5. Exchange Rate']);
  if (price == null || price <= 0) return null;
  let asOf: string | null = null;
  const refreshed = r?.['6. Last Refreshed'];
  const tz = String(r?.['7. Time Zone'] ?? '').toUpperCase();
  if (typeof refreshed === 'string' && (tz === 'UTC' || tz === '')) {
    const t = Date.parse(`${refreshed.replace(' ', 'T')}Z`);
    if (Number.isFinite(t)) asOf = new Date(t).toISOString();
  }
  return { price, change: null, changePercent: null, asOf, asOfKind: asOf ? 'timestamp' : null };
}

/** Cached price from /api/watchlists/items (quotes_latest), marked as cached. */
export function cachedQuoteFor(item: PricedItem): WatchlistQuote | null {
  const price = num(item.current_price);
  if (price == null || price <= 0) return null;
  const fetched = item.quote_fetched_at && Number.isFinite(Date.parse(item.quote_fetched_at))
    ? new Date(item.quote_fetched_at).toISOString()
    : null;
  const day = !fetched && item.quote_trading_day ? String(item.quote_trading_day).slice(0, 10) : null;
  return {
    symbol: item.symbol,
    price,
    change: null,
    changePercent: num(item.change_percent),
    asOf: fetched ?? day,
    asOfKind: fetched ? 'timestamp' : day ? 'trading_day' : null,
    source: 'cached',
  };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function toLiveQuote(raw: any): WatchlistQuote | null {
  const price = num(raw?.price);
  if (!raw?.symbol || price == null || price <= 0) return null;
  const asOf = typeof raw.asOf === 'string' ? raw.asOf : null;
  return {
    symbol: String(raw.symbol),
    price,
    change: num(raw.change),
    changePercent: num(raw.changePercent),
    asOf,
    asOfKind: asOf ? (raw.asOfKind === 'trading_day' ? 'trading_day' : 'timestamp') : null,
    source: 'live',
  };
}

async function fetchCommodityQuotes(symbols: string[], fetchFn: FetchLike): Promise<Record<string, WatchlistQuote>> {
  const out: Record<string, WatchlistQuote> = {};
  const fromRow = (c: any): WatchlistQuote | null => {
    const price = num(c?.price);
    if (!c?.symbol || price == null || price <= 0) return null;
    const day = typeof c.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : null;
    return {
      symbol: String(c.symbol),
      price,
      change: num(c.change),
      changePercent: num(c.changePercent),
      asOf: day,
      asOfKind: day ? 'trading_day' : null,
      source: 'live',
      note: c.source === 'ETF_PROXY' && c.sourceSymbol ? `${c.sourceSymbol} ETF proxy` : c.freshnessStatus === 'STALE' ? 'stale' : undefined,
    };
  };
  // /api/commodities allows 5 requests/min per IP: ask per symbol for a few, otherwise fetch the whole table once.
  if (symbols.length <= 3) {
    for (const s of symbols) {
      try {
        const res = await fetchFn(`/api/commodities?symbol=${encodeURIComponent(s)}`);
        if (!res.ok) continue;
        const q = fromRow((await res.json())?.commodity);
        if (q) out[s] = q;
      } catch { /* leave unpriced; cached fallback applies */ }
    }
  } else {
    try {
      const res = await fetchFn('/api/commodities');
      if (res.ok) {
        for (const c of (await res.json())?.commodities ?? []) {
          const q = fromRow(c);
          if (q && symbols.includes(q.symbol)) out[q.symbol] = q;
        }
      }
    } catch { /* cached fallback applies */ }
  }
  return out;
}

/**
 * Price every item: scanner quotes in chunks of <= 20 (with asset types), commodities via
 * /api/commodities, then cached prices for anything still missing. `onUpdate` receives the
 * quotes gathered so far after each step, so long lists fill in progressively.
 */
export async function fetchWatchlistQuotes(
  items: PricedItem[],
  fetchFn: FetchLike = (input, init) => fetch(input, init),
  onUpdate?: (quotes: Record<string, WatchlistQuote>) => void,
): Promise<Record<string, WatchlistQuote>> {
  const quotes: Record<string, WatchlistQuote> = {};
  const seen = new Set<string>();
  const unique = items.filter((i) => i?.symbol && !seen.has(i.symbol) && seen.add(i.symbol));

  const commodity = unique.filter((i) => normalizeAssetType(i.asset_type) === 'commodity' && KNOWN_COMMODITIES.has(i.symbol.toUpperCase()));
  const viaScanner = unique.filter((i) => normalizeAssetType(i.asset_type) !== 'commodity');

  for (const group of chunk(viaScanner, QUOTES_CHUNK_SIZE)) {
    try {
      const res = await fetchFn('/api/scanner/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: group.map((i) => ({ symbol: i.symbol, assetType: normalizeAssetType(i.asset_type) })) }),
      });
      if (res.ok) {
        const data = await res.json();
        for (const raw of data?.quotes ?? []) {
          const q = toLiveQuote(raw);
          if (q) quotes[q.symbol] = q;
        }
      }
    } catch { /* this chunk stays unpriced; cached fallback applies */ }
    onUpdate?.({ ...quotes });
  }

  if (commodity.length > 0) {
    Object.assign(quotes, await fetchCommodityQuotes(commodity.map((i) => i.symbol.toUpperCase()), fetchFn));
  }

  for (const item of unique) {
    if (quotes[item.symbol]) continue;
    const cached = cachedQuoteFor(item);
    if (cached) quotes[item.symbol] = cached;
  }
  onUpdate?.({ ...quotes });
  return quotes;
}

/** Label for the "Updated" line: the quote's own time, or null when unknown. */
export function formatQuoteAsOf(q: Pick<WatchlistQuote, 'asOf' | 'asOfKind'> | null | undefined): string | null {
  if (!q?.asOf) return null;
  if (q.asOfKind === 'trading_day') return `trading day ${q.asOf}`;
  const t = Date.parse(q.asOf);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleString();
}
