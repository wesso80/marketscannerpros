// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { START_HERE_MARKET_KEY, START_HERE_STATUS_KEY, findFreeScanResult, shouldShowStartHere } from '@/lib/free/startHere';

const tier = vi.hoisted(() => ({ tier: 'free', isLoading: false, isLoggedIn: true, isAdmin: false, email: null as string | null }));
const tracked = vi.hoisted(() => vi.fn());
vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => tier }));
vi.mock('@/lib/analytics', () => ({ trackEvent: tracked }));
vi.mock('next/link', () => ({ default: ({ children, href, onClick, ...props }: { children: React.ReactNode; href: string; onClick?: () => void }) => <a href={href} onClick={(event) => { event.preventDefault(); onClick?.(); }} {...props}>{children}</a> }));

import StartGate from '@/components/free/StartGate';

const memory = { preferredAssets: [] as string[] };
const calls: Array<{ url: string; method: string; body?: string }> = [];

function json(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

beforeEach(() => {
  Object.assign(tier, { tier: 'free', isLoading: false, isLoggedIn: true, isAdmin: false, email: null });
  memory.preferredAssets = [];
  calls.length = 0;
  tracked.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: RequestInit) => {
    const method = opts?.method || 'GET';
    const body = typeof opts?.body === 'string' ? opts.body : undefined;
    calls.push({ url: String(url), method, body });
    if (url === '/api/scanner/run') {
      const parsed = JSON.parse(body || '{}') as { symbols?: string[] };
      const requested = parsed.symbols?.[0] === 'BTC' ? 'BTC-USD' : parsed.symbols?.[0];
      return json({ results: [{ symbol: 'ETH', score: 99 }, { symbol: requested, score: 70 }] });
    }
    if (url === '/api/scanner/usage') return json({ used: 0, limit: 5, resetsAt: '2026-10-06T00:00:00Z' });
    if (url === '/api/ai/memory' && method === 'PATCH') return json({ success: true });
    if (url === '/api/ai/memory') return json({ memory });
    if (String(url).startsWith('/api/scanner/daily-picks')) return json({ topPicks: { equity: [], crypto: [] } });
    if (url === '/api/msp-radar/preview') return json({ preview: null });
    throw new Error(`Unexpected network: ${url}`);
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function show() {
  render(<StartGate />);
  return screen.findByRole('heading', { level: 1 });
}

describe('who sees Start here', () => {
  it('shows the three steps to a new signed-in free user', async () => {
    const heading = await show();
    expect(heading.textContent).toBe('Start here');
    expect(screen.getByRole('heading', { name: /Pick a market/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Run a scan/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Open a Symbol page/ })).toBeTruthy();
    expect(screen.getByText('This uses 1 of your 5 scans today.')).toBeTruthy();
    expect(screen.getByText('General information only, not financial advice.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Crypto' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'US stocks' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /forex/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/forex/i);
    expect(calls.some((call) => call.url === '/api/scanner/run')).toBe(false);
  });

  it.each([
    ['paid', { tier: 'pro', isLoggedIn: true, isAdmin: false }],
    ['legacy paid', { tier: 'pro_trader', isLoggedIn: true, isAdmin: false }],
    ['admin', { tier: 'free', isLoggedIn: true, isAdmin: true }],
    ['signed-out', { tier: 'anonymous', isLoggedIn: false, isAdmin: false }],
  ] as const)('hides it from a %s user', async (_label, next) => {
    Object.assign(tier, next);
    const heading = await show();
    expect(heading.textContent).toBe('Today');
    expect(screen.queryByRole('heading', { name: 'Start here' })).toBeNull();
  });

  it('hides it after skip or completion', async () => {
    localStorage.setItem(START_HERE_STATUS_KEY, 'skipped');
    expect((await show()).textContent).toBe('Today');
    cleanup();
    localStorage.setItem(START_HERE_STATUS_KEY, 'done');
    expect((await show()).textContent).toBe('Today');
  });

  it('matches the visibility helper', () => {
    expect(shouldShowStartHere({ isLoggedIn: true, tier: 'free', status: null })).toBe(true);
    expect(shouldShowStartHere({ isLoggedIn: true, tier: 'pro', status: null })).toBe(false);
    expect(shouldShowStartHere({ isLoggedIn: true, tier: 'free', isAdmin: true, status: null })).toBe(false);
    expect(shouldShowStartHere({ isLoggedIn: false, tier: 'anonymous', status: null })).toBe(false);
    expect(shouldShowStartHere({ isLoggedIn: true, tier: 'free', status: 'skipped' })).toBe(false);
    expect(shouldShowStartHere({ isLoggedIn: true, tier: 'free', status: 'done' })).toBe(false);
  });
});

describe('Start here steps', () => {
  it('walks market, scan, then the top result Symbol page', async () => {
    await show();
    expect(tracked).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'US stocks' }));
    expect(tracked).not.toHaveBeenCalled();
    localStorage.setItem('msp-consent', 'accepted');
    fireEvent.click(screen.getByRole('tab', { name: 'Crypto' }));
    expect(localStorage.getItem(START_HERE_MARKET_KEY)).toBe('crypto');
    expect(screen.getByRole('heading', { name: /Pick a market/ }).textContent).toContain('✓');
    expect(tracked).toHaveBeenCalledWith('start_here_step', { step: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Run a scan' }));
    const link = await screen.findByRole('link', { name: 'Open BTC-USD' });
    expect(link.getAttribute('href')).toBe('/tools/golden-egg?symbol=BTC-USD&type=crypto');
    expect(screen.getByRole('heading', { name: /Run a scan/ }).textContent).toContain('✓');
    const run = calls.filter((call) => call.url === '/api/scanner/run');
    expect(run).toHaveLength(1);
    expect(JSON.parse(run[0].body || '{}')).toEqual({ type: 'crypto', symbols: ['BTC'], timeframe: 'daily', minScore: 0 });
    expect(tracked).toHaveBeenCalledWith('start_here_step', { step: 2 });
    expect(findFreeScanResult([{ symbol: 'ETH', score: 99 }, { symbol: 'BTC-USD', score: 70 }], 'BTC')?.symbol).toBe('BTC-USD');

    fireEvent.click(link);
    expect(localStorage.getItem(START_HERE_STATUS_KEY)).toBe('done');
    expect(screen.getByRole('heading', { name: /Open a Symbol page/ }).textContent).toContain('✓');
    expect(tracked).toHaveBeenCalledWith('start_here_step', { step: 3 });
    cleanup();
    expect((await show()).textContent).toBe('Today');
  });

  it('remembers a retired forex preference as US stocks and saves that choice', async () => {
    memory.preferredAssets = ['forex', 'BTC'];
    await show();
    const stocks = await screen.findByRole('tab', { name: 'US stocks', selected: true });
    expect(stocks).toBeTruthy();
    expect(screen.queryByText(/forex/i)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'US stocks' }));
    await waitFor(() => {
      const patch = calls.find((call) => call.url === '/api/ai/memory' && call.method === 'PATCH');
      expect(JSON.parse(patch?.body || '{}').preferredAssets).toEqual(['equity', 'BTC']);
    });
  });

  it('skip leaves the normal Today page', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Skip, show me everything' }));
    expect(localStorage.getItem(START_HERE_STATUS_KEY)).toBe('skipped');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Today');
    expect(screen.queryByRole('heading', { name: 'Start here' })).toBeNull();
  });
});
