// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ tab: 'commodities' }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/tools/explorer',
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => ({ tier: 'free', isLoading: false }) }));
vi.mock('@/app/v2/_lib/V2Context', () => ({ useV2: () => ({ navigateTo: vi.fn(), selectSymbol: vi.fn() }) }));
vi.mock('@/components/markets/SectorEtfHoldings', () => ({ default: () => null }));
vi.mock('@/app/v2/_lib/api', () => ({
  useSectorsHeatmap: () => ({ data: { sectors: [] }, loading: false }),
  useCryptoOverview: () => ({ data: null, loading: false }),
  useCryptoCategories: () => ({ data: null, loading: false }),
  useMarketMovers: () => ({ data: { topGainers: [], topLosers: [] }, loading: false }),
  useCommodities: () => ({
    data: {
      commodities: [
        { symbol: 'GOLD', name: 'Gold', price: null, change: null, changePercent: null, unit: '$/oz', category: 'Metals', history: [] },
        { symbol: 'SILVER', name: 'Silver', price: 48.2, change: null, changePercent: null, unit: '$/oz', category: 'Metals', history: [] },
      ],
    },
    loading: false,
    error: null,
  }),
  useRegime: () => ({ data: null, loading: false }),
}));

import ExplorerPage from '@/app/tools/explorer/page';

afterEach(() => { cleanup(); });

it('shows unavailable for a null commodity price and does not invent a FLAT badge', () => {
  const { container } = render(<ExplorerPage />);
  expect(screen.getByText('Gold')).toBeTruthy();
  expect(screen.getByText('Silver')).toBeTruthy();
  expect(screen.getByText('$48.20')).toBeTruthy();
  expect(screen.getAllByText('unavailable').length).toBeGreaterThan(0);
  expect(container.textContent).not.toContain('FLAT');
  expect(container.textContent).not.toContain('0.00%');
});
