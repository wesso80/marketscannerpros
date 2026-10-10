/**
 * The shared daily cache is what scanner, bulk, golden egg, and breakdown read.
 * A warm series must come back without waiting on CoinGecko, even after the minute moves.
 * The bulk warm is the ahead-of-time fill: one markets call, history only for coins not stored.
 */
import { beforeEach, expect, it, vi } from 'vitest';

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
import { fetchCryptoSeries, resetCryptoDailyCacheForTests, warmSharedCryptoSeries } from '@/lib/scanner/cryptoBars';

const NOW = Date.parse('2026-10-10T15:00:00Z');
const coins = Array.from({ length: 30 }, (_, i) => ({ coinId: `coin-${i}` }));

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
  expect(reads.every((series) => series.bars.length > 0 && series.partialBar?.close === 20)).toBe(true);
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
