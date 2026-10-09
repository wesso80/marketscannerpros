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
import { topPicks, diffPicks } from '@/lib/market/overview';

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
  it.each([['free','free',true],['signed-out','anonymous',false],['pro','pro',true]] as const)('%s Overview reads cached benchmarks without running a scanner',async(_label,tier,loggedIn)=>{
    Object.assign(tierState,{tier,isLoggedIn:loggedIn});
    const view=render(<CommandCenterPage/>);
    await waitFor(()=>expect(calls().filter(c=>c.url.includes('/api/cached/bulk-quotes'))).toHaveLength(1));
    expect(calls().filter(c=>/\/api\/scanner\/(run|bulk|quotes|daily-picks)/.test(c.url))).toHaveLength(0);
    expect(view.getByRole('heading',{name:'Daily Radar'})).toBeTruthy();
    expect(view.getByText('7 benchmark symbols · fixed coverage')).toBeTruthy();
    expect(view.container.textContent).not.toMatch(/Grade [A-F]|permission|score rank/i);
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

  it('identical public observations report no added or dropped symbols independent of input order',()=>{
    const row=(symbol:string)=>({symbol,assetClass:'equity' as const,scanDate:'2026-10-05',price:1,changePercent:0,indicators:{}});
    const current={success:true,observations:{equity:['A','B','C','D','E','F','G'].map(row),crypto:[]}};
    const previous={...current,observations:{...current.observations,equity:[...current.observations.equity].reverse()}};
    const diff=diffPicks(topPicks(current,'equity'),topPicks(previous,'equity'));
    expect(diff.added).toEqual([]);expect(diff.dropped).toEqual([]);
  });
});
