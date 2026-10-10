/**
 * The shared daily cache is what scanner, bulk, golden egg, and breakdown read.
 * A warm series must come back without waiting on CoinGecko, even after the minute moves.
 * The bulk warm is the ahead-of-time fill: one markets call, history only for coins not stored.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const redisStore = new Map<string, unknown>();
const redisBox: {
  current: {
    set: (key: string, value: unknown, opts?: { nx?: boolean; ex?: number }) => Promise<string | null>;
    get: (key: string) => Promise<unknown>;
    del: (key: string) => Promise<number>;
  };
} = {
  current: {
    async set(key, value, opts) {
      if (opts?.nx && redisStore.has(key)) return null;
      redisStore.set(key, value);
      return 'OK';
    },
    async get(key) { return redisStore.get(key) ?? null; },
    async del(key) { const had = redisStore.delete(key); return had ? 1 : 0; },
  },
};

vi.mock('@/lib/redis', () => ({ getRedis: () => redisBox.current }));

vi.mock('@/lib/coingecko', () => ({
  getOHLCRange: vi.fn(async (_id: string, _from: number, to: number) => [[to * 1000, 10, 12, 9, 11]]),
  getMarketChartRange: vi.fn(async () => ({ prices: [], market_caps: [], total_volumes: [[Date.parse('2026-10-10T00:00:00Z'), 1_000]] })),
  getMarketData: vi.fn(async (opts: { ids?: string[] }) => (opts?.ids ?? []).map((id) => ({
    id, current_price: 20, high_24h: 21, low_24h: 19, total_volume: 5,
  }))),
  resolveSymbolToId: vi.fn(async (symbol: string) => symbol.toLowerCase()),
  getOHLC: vi.fn(),
}));

import * as cg from '@/lib/coingecko';
import { fetchCryptoSeries, publishSharedOpenQuotes, resetCryptoDailyCacheForTests, warmSharedCryptoSeries } from '@/lib/scanner/cryptoBars';

const NOW = Date.parse('2026-10-10T15:00:00Z');
const coins = Array.from({ length: 30 }, (_, i) => ({ coinId: `coin-${i}` }));

const redisEnv = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] as const;
const defaultRedis = redisBox.current;

afterEach(() => {
  for (const key of redisEnv) delete process.env[key];
  redisStore.clear();
  redisBox.current = defaultRedis;
});

beforeEach(() => {
  vi.mocked(cg.getOHLCRange).mockReset();
  vi.mocked(cg.getMarketChartRange).mockReset();
  vi.mocked(cg.getMarketData).mockReset();
  vi.mocked(cg.getOHLCRange).mockImplementation(async (_id: string, _from: number, to: number) => [[to * 1000, 10, 12, 9, 11]]);
  vi.mocked(cg.getMarketChartRange).mockImplementation(async () => ({ prices: [], market_caps: [], total_volumes: [[Date.parse('2026-10-10T00:00:00Z'), 1_000]] }));
  vi.mocked(cg.getMarketData).mockImplementation(async (opts: { ids?: string[] }) => (opts?.ids ?? []).map((id) => ({
    id, current_price: 20, high_24h: 21, low_24h: 19, total_volume: 5,
  })));
  resetCryptoDailyCacheForTests();
});

it('warms 30 coins with one markets call, then a later page read waits on nothing', async () => {
  const warm = await warmSharedCryptoSeries(coins, NOW);
  expect(warm.marketsCalls).toBe(1);
  expect(warm.historyCoins).toBe(30);
  expect(vi.mocked(cg.getMarketData)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(cg.getMarketData).mock.calls[0][0]?.ids).toHaveLength(30);
  expect(vi.mocked(cg.getOHLCRange).mock.calls.length).toBe(60);
  expect(vi.mocked(cg.getMarketChartRange).mock.calls.length).toBe(30);

  vi.clearAllMocks();
  const again = await warmSharedCryptoSeries(coins, NOW);
  expect(again).toMatchObject({ fromCache: 30, historyCoins: 0, marketsCalls: 0 });
  expect(vi.mocked(cg.getOHLCRange)).not.toHaveBeenCalled();
  expect(vi.mocked(cg.getMarketChartRange)).not.toHaveBeenCalled();
  expect(vi.mocked(cg.getMarketData)).not.toHaveBeenCalled();

  vi.mocked(cg.getMarketData).mockImplementation(() => new Promise(() => undefined));
  vi.mocked(cg.getOHLCRange).mockImplementation(() => new Promise(() => undefined));
  vi.mocked(cg.getMarketChartRange).mockImplementation(() => new Promise(() => undefined));
  const later = NOW + 5 * 60_000;
  const reads = await Promise.race([
    Promise.all(coins.map((coin) => fetchCryptoSeries(coin.coinId, 'daily', later, { coinId: coin.coinId }))),
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('page waited on CoinGecko')), 200)),
  ]);
  expect(reads).toHaveLength(30);
  expect(reads.every((series) => series.bars.length > 0 && series.partialBar?.close === 20 && series.priceStale === false)).toBe(true);
  expect(reads[0].priceLabel).toBe('as of 2026-10-10T15:00:00.000Z');
  expect(vi.mocked(cg.getMarketData)).not.toHaveBeenCalled();
  expect(vi.mocked(cg.getOHLCRange)).not.toHaveBeenCalled();
  expect(vi.mocked(cg.getMarketChartRange)).not.toHaveBeenCalled();
});

it('a wider stored history serves a 2-window read without another history fetch', async () => {
  await warmSharedCryptoSeries([{ coinId: 'bitcoin' }], NOW, { dailyWindows: 6 });
  expect(vi.mocked(cg.getOHLCRange).mock.calls.length).toBe(6);
  vi.clearAllMocks();
  const series = await fetchCryptoSeries('BTC', 'daily', NOW + 60_000, { coinId: 'bitcoin' });
  expect(series.coinId).toBe('bitcoin');
  expect(series.bars.length).toBeGreaterThan(0);
  expect(vi.mocked(cg.getOHLCRange)).not.toHaveBeenCalled();
  expect(vi.mocked(cg.getMarketChartRange)).not.toHaveBeenCalled();
  expect(vi.mocked(cg.getMarketData)).not.toHaveBeenCalled();
});

it('labels an 8h open quote as stale and does not call CoinGecko', async () => {
  await warmSharedCryptoSeries([{ coinId: 'bitcoin' }], NOW);
  vi.clearAllMocks();
  vi.mocked(cg.getMarketData).mockImplementation(() => new Promise(() => undefined));
  vi.mocked(cg.getOHLCRange).mockImplementation(() => new Promise(() => undefined));
  vi.mocked(cg.getMarketChartRange).mockImplementation(() => new Promise(() => undefined));
  const series = await Promise.race([
    fetchCryptoSeries('bitcoin', 'daily', NOW + 8 * 60 * 60_000, { coinId: 'bitcoin' }),
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('page waited on CoinGecko')), 200)),
  ]);
  expect(series.partialBar?.close).toBe(20);
  expect(series.priceStale).toBe(true);
  expect(series.priceAsOf).toBe('2026-10-10T15:00:00.000Z');
  expect(series.priceLabel).toBe('as of 2026-10-10T15:00:00.000Z');
  expect(vi.mocked(cg.getMarketData)).not.toHaveBeenCalled();
  expect(vi.mocked(cg.getOHLCRange)).not.toHaveBeenCalled();
  expect(vi.mocked(cg.getMarketChartRange)).not.toHaveBeenCalled();
});

it('re-reads Redis after the in-memory quote expires and keeps the newer observation', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
  await publishSharedOpenQuotes([{ id: 'bitcoin', current_price: 20, high_24h: 21, low_24h: 19, total_volume: 5 }], NOW);
  const book = redisStore.get('cg:crypto-open:v1') as { quotes: Record<string, { price: number; asOfMs: number }> };
  book.quotes.bitcoin = { ...book.quotes.bitcoin, price: 30, high: 31, low: 29, volume: 8, asOfMs: NOW + 3 * 60_000 };
  await warmSharedCryptoSeries([{ coinId: 'bitcoin' }], NOW);
  vi.clearAllMocks();
  const series = await fetchCryptoSeries('bitcoin', 'daily', NOW + 3 * 60_000, { coinId: 'bitcoin' });
  expect(series.partialBar?.close).toBe(30);
  expect(series.priceStale).toBe(false);
  expect(series.priceLabel).toBe(`as of ${new Date(NOW + 3 * 60_000).toISOString()}`);
  expect(vi.mocked(cg.getMarketData)).not.toHaveBeenCalled();
  expect(series.partialBar).toMatchObject({ open: series.bars.at(-1)?.close, close: 30, volume: 8 });
  expect(series.partialBar!.high).toBeGreaterThanOrEqual(31);
});

it('labels yesterday\'s close when the open quote is missing', async () => {
  vi.mocked(cg.getMarketData).mockResolvedValue(null as never);
  const series = await fetchCryptoSeries('bitcoin', 'daily', NOW, { coinId: 'bitcoin' });
  expect(series.partialBar).toBeNull();
  expect(series.currentPrice).toBe(series.bars.at(-1)?.close);
  expect(series.priceStale).toBe(true);
  expect(series.priceLabel).toBe(`yesterday's close, as of ${series.bars.at(-1)?.t}`);
  expect(series.priceLabel).not.toMatch(/live|score|best/i);
});

it('singleflights ten concurrent cold reads of one coin', async () => {
  const reads = await Promise.all(Array.from({ length: 10 }, () => fetchCryptoSeries('bitcoin', 'daily', NOW, { coinId: 'bitcoin' })));
  expect(vi.mocked(cg.getOHLCRange).mock.calls.length).toBe(2);
  expect(vi.mocked(cg.getMarketChartRange).mock.calls.length).toBe(1);
  expect(vi.mocked(cg.getMarketData).mock.calls.length).toBe(1);
  expect(reads.every((series) => series.partialBar?.close === 20 && series.priceLabel.startsWith('as of '))).toBe(true);
});

it('waits on a busy Redis history lock and does not fetch OHLC once the cache appears', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
  let reads = 0;
  redisBox.current = {
    async set(_key, _value, opts) {
      if (opts?.nx) return null;
      return 'OK';
    },
    async get(key) {
      if (String(key).endsWith(':lock')) return '1';
      reads += 1;
      if (reads < 3) return null;
      return {
        freshUntil: NOW + 86_400_000,
        value: {
          bars: [{ t: '2026-10-09T00:00:00.000Z', open: 10, high: 12, low: 9, close: 11, volume: null }],
          volumes: [[Date.parse('2026-10-09T00:00:00.000Z'), 1_000]],
          warnings: [],
          windows: 2,
        },
      };
    },
    async del() { return 1; },
  };
  const series = await fetchCryptoSeries('bitcoin', 'daily', NOW, { coinId: 'bitcoin' });
  expect(vi.mocked(cg.getOHLCRange)).not.toHaveBeenCalled();
  expect(vi.mocked(cg.getMarketChartRange)).not.toHaveBeenCalled();
  expect(series.bars.at(-1)?.close).toBe(11);
  expect(series.priceLabel.startsWith('as of ')).toBe(true);
});
