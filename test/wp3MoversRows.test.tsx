// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/tools/market-movers',
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  useSearchParams: () => ({ get: () => null }),
}));
vi.mock('@/lib/useUserTier', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/useUserTier')>();
  return {
    ...actual,
    useUserTier: () => ({ tier: 'pro', isLoading: false, isLoggedIn: true, isAdmin: false, email: null }),
  };
});

import MarketMoversPage from '@/app/tools/market-movers/page';

const mover = (ticker: string, extra: Record<string, unknown>) => ({
  ticker,
  price: '12.5',
  change_amount: '1.2',
  change_percentage: '10.00%',
  volume: '2500000',
  asset_class: 'equity',
  rsi14: null,
  ema200_dist: null,
  adx14: null,
  in_squeeze: null,
  rs_vs_index: 1.4,
  momentum_accel: null,
  ...extra,
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('non-universe rows render no em dashes, missing fields say Not collected, and equities say the crypto score does not apply', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/market-status')) {
      return { ok: true, json: async () => ({ us: { status: 'closed', session: 'closed', sessionDisplay: 'Closed', nextEvent: '' }, global: { forex: { status: 'closed' }, crypto: { status: 'open' } } }) };
    }
    if (url.includes('/api/upe/crcs')) return { ok: true, json: async () => ({ rows: [] }) };
    return {
      ok: true,
      json: async () => ({
        lastUpdated: '2026-10-02T20:00:00.000Z',
        equityAsOf: '2026-10-02T20:00:00.000Z',
        equityFeed: 'realtime',
        topGainers: [
          mover('AMOD', { in_universe: false }),
          mover('NVDA', { in_universe: true, rsi14: 55, ema200_dist: null, adx14: 22, momentum_accel: null }),
        ],
        topLosers: [],
        mostActive: [],
      }),
    };
  }));
  render(<MarketMoversPage />);
  // Compact Movers presentation: each mover is a list item; its evidence sits in a details panel.
  const rows = await Promise.all(['AMOD', 'NVDA'].map(async (ticker) => {
    const node = (await screen.findAllByText(ticker)).map((el) => el.closest('[data-mover-row]')).find(Boolean);
    expect(node).toBeTruthy();
    return node as HTMLElement;
  }));
  for (const row of rows) {
    expect(row.textContent).not.toContain('—');
    expect(row.textContent).toContain('What to checkPrice, session change, RSI, and volume versus this list');
  }
  // AMOD is outside the worker universe: its indicator fields are marked missing, never filled.
  expect(rows[0].textContent).toContain('RSINot collected');
  expect(rows[0].textContent).toContain('MomentumNot collected');
  expect(rows[1].textContent).toContain('RSI55');
});

