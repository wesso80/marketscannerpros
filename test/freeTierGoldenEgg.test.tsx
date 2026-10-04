// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthError, UpgradeRequiredError } from '@/app/v2/_lib/api';

const state = vi.hoisted(() => ({ symbol: 'AAPL', status: 403 as 401 | 403 }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => '/tools/golden-egg',
}));
vi.mock('@/app/v2/_lib/V2Context', () => ({
  useV2: () => ({ selectedSymbol: state.symbol, selectSymbol: () => undefined }),
}));
import GoldenEggPage from '@/app/tools/golden-egg/page';

const quote = { ok: true, price: 189.25, changePercent: 0.4, observedAt: '2026-10-03T20:00:00Z', observationDate: '2026-10-03', source: 'quote cache' };
beforeEach(() => {
  state.symbol = 'AAPL';
  state.status = 403;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const denied = url.startsWith('/api/golden-egg') || url.startsWith('/api/dve') || (url.startsWith('/api/quote') && state.status === 401);
    const status = denied ? state.status : 200;
    return {
      ok: status === 200,
      status,
      json: async () => {
        if (url.startsWith('/api/quote') && status === 200) return quote;
        if (url.startsWith('/api/regime')) return { available: false };
        if (url.includes('/api/scanner/')) return { equity: [], crypto: [], topPicks: { equity: [], crypto: [] } };
        return { error: status === 401 ? 'Please log in' : 'Pro access required' };
      },
    };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('treats upgrade denial as an auth error with its own message', () => {
  const error = new UpgradeRequiredError('/api/golden-egg');
  expect(error).toBeInstanceOf(AuthError);
  expect(error).toBeInstanceOf(UpgradeRequiredError);
  expect(error.message).toBe('Upgrade required');
  expect(new AuthError('/api/golden-egg').message).toBe('Sign in required');
});

it.each(['AAPL', 'LINK-USD'])('403 on %s shows the example unlock card and real quote', async symbol => {
  state.symbol = symbol;
  state.status = 403;
  render(<GoldenEggPage />);
  expect((await screen.findByRole('link', { name: 'Unlock with Pro' })).getAttribute('href')).toBe('/pricing');
  expect(screen.getByText('Example')).toBeTruthy();
  expect(screen.getByText('Regime, indicators, volatility and scenario context for one symbol.')).toBeTruthy();
  expect(screen.queryByText('Sign in required')).toBeNull();
  expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  const snapshot = document.querySelector('[aria-label="Symbol snapshot"]');
  expect(snapshot?.textContent).toContain(symbol);
  expect(await screen.findByText(/\$189\.25/)).toBeTruthy();
  expect(snapshot?.textContent).toContain('$189.25');
  expect(snapshot?.textContent).not.toContain('Example');
});

it.each(['AAPL', 'LINK-USD'])('401 on %s shows Sign in back to that symbol', async symbol => {
  state.symbol = symbol;
  state.status = 401;
  render(<GoldenEggPage />);
  const link = await screen.findByRole('link', { name: 'Sign in' });
  expect(decodeURIComponent(link.getAttribute('href') || '')).toBe(`/auth?next=/tools/golden-egg?symbol=${symbol}`);
  expect(screen.getByText('Sign in required')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Unlock with Pro' })).toBeNull();
  expect(screen.queryByText('Example')).toBeNull();
});
