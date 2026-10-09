import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { COINGECKO_ID_MAP } from '@/lib/coingecko';
import {
  PRICE_UNAVAILABLE,
  alertSymbolKey,
  fetchAlertCryptoQuotes,
  mapAlertCoinId,
  pickAlertSearchId,
  type SearchCoin,
} from '@/lib/alerts/cryptoPriceBatch';
import { resolveScanAsset } from '@/lib/symbols/assetResolution';

function memoryCache() {
  const rows = new Map<string, string | null>();
  return {
    rows,
    cache: {
      get: async (symbol: string) => (rows.has(symbol) ? rows.get(symbol) : undefined),
      set: async (symbol: string, id: string | null) => {
        rows.set(symbol, id);
      },
    },
  };
}

function exactCoin(symbol: string, rank = 20): SearchCoin {
  return { id: `${symbol.toLowerCase()}-id`, name: symbol, symbol, market_cap_rank: rank };
}

describe('alert crypto prices', () => {
  it('keeps CVX an equity collision and does not search', async () => {
    const scan = resolveScanAsset({ symbol: 'CVX', market: 'CRYPTO', inCryptoMap: false, equitySymbols: ['CVX'] });
    expect(scan.status).toBe('ambiguous');
    const search = vi.fn(async () => ({ coins: [exactCoin('CVX', 1)] }));
    const getPrices = vi.fn(async () => ({}));
    const result = await fetchAlertCryptoQuotes(['CVX'], {
      coinMap: { CVX: 'convex-finance', BTC: 'bitcoin' },
      equitySymbols: ['CVX', 'AAPL'],
      search,
      getPrices,
      cache: memoryCache().cache,
    });
    expect(search).not.toHaveBeenCalled();
    expect(getPrices).not.toHaveBeenCalled();
    expect(result.calls).toBe(0);
    expect(result.quotes).toEqual({});
    expect(result.skipped).toEqual([
      expect.objectContaining({ symbol: 'CVX', reason: PRICE_UNAVAILABLE }),
    ]);
    const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const route = stripComments(readFileSync('app/api/alerts/check/route.ts', 'utf8'));
    expect(route).not.toContain('getPriceBySymbol');
    expect(route).not.toContain('searchCoins');
    expect(PRICE_UNAVAILABLE).toBe('Price unavailable for this symbol');
  });

  it('prices the live alert list in one batch and searches each uncached coin once', async () => {
    const symbols = ['BTC-USD', 'BNB-USD', 'NEAR-USD', 'XLM-USD', 'SNX-USD', 'AKT-USD', 'COMP', 'NEO', 'RPL', 'ORCA'];
    const keys = symbols.map(alertSymbolKey);
    const unmapped = keys.filter((key) => !COINGECKO_ID_MAP[key]);
    expect(unmapped.sort()).toEqual(['COMP', 'NEO', 'ORCA', 'RPL', 'SNX']);
    expect(COINGECKO_ID_MAP.BTC).toBe('bitcoin');
    expect(COINGECKO_ID_MAP.AKT).toBe('akash-network');
    const search = vi.fn(async (symbol: string) => ({ coins: [exactCoin(symbol)] }));
    const getPrices = vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { usd: 2, usd_24h_change: 1 }])));
    const store = memoryCache();
    const first = await fetchAlertCryptoQuotes(symbols, {
      equitySymbols: ['CVX', 'AAPL'],
      search,
      getPrices,
      cache: store.cache,
    });
    expect(first.calls).toBe(1);
    expect(first.searches).toBe(unmapped.length);
    expect(getPrices.mock.calls[0][0]).toHaveLength(symbols.length);
    expect(Object.keys(first.quotes).sort()).toEqual(keys.slice().sort());
    expect(first.skipped).toEqual([]);
    expect(first.quotes.BTC.price).toBe(2);
    expect(first.quotes.SNX.price).toBe(2);

    getPrices.mockClear();
    const second = await fetchAlertCryptoQuotes(symbols, {
      equitySymbols: ['CVX', 'AAPL'],
      search,
      getPrices,
      cache: store.cache,
    });
    expect(second.searches).toBe(0);
    expect(search).toHaveBeenCalledTimes(unmapped.length);
    expect(second.calls).toBe(1);
    expect(Object.keys(second.quotes)).toHaveLength(symbols.length);
  });

  it('marks coins missing from a partial batch unpriced and still prices the rest', async () => {
    const getPrices = vi.fn(async (ids: string[]) => {
      const out: Record<string, { usd: number; usd_24h_change: number }> = {};
      for (const id of ids) {
        if (id === 'bitcoin') out[id] = { usd: 100, usd_24h_change: 1 };
      }
      return out;
    });
    const result = await fetchAlertCryptoQuotes(['BTC-USD', 'BNB-USD', 'XLM'], {
      equitySymbols: [],
      search: vi.fn(),
      getPrices,
      cache: memoryCache().cache,
    });
    expect(result.calls).toBe(1);
    expect(result.quotes.BTC).toEqual({ price: 100, change24h: 1 });
    expect(result.quotes.BNB).toBeUndefined();
    expect(result.quotes.XLM).toBeUndefined();
    expect(result.skipped.map((row) => row.symbol).sort()).toEqual(['BNB', 'XLM']);
    expect(result.skipped.every((row) => row.reason === PRICE_UNAVAILABLE)).toBe(true);
  });

  it('marks the whole chunk unpriced when the batch price call fails', async () => {
    const failing = await fetchAlertCryptoQuotes(['BTC-USD', 'ETH'], {
      coinMap: { BTC: 'bitcoin', ETH: 'ethereum' },
      equitySymbols: [],
      getPrices: async () => {
        throw new Error('429');
      },
      search: vi.fn(),
      cache: memoryCache().cache,
    });
    expect(failing.calls).toBe(1);
    expect(failing.quotes).toEqual({});
    expect(failing.skipped.map((row) => row.symbol).sort()).toEqual(['BTC', 'ETH']);
    expect(failing.skipped.every((row) => row.reason === PRICE_UNAVAILABLE)).toBe(true);

    const empty = await fetchAlertCryptoQuotes(['BTC'], {
      coinMap: { BTC: 'bitcoin' },
      equitySymbols: [],
      getPrices: async () => null,
      search: vi.fn(),
      cache: memoryCache().cache,
    });
    expect(empty.quotes).toEqual({});
    expect(empty.skipped[0].reason).toBe(PRICE_UNAVAILABLE);
  });

  it('maps FTM and MATIC to their current ids for alerts only', () => {
    expect(mapAlertCoinId('FTM-USD', [], COINGECKO_ID_MAP)).toEqual({ action: 'price', symbol: 'FTM', coinId: 'sonic' });
    expect(mapAlertCoinId('MATIC', [], COINGECKO_ID_MAP)).toMatchObject({ action: 'price', coinId: 'polygon-ecosystem-token' });
    expect(COINGECKO_ID_MAP.FTM).toBe('fantom');
    expect(COINGECKO_ID_MAP.MATIC).toBe('matic-network');
    const outcome = readFileSync('lib/symbols/assetResolution.ts', 'utf8');
    expect(outcome).not.toContain('sonic');
    expect(outcome).not.toContain('polygon-ecosystem-token');
    expect(pickAlertSearchId('SNX', [
      { id: 'a', name: 'A', symbol: 'SNX', market_cap_rank: 4 },
      { id: 'b', name: 'B', symbol: 'SNX', market_cap_rank: 4 },
    ])).toBeNull();
    expect(pickAlertSearchId('SNX', [
      { id: 'synthetix-network-token', name: 'Synthetix', symbol: 'SNX', market_cap_rank: 80 },
      { id: 'noise', name: 'Noise', symbol: 'SNX', market_cap_rank: 900 },
    ])).toBe('synthetix-network-token');
  });

  it('batches every mapped symbol into one /simple/price call', async () => {
    const symbols = Array.from({ length: 41 }, (_, i) => `C${i}`);
    const coinMap = Object.fromEntries(symbols.map((symbol) => [symbol, symbol.toLowerCase()]));
    const getPrices = vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { usd: 3, usd_24h_change: 1 }])));
    const result = await fetchAlertCryptoQuotes(symbols, { coinMap, equitySymbols: [], getPrices, chunkSize: 100, search: vi.fn(), cache: memoryCache().cache });
    expect(getPrices).toHaveBeenCalledTimes(1);
    expect(getPrices.mock.calls[0][0]).toHaveLength(41);
    expect(result.calls).toBe(1);
    expect(Object.keys(result.quotes)).toHaveLength(41);
    expect(result.skipped).toEqual([]);
  });

  it('chunks a list longer than 100 into two calls', async () => {
    const symbols = Array.from({ length: 101 }, (_, i) => `C${i}`);
    const coinMap = Object.fromEntries(symbols.map((symbol) => [symbol, symbol.toLowerCase()]));
    const getPrices = vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { usd: 1, usd_24h_change: 0 }])));
    const result = await fetchAlertCryptoQuotes(symbols, { coinMap, equitySymbols: [], getPrices, chunkSize: 100, search: vi.fn(), cache: memoryCache().cache });
    expect(getPrices).toHaveBeenCalledTimes(2);
    expect(getPrices.mock.calls[0][0]).toHaveLength(100);
    expect(getPrices.mock.calls[1][0]).toHaveLength(1);
    expect(result.calls).toBe(2);
  });

  it('returns before reading prices when the symbol list is empty', async () => {
    const getPrices = vi.fn();
    const search = vi.fn();
    const result = await fetchAlertCryptoQuotes([], { getPrices, search });
    expect(result).toEqual({ quotes: {}, skipped: [], calls: 0, searches: 0 });
    expect(getPrices).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });
});
