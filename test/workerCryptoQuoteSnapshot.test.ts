/**
 * One /coins/markets call per 250 coins replaces a /simple/price call per coin per tier refresh; the quote written to
 * quotes_latest / Redis keeps the exact shape of the old simple/price quote.
 */
import { describe, expect, it, vi } from 'vitest';
import type { CoinGeckoMarketData } from '@/lib/coingecko';
import { buildObservedCryptoQuote, buildObservedCryptoQuoteFromMarket, fetchCryptoQuoteSnapshot } from '@/lib/worker/cryptoQuote';

const NOW = Date.parse('2026-09-27T02:00:00Z');
const row = (id: string, over: Partial<CoinGeckoMarketData> = {}): CoinGeckoMarketData => ({
  id, symbol: id.slice(0, 3), name: id, current_price: 110, market_cap: 1, market_cap_rank: 1,
  price_change_percentage_24h: 10, price_change_24h: 10, total_volume: 1234, high_24h: 120, low_24h: 100,
  circulating_supply: 1, total_supply: 1, last_updated: new Date(NOW - 30_000).toISOString(), ...over,
});

describe('buildObservedCryptoQuoteFromMarket', () => {
  it('produces the same quote as the simple/price path (only the source label differs)', () => {
    const fromMarket = buildObservedCryptoQuoteFromMarket(row('bitcoin'), NOW);
    const fromSimple = buildObservedCryptoQuote({ usd: 110, usd_24h_change: 10, usd_24h_vol: 1234, last_updated_at: (NOW - 30_000) / 1000 }, NOW);
    expect(fromMarket).toEqual({ ...fromSimple, source: 'coingecko_markets' });
    expect(fromMarket).toMatchObject({ price: 110, open: null, high: null, low: null, volume: 1234, changePct: 10 });
    expect(fromMarket!.prevClose).toBeCloseTo(100, 10);
  });
  it('applies the same staleness / validity rules', () => {
    expect(buildObservedCryptoQuoteFromMarket(row('x', { last_updated: new Date(NOW - 16 * 60_000).toISOString() }), NOW)).toBeNull();
    expect(buildObservedCryptoQuoteFromMarket(row('x', { last_updated: undefined }), NOW)).toBeNull();
    expect(buildObservedCryptoQuoteFromMarket(row('x', { current_price: 0 }), NOW)).toBeNull();
    expect(buildObservedCryptoQuoteFromMarket(row('x', { total_volume: null }), NOW)).toMatchObject({ volume: null });
    expect(buildObservedCryptoQuoteFromMarket(undefined, NOW)).toBeNull();
  });
});

describe('fetchCryptoQuoteSnapshot', () => {
  it('quotes 100 coins in ONE call (was 100 simple/price calls), sharing a quote between alias tickers', async () => {
    const symbols = Array.from({ length: 100 }, (_, i) => ({ symbol: `C${i}`, coinId: `coin-${i}` }));
    symbols.push({ symbol: 'POL', coinId: 'coin-0' }); // alias of C0
    const getMarkets = vi.fn(async (ids: string[]) => ids.map((id) => row(id)));
    const snap = await fetchCryptoQuoteSnapshot(symbols, getMarkets, NOW);
    expect(getMarkets).toHaveBeenCalledTimes(1);
    expect(getMarkets.mock.calls[0][0]).toHaveLength(100);
    expect(snap.calls).toBe(1);
    expect(snap.quotes.size).toBe(101);
    expect(snap.quotes.get('POL')).toEqual(snap.quotes.get('C0'));
    expect(snap.missing).toEqual([]);
  });
  it('chunks at 250 ids per call and reports coins without a usable quote', async () => {
    const symbols = Array.from({ length: 260 }, (_, i) => ({ symbol: `C${i}`, coinId: `coin-${i}` }));
    const getMarkets = vi.fn(async (ids: string[]) => ids.filter((id) => id !== 'coin-5').map((id) => row(id)));
    const snap = await fetchCryptoQuoteSnapshot(symbols, getMarkets, NOW);
    expect(getMarkets.mock.calls.map((c) => c[0].length)).toEqual([250, 10]);
    expect(snap.calls).toBe(2);
    expect(snap.missing).toEqual(['C5']);
  });
  it('a failed chunk leaves its coins missing (the worker falls back to simple/price for those only)', async () => {
    const snap = await fetchCryptoQuoteSnapshot([{ symbol: 'BTC', coinId: 'bitcoin' }], vi.fn(async () => { throw new Error('429'); }), NOW);
    expect(snap).toMatchObject({ calls: 1, missing: ['BTC'] });
    expect(snap.quotes.size).toBe(0);
  });
});

describe('ingest worker wiring (source guard)', () => {
  it('uses one markets snapshot per cycle and the held daily history instead of per-refresh fetches', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../worker/ingest-data.ts', import.meta.url), 'utf8');
    const cycle = src.slice(src.indexOf('async function runIngestionCycle('), src.indexOf('async function main('));
    expect(cycle).toContain('refreshCryptoQuoteSnapshot(cryptoSymbols)');
    expect(src).toContain('getCryptoDailyHistory().getBars(symbol, coinId)');
    expect(src).not.toContain('WORKER_CG_CACHE_TTL_MS');
    // simple/price is only the fallback for a coin missing from the snapshot
    const crypto = src.slice(src.indexOf('async function processCryptoSymbol('), src.indexOf('async function runIngestionCycle('));
    expect(crypto.indexOf('cryptoQuoteSnapshot?.quotes.get')).toBeGreaterThan(-1);
    expect(crypto.indexOf('cryptoQuoteSnapshot?.quotes.get')).toBeLessThan(crypto.indexOf('getSimplePrices('));
  });
});
