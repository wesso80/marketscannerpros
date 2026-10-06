// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tierState = vi.hoisted(() => ({
  tier: 'free' as 'free' | 'anonymous' | 'pro',
  isLoading: false,
  isAdmin: false,
  isLoggedIn: true,
  email: null as string | null,
}));

vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => tierState }));
vi.mock('@/app/v2/_lib/V2Context', () => ({ useV2: () => ({ navigateTo: vi.fn(), selectSymbol: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children?: React.ReactNode; href?: string }) => <a href={href} {...props}>{children}</a> }));

import CommandCenterPage from '@/app/tools/command-center/page';
import DeskFolds from '@/components/desk/DeskFolds';

const QUOTE_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'SPY', 'DIA', 'QQQ', 'IWM', 'VIXY'];

const picks = {
  success: true,
  topPicks: {
    equity: [
      { symbol: 'ZZZ', score: 10, direction: 'bullish', price: 5, change_percent: 1.25, indicators: { rsi: 40, adx: 18 } },
      { symbol: 'AAA', score: 99, direction: 'bearish', price: '10.5', change_percent: '-0.5', indicators: '{"rsi":60,"adx":32}' },
    ],
    crypto: [
      { symbol: 'BTC-USD', score: 100, direction: 'bullish', price: 60000, change_percent: 2, indicators: {}, scan_date: '2026-10-05' },
      { symbol: 'ETH-USD', score: 90, direction: 'bullish', price: 3000, change_percent: 1, indicators: {} },
      { symbol: 'SOL-USD', score: 80, direction: 'neutral', price: 150, change_percent: 0.2, indicators: {} },
      { symbol: 'XRP-USD', score: 70, direction: 'bearish', price: 0.5, change_percent: -1, indicators: {} },
      { symbol: 'ADA-USD', score: 60, direction: 'bullish', price: 0.4, change_percent: 0.4, indicators: {} },
      { symbol: 'NOPE-USD', score: 50, direction: 'bullish', price: 1, change_percent: 0.1, indicators: {} },
    ],
  },
  dataQuality: { source: 'daily_picks_database', computedAt: '2026-10-05T13:00:00Z', stale: false, coverageScore: 90, warnings: [] },
};

const fetcher = vi.fn();

function calls() {
  return fetcher.mock.calls.map(([url, init]: [unknown, RequestInit | undefined]) => ({
    url: String(url),
    method: String(init?.method || 'GET').toUpperCase(),
    body: init?.body,
  }));
}

beforeEach(() => {
  Object.assign(tierState, { tier: 'free', isLoading: false, isAdmin: false, isLoggedIn: true, email: null });
  fetcher.mockReset().mockImplementation(async (url: string) => {
    const path = String(url);
    if (path.includes('/api/scanner/daily-picks')) {
      return { ok: true, status: 200, json: async () => ({
        ...picks,
        topPicks: {
          ...picks.topPicks,
          equity: [...picks.topPicks.equity, { symbol: 'NODATA', direction: null, indicators: null, price: null, score: 'n/a' }],
        },
      }) };
    }
    if (path.includes('/api/scanner/quotes')) {
      return { ok: true, status: 200, json: async () => ({
        quotes: QUOTE_SYMBOLS.map((symbol) => ({ symbol, price: 100, change: 1, changePercent: 0.5 })),
      }) };
    }
    if (path.includes('/api/scanner/run')) {
      return { ok: true, status: 200, json: async () => ({ success: true, results: [] }) };
    }
    return { ok: true, status: 200, json: async () => ({ coins: [], quotes: {} }) };
  });
  vi.stubGlobal('fetch', fetcher);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function dailyGets() {
  return calls().filter((c) => c.url.includes('/api/scanner/daily-picks') && c.method === 'GET');
}

describe('Today load does not run the scanner', () => {
  it.each([
    ['free', 'free', true],
    ['signed-out', 'anonymous', false],
    ['pro', 'pro', true],
  ] as const)('%s Today: 0 run, 1 quotes POST, 1 current-day daily-picks GET', async (_label, tier, loggedIn) => {
    Object.assign(tierState, { tier, isLoggedIn: loggedIn, isLoading: false, isAdmin: false });
    fetcher.mockClear();
    const view = render(<CommandCenterPage />);
    await waitFor(() => {
      expect(calls().filter((c) => c.url.includes('/api/scanner/quotes') && c.method === 'POST')).toHaveLength(1);
      expect(dailyGets().filter((c) => !c.url.includes('date='))).toHaveLength(1);
      expect(dailyGets().filter((c) => c.url.includes('date=2026-10-04'))).toHaveLength(1);
    });
    expect(calls().filter((c) => c.url.includes('/api/scanner/run'))).toHaveLength(0);
    const quote = calls().find((c) => c.url.includes('/api/scanner/quotes'))!;
    expect(JSON.parse(String(quote.body)).symbols).toEqual(QUOTE_SYMBOLS);
    const current = dailyGets().filter((c) => !c.url.includes('date='));
    expect(current).toHaveLength(1);
    expect(current[0].url).toContain('/api/scanner/daily-picks?limit=20');
    expect(current[0].url).not.toContain('limit=5');
    const previous = dailyGets().filter((c) => c.url.includes('date='));
    expect(previous).toHaveLength(1);
    expect(previous[0].url).toContain('/api/scanner/daily-picks?limit=5&type=top&date=2026-10-04');

    const overview = view.container.querySelector('[data-overview-picks]');
    expect(overview?.querySelectorAll('li')).toHaveLength(5);
    expect(overview?.textContent).not.toContain('NOPE-USD');

    const labels = [...view.container.querySelectorAll('button')]
      .map((button) => button.getAttribute('aria-label'))
      .filter((label): label is string => Boolean(label?.startsWith('Validate ')));
    expect(labels.slice(0, 4)).toEqual([
      'Validate ZZZ in Symbol',
      'Validate AAA in Symbol',
      'Validate NODATA in Symbol',
      'Validate BTC-USD in Symbol',
    ]);
    expect(view.container.textContent).toContain('No reading');
    expect(view.container.textContent).toContain('Top of today\'s daily picks.');
    expect(view.container.textContent).not.toContain('$0.00');
    view.unmount();
  });

  it('quotes timeout falls back to No reading', async () => {
    fetcher.mockImplementation((url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.includes('/api/scanner/quotes')) {
        return new Promise((_resolve, reject) => {
          const fail = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
          if (init?.signal?.aborted) {
            fail();
            return;
          }
          init?.signal?.addEventListener('abort', fail, { once: true });
        });
      }
      if (path.includes('/api/scanner/daily-picks')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => picks });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    vi.useFakeTimers();
    const view = render(<DeskFolds />);
    const quoteTile = () => [...view.container.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Open Symbol for AAPL');
    await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
    expect(quoteTile()).toBeUndefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(quoteTile()?.textContent).toContain('No reading');
    expect([...view.container.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Open Symbol for S&P 500')?.textContent).toContain('No reading');
    view.unmount();
    vi.useRealTimers();
  });
});
