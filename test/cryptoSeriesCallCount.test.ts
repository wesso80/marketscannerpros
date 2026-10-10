/**
 * A repeat daily scanner pass must not re-fetch completed days.
 * The open day for every coin in the pass is one /coins/markets call, and a
 * second pass in the same minute reuses that quote.
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
import { fetchCryptoSeries, resetCryptoDailyCacheForTests } from '@/lib/scanner/cryptoBars';

const NOW = Date.parse('2026-10-10T15:00:00Z');
const coins = Array.from({ length: 30 }, (_, i) => `coin-${i}`);

beforeEach(() => {
  vi.clearAllMocks();
  resetCryptoDailyCacheForTests();
});

it('a second scanner pass over 30 coins makes at most one CoinGecko call', async () => {
  const first = await Promise.all(coins.map((id) => fetchCryptoSeries(id, 'daily', NOW, { coinId: id })));
  expect(vi.mocked(cg.getMarketData)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(cg.getMarketData).mock.calls[0][0]?.ids).toHaveLength(30);
  expect(first[0]).toMatchObject({
    coinId: 'coin-0',
    timeframe: 'daily',
    barInterval: '1d',
    hlBasis: 'exchange_ohlc',
    volumeBasis: 'coingecko_daily_total_volume',
    currentPrice: 20,
  });
  expect(first[0].bars.length).toBeGreaterThan(0);
  expect(first[0].partialBar).toMatchObject({ close: 20, open: first[0].bars.at(-1)?.close });
  expect(first.every((series) => series.bars.length > 0 && series.partialBar)).toBe(true);

  vi.clearAllMocks();
  const second = await Promise.all(coins.map((id) => fetchCryptoSeries(id, 'daily', NOW, { coinId: id })));
  const history = vi.mocked(cg.getOHLCRange).mock.calls.length + vi.mocked(cg.getMarketChartRange).mock.calls.length;
  const markets = vi.mocked(cg.getMarketData).mock.calls.length;
  expect(history).toBe(0);
  expect(markets).toBeLessThanOrEqual(1);
  expect(history + markets).toBeLessThanOrEqual(1);
  expect(second.map((series) => series.coinId)).toEqual(coins);
  expect(second[0].partialBar?.close).toBe(20);
});
