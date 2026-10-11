import { beforeEach, expect, it, vi } from 'vitest';
import { displayedBreadth } from '@/lib/cryptoReviewData';
import { breadthInputsFromTrending, rememberBreadthSnapshot, resetBreadthMemory } from '@/lib/crypto/breadthSnapshot';

const h = vi.hoisted(() => ({
  prices: {} as Record<string, { usd: number; usd_24h_change: number; usd_market_cap: number; last_updated_at: number }>,
  trending: null as any,
}));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'pro-workspace' }) }));
vi.mock('@/lib/coingecko', () => ({
  getTrendingCoins: async () => h.trending,
  getSimplePrices: async () => h.prices,
  buildCoinGeckoResponseMeta: () => ({ lastUpdated: '2026-10-11T01:02:00.000Z', provider: 'CoinGecko', freshnessStatus: 'fresh' }),
}));

function trendingSnapshot(up: number) {
  const coins = Array.from({ length: 10 }, (_, i) => ({
    item: {
      id: `coin-${i}`,
      name: `Coin ${i}`,
      symbol: `c${i}`,
      market_cap_rank: i + 1,
      thumb: '', small: '', large: '', slug: `coin-${i}`, price_btc: 0, score: i,
      data: { price: 1, price_change_percentage_24h: { usd: i < up ? 1 : -1 }, market_cap: '1', total_volume: '1', sparkline: '' },
    },
  }));
  const categories = Array.from({ length: 5 }, (_, i) => ({ id: i, name: `Cat ${i}`, market_cap_1h_change: 1 }));
  return { coins, categories };
}

beforeEach(() => {
  resetBreadthMemory();
  h.trending = trendingSnapshot(5);
  h.prices = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`coin-${i}`, { usd: 1, usd_24h_change: 9, usd_market_cap: 1, last_updated_at: 1_700_000_000 + i }]));
});

it('keeps one breadth percent and as-of when live 24h signs flip inside the same trending snapshot', async () => {
  const { GET } = await import('@/app/api/crypto/trending/route');
  const first = await (await GET()).json();
  h.prices = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`coin-${i}`, { usd: 1, usd_24h_change: -9, usd_market_cap: 1, last_updated_at: 1_700_000_100 + i }]));
  const second = await (await GET()).json();
  expect(first.breadth.percent).toBe(65);
  expect(second.breadth).toEqual(first.breadth);
  expect(second.coins.every((c: { change24h: number }) => c.change24h === -9)).toBe(true);
  expect(first.breadth.asOf).toEqual(expect.any(String));
  const flipped = rememberBreadthSnapshot(breadthInputsFromTrending(trendingSnapshot(8)), new Date('2026-10-11T01:05:00.000Z'));
  expect(flipped?.percent).not.toBe(65);
  expect(flipped?.asOf).not.toBe(first.breadth.asOf);
});

it('displayed breadth uses the snapshot instead of a later uncached price set', () => {
  const data = {
    trending: {
      coins: [{ change24h: 4 }, { change24h: 3 }, { change24h: 2 }, { change24h: 1 }],
      categories: [],
      breadth: { percent: 65, asOf: '2026-10-11T01:00:00.000Z', coinUpPct: 50, universe: ['a', 'b'] },
    },
    trendingMeta: { freshnessStatus: 'fresh' },
  };
  expect(displayedBreadth(data)).toMatchObject({ score: 65, asOf: '2026-10-11T01:00:00.000Z', top50: 50 });
  expect(displayedBreadth({ ...data, trending: { ...data.trending, breadth: null } }).score).toBe(100);
});
