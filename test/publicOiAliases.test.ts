import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/crypto/oiHistory', () => ({
  getOiEvidence: async () => ({
    coins: [
      { symbol: 'BTC', value: 80, change24h: 1, observedAt: Date.parse('2026-10-03T12:00:00Z'), comparisonAt: null },
      { symbol: 'ETH', value: 20, change24h: 1, observedAt: Date.parse('2026-10-03T12:00:00Z'), comparisonAt: null },
    ],
    totalOpenInterest: 100,
    change24h: 1,
    carriedContracts: 0,
    expectedContracts: 2,
    comparisonReason: null,
    coverage: 'fixed',
    method: 'coingecko-major-perpetual-usd-v3',
    observedAt: '2026-10-03T12:00:00.000Z',
  }),
}));
vi.mock('@/lib/coingecko', () => ({
  symbolToId: (s: string) => s.toLowerCase(),
  getMarketData: async () => [],
  buildCoinGeckoResponseMeta: () => ({ provider: 'coingecko', lastUpdated: '2026-10-03T12:00:00.000Z', freshnessStatus: 'fresh' }),
}));

it('keeps the old dominance names beside the open-interest share names', async () => {
  const { GET } = await import('@/app/api/open-interest/route');
  const body = await (await GET(new NextRequest('https://test/api/open-interest'))).json();
  expect(body.total.btcOiShare).toBe(80);
  expect(body.total.ethOiShare).toBe(20);
  expect(body.total.altOiShare).toBe(0);
  expect(body.total.btcDominance).toBe(body.total.btcOiShare);
  expect(body.total.ethDominance).toBe(body.total.ethOiShare);
  expect(body.total.altDominance).toBe(body.total.altOiShare);
});

it('MarketPulseHero reads the ETH open-interest share the API returns', () => {
  const src = readFileSync('components/MarketPulseHero.tsx', 'utf8');
  expect(src).toContain('oiRes.total.ethOiShare');
  expect(src).toContain('oiRes.total.btcOiShare');
});
