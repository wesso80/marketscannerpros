import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  cachedQuoteFor, chunk, fetchWatchlistQuotes, formatQuoteAsOf, normalizeAssetType,
  parseAvExchangeRate, parseAvGlobalQuote, splitFxPair,
} from '@/lib/watchlist/quotes';

const mocks = vi.hoisted(() => ({ ids: vi.fn(), prices: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'ws-1' }) }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));
vi.mock('@/lib/coingecko', () => ({ resolveSymbolToId: mocks.ids, getSimplePrices: mocks.prices }));
import { POST as quotesPOST } from '@/app/api/scanner/quotes/route';

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as unknown as Response;

describe('watchlist pricing helpers', () => {
  it('normalises saved asset types and splits FX pairs', () => {
    expect(normalizeAssetType('crypto')).toBe('crypto');
    expect(normalizeAssetType('forex')).toBe('forex');
    expect(normalizeAssetType('commodity')).toBe('commodity');
    expect(normalizeAssetType('equity')).toBe('equity');
    expect(normalizeAssetType(undefined)).toBe('equity');
    expect(splitFxPair('EURUSD')).toEqual({ from: 'EUR', to: 'USD' });
    expect(splitFxPair('gbp/jpy')).toEqual({ from: 'GBP', to: 'JPY' });
    expect(splitFxPair('AUD')).toEqual({ from: 'AUD', to: 'USD' });
    expect(splitFxPair('EURUSDX1')).toBeNull();
  });

  it('chunks into groups of at most 20', () => {
    const sizes = chunk(Array.from({ length: 45 }, (_, i) => i)).map((c) => c.length);
    expect(sizes).toEqual([20, 20, 5]);
  });

  it('reads the provider time from Alpha Vantage, never the current time', () => {
    expect(parseAvGlobalQuote({ 'Global Quote': { '05. price': '10.5', '09. change': '0.5', '10. change percent': '5.0000%', '07. latest trading day': '2026-09-25' } }))
      .toEqual({ price: 10.5, change: 0.5, changePercent: 5, asOf: '2026-09-25', asOfKind: 'trading_day' });
    expect(parseAvExchangeRate({ 'Realtime Currency Exchange Rate': { '5. Exchange Rate': '1.1000', '6. Last Refreshed': '2026-09-25 17:03:01', '7. Time Zone': 'UTC' } }))
      .toEqual({ price: 1.1, change: null, changePercent: null, asOf: '2026-09-25T17:03:01.000Z', asOfKind: 'timestamp' });
    expect(parseAvGlobalQuote({ Note: 'rate limit' })).toBeNull();
    expect(formatQuoteAsOf({ asOf: '2026-09-25', asOfKind: 'trading_day' })).toBe('trading day 2026-09-25');
    expect(formatQuoteAsOf({ asOf: null, asOfKind: null })).toBeNull();
  });

  it('builds a cached quote from the items API row, marked cached with its stored time', () => {
    expect(cachedQuoteFor({ symbol: 'XYZ', current_price: '12.34', change_percent: '-1.5', quote_fetched_at: '2026-09-25T20:00:00Z' }))
      .toEqual({ symbol: 'XYZ', price: 12.34, change: null, changePercent: -1.5, asOf: '2026-09-25T20:00:00.000Z', asOfKind: 'timestamp', source: 'cached' });
    expect(cachedQuoteFor({ symbol: 'XYZ', current_price: null })).toBeNull();
  });
});

describe('fetchWatchlistQuotes', () => {
  it('prices a 45-symbol list in 3 requests of <= 20, sending each saved asset type', async () => {
    const items = Array.from({ length: 45 }, (_, i) => ({ symbol: `S${i}`, asset_type: i % 3 === 0 ? 'crypto' : i % 3 === 1 ? 'forex' : 'equity' }));
    const bodies: any[] = [];
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      return json({ quotes: body.items.map((i: any) => ({ symbol: i.symbol, price: 1, changePercent: 0.5, asOf: '2026-09-25T00:00:00.000Z', asOfKind: 'timestamp' })) });
    });
    const quotes = await fetchWatchlistQuotes(items, fetchFn as any);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(bodies.map((b) => b.items.length)).toEqual([20, 20, 5]);
    expect(bodies[0].items.slice(0, 3)).toEqual([
      { symbol: 'S0', assetType: 'crypto' }, { symbol: 'S1', assetType: 'forex' }, { symbol: 'S2', assetType: 'equity' },
    ]);
    expect(Object.keys(quotes)).toHaveLength(45);
    expect(quotes.S44).toMatchObject({ source: 'live', asOf: '2026-09-25T00:00:00.000Z' });
  });

  it('routes known commodities to /api/commodities and labels ETF proxies', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.startsWith('/api/commodities?symbol=GOLD')) return json({ commodity: { symbol: 'GOLD', price: 2650, changePercent: 0, date: '2026-09-25', source: 'SPOT' } });
      if (url.startsWith('/api/commodities?symbol=WTI')) return json({ commodity: { symbol: 'WTI', price: 75.2, changePercent: -1.1, date: '2026-09-25', source: 'ETF_PROXY', sourceSymbol: 'USO' } });
      throw new Error(`unexpected ${url}`);
    });
    const quotes = await fetchWatchlistQuotes([{ symbol: 'GOLD', asset_type: 'commodity' }, { symbol: 'WTI', asset_type: 'commodity' }], fetchFn as any);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls.every(([u]) => String(u).startsWith('/api/commodities'))).toBe(true);
    expect(quotes.GOLD).toMatchObject({ price: 2650, asOf: '2026-09-25', asOfKind: 'trading_day', source: 'live' });
    expect(quotes.WTI).toMatchObject({ price: 75.2, note: 'USO ETF proxy' });
  });

  it('falls back to the cached item price when the live quote is missing, and leaves truly unpriced items empty', async () => {
    const fetchFn = vi.fn(async () => json({ quotes: [{ symbol: 'AAA', price: null, error: 'No data' }, { symbol: 'BBB', price: 5, asOf: '2026-09-25', asOfKind: 'trading_day' }] }));
    const updates: number[] = [];
    const quotes = await fetchWatchlistQuotes([
      { symbol: 'AAA', asset_type: 'equity', current_price: 9.5, quote_fetched_at: '2026-09-24T21:00:00Z' },
      { symbol: 'BBB', asset_type: 'equity', current_price: 4 },
      { symbol: 'CCC', asset_type: 'equity' },
    ], fetchFn as any, (q) => updates.push(Object.keys(q).length));
    expect(quotes.AAA).toMatchObject({ price: 9.5, source: 'cached', asOf: '2026-09-24T21:00:00.000Z' });
    expect(quotes.BBB).toMatchObject({ price: 5, source: 'live' });
    expect(quotes.CCC).toBeUndefined();
    expect(updates.length).toBeGreaterThanOrEqual(2);
  });
});

describe('/api/scanner/quotes typed form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
  });

  it('prices crypto via CoinGecko, forex via exchange rate, stocks via GLOBAL_QUOTE, with provider times', async () => {
    mocks.ids.mockImplementation(async (s: string) => (s === 'PEPE' ? 'pepe' : null));
    mocks.prices.mockResolvedValue({ pepe: { usd: 0.00001, usd_24h_change: -4.2, last_updated_at: 1790000000 } });
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes('CURRENCY_EXCHANGE_RATE')) {
        return new Response(JSON.stringify({ 'Realtime Currency Exchange Rate': { '5. Exchange Rate': '1.17', '6. Last Refreshed': '2026-09-25 17:00:00', '7. Time Zone': 'UTC' } }));
      }
      return new Response(JSON.stringify({ 'Global Quote': { '05. price': '230.1', '09. change': '1', '10. change percent': '0.4365%', '07. latest trading day': '2026-09-25' } }));
    }));

    const res = await quotesPOST(new NextRequest('https://example.test/api/scanner/quotes', {
      method: 'POST',
      body: JSON.stringify({ items: [
        { symbol: 'PEPE', assetType: 'crypto' },
        { symbol: 'EURUSD', assetType: 'forex' },
        { symbol: 'AAPL', assetType: 'equity' },
        { symbol: 'NOPE', assetType: 'crypto' },
      ] }),
    }));
    vi.unstubAllGlobals();
    const { quotes } = await res.json();

    expect(quotes.map((q: any) => q.symbol)).toEqual(['PEPE', 'EURUSD', 'AAPL', 'NOPE']);
    expect(quotes[0]).toMatchObject({ assetType: 'crypto', price: 0.00001, changePercent: -4.2, asOf: new Date(1790000000 * 1000).toISOString(), asOfKind: 'timestamp' });
    expect(quotes[1]).toMatchObject({ assetType: 'forex', price: 1.17, asOf: '2026-09-25T17:00:00.000Z' });
    expect(quotes[2]).toMatchObject({ assetType: 'equity', price: 230.1, asOf: '2026-09-25', asOfKind: 'trading_day' });
    expect(quotes[3]).toMatchObject({ price: null, error: 'Unknown coin' });
    // Crypto never hits the stock lookup (no same-ticker stock prices for coins).
    expect(urls.some((u) => u.includes('GLOBAL_QUOTE') && u.includes('symbol=PEPE'))).toBe(false);
    expect(urls.some((u) => u.includes('from_currency=EUR&to_currency=USD'))).toBe(true);
  });

  it('keeps the 20-per-request cap', async () => {
    mocks.ids.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}))));
    const items = Array.from({ length: 25 }, (_, i) => ({ symbol: `T${i}`, assetType: 'equity' }));
    const { quotes } = await (await quotesPOST(new NextRequest('https://example.test/api/scanner/quotes', { method: 'POST', body: JSON.stringify({ items }) }))).json();
    vi.unstubAllGlobals();
    expect(quotes).toHaveLength(20);
  });
});
