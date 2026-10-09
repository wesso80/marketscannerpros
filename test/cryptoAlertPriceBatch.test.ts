import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fetchAlertCryptoQuotes, resolveAlertCryptoSymbol } from '@/lib/alerts/cryptoPriceBatch';
import { resolveScanAsset } from '@/lib/symbols/assetResolution';

describe('alert crypto prices', () => {
  it('keeps CVX an equity collision and does not search', () => {
    const scan = resolveScanAsset({ symbol: 'CVX', market: 'CRYPTO', inCryptoMap: false, equitySymbols: ['CVX'] });
    expect(scan.status).toBe('ambiguous');
    const resolved = resolveAlertCryptoSymbol('CVX', ['CVX', 'AAPL'], { BTC: 'bitcoin' });
    expect(resolved.action).toBe('skip');
    const mapped = resolveAlertCryptoSymbol('CVX', ['CVX'], { CVX: 'convex-finance', BTC: 'bitcoin' });
    expect(mapped.action).toBe('skip');
    if (resolved.action === 'skip') expect(resolved.reason).toMatch(/equity|not priced/i);
    const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const batch = stripComments(readFileSync('lib/alerts/cryptoPriceBatch.ts', 'utf8'));
    const route = stripComments(readFileSync('app/api/alerts/check/route.ts', 'utf8'));
    expect(batch).not.toContain('searchCoins');
    expect(batch).not.toContain('getPriceBySymbol');
    expect(route).not.toContain('getPriceBySymbol');
    expect(route).not.toContain('searchCoins');
  });

  it('skips an unmapped ticker and does not call CoinGecko', async () => {
    const getPrices = vi.fn(async () => ({}));
    const result = await fetchAlertCryptoQuotes(['NOPE'], {
      coinMap: { BTC: 'bitcoin' },
      equitySymbols: [],
      getPrices,
    });
    expect(getPrices).not.toHaveBeenCalled();
    expect(result.calls).toBe(0);
    expect(result.quotes).toEqual({});
    expect(result.skipped).toEqual([{ symbol: 'NOPE', reason: 'NOPE is not in the coin map; not priced' }]);
  });

  it('batches every mapped symbol into one /simple/price call', async () => {
    const symbols = Array.from({ length: 41 }, (_, i) => `C${i}`);
    const coinMap = Object.fromEntries(symbols.map((symbol) => [symbol, symbol.toLowerCase()]));
    const getPrices = vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { usd: 3, usd_24h_change: 1 }])));
    const result = await fetchAlertCryptoQuotes(symbols, { coinMap, equitySymbols: [], getPrices, chunkSize: 100 });
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
    const result = await fetchAlertCryptoQuotes(symbols, { coinMap, equitySymbols: [], getPrices, chunkSize: 100 });
    expect(getPrices).toHaveBeenCalledTimes(2);
    expect(getPrices.mock.calls[0][0]).toHaveLength(100);
    expect(getPrices.mock.calls[1][0]).toHaveLength(1);
    expect(result.calls).toBe(2);
  });
});
