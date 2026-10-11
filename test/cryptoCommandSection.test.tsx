// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const nav = vi.hoisted(() => ({ query: 'tab=crypto-command&section=heatmap' }));
const review = vi.hoisted(() => ({
  market: {
    totalMarketCapFormatted: '$2.00T',
    marketCapChange24h: 1.2,
    totalVolume: 1,
    totalMarketCap: 2,
    dominance: [{ symbol: 'BTC', dominance: 54 }],
    sparkline: [{ value: 1 }, { value: 2 }],
  },
  marketMeta: { freshnessStatus: 'fresh', lastUpdated: '2026-10-11T01:00:00.000Z' },
  trending: {
    coins: [{ change24h: 5, symbol: 'AAA' }, { change24h: 4, symbol: 'BBB' }, { change24h: 3, symbol: 'CCC' }, { change24h: 2, symbol: 'DDD' }],
    categories: [],
    breadth: { percent: 65, asOf: '2026-10-11T01:00:00.000Z', coinUpPct: 50, universe: ['a', 'b'] },
  },
  trendingMeta: { freshnessStatus: 'fresh', lastUpdated: '2026-10-11T01:00:00.000Z' },
  funding: { coins: [{}], average: { fundingRatePercent: 0.01 } },
  fundingMeta: { freshnessStatus: 'fresh', lastUpdated: '2026-10-11T01:00:00.000Z' },
  oi: { total: { change24h: 1, altDominance: 40 } },
  oiMeta: { freshnessStatus: 'fresh', lastUpdated: '2026-10-11T01:00:00.000Z' },
}));

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.query) }));
vi.mock('@/lib/useUserTier', () => ({
  useUserTier: () => ({ tier: 'pro', isLoading: false, isLoggedIn: true, isAdmin: false, email: 'pro@example.com' }),
  canAccessCryptoCommandCenter: () => true,
}));
vi.mock('@/lib/cryptoReviewData', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cryptoReviewData')>('@/lib/cryptoReviewData');
  return { ...actual, fetchCryptoReviewData: async () => review };
});

import CryptoCommand from '@/app/tools/crypto/page';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

beforeEach(() => {
  nav.query = 'tab=crypto-command&section=heatmap';
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/crypto/heatmap')) {
      return { ok: true, json: async () => ({ cryptos: [{ symbol: 'BTC', name: 'Bitcoin', price: 1, change: 1, changePercent: 1, weight: 1 }], source: 'CoinGecko', meta: { freshnessStatus: 'fresh', lastUpdated: '2026-10-11T01:00:00.000Z' } }) };
    }
    return { ok: true, json: async () => ({}) };
  }));
});

it('explorer section=heatmap shows the heatmap instead of the overview widget', async () => {
  render(<CryptoCommand embedded />);
  const heading = await screen.findByRole('heading', { name: /Crypto Heat Map/ });
  expect(heading.closest('details')).toBeNull();
  expect(screen.queryByRole('heading', { name: /Market Overview/ })).toBeNull();
  expect(document.querySelector('[data-crypto-section="market"]')).toBeTruthy();
});

it('shows the snapshot breadth percent and its as-of time', async () => {
  nav.query = 'tab=crypto-command';
  render(<CryptoCommand embedded />);
  expect(await screen.findByText('65%')).toBeTruthy();
  expect(screen.getByText('Breadth as of Oct 11, 01:00 UTC')).toBeTruthy();
  expect(screen.queryByText('100%')).toBeNull();
  await waitFor(() => expect(screen.getByText('65%')).toBeTruthy());
});
