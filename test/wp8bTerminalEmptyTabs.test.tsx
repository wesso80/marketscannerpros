// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tierState = vi.hoisted(() => ({ tier: 'pro' as string, isLoading: false }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/tools/terminal',
}));

vi.mock('@/lib/useUserTier', () => ({
  useUserTier: () => ({
    tier: tierState.tier,
    isLoading: tierState.isLoading,
    isLoggedIn: tierState.tier === 'pro',
    isAdmin: false,
    email: null,
  }),
  canAccessOptionsTerminal: (tier: string) => tier === 'pro' || tier === 'pro_trader',
  canAccessTimeScanner: (tier: string) => tier === 'pro' || tier === 'pro_trader',
  canAccessConfluenceScanner: (tier: string) => tier === 'pro' || tier === 'pro_trader',
}));

import OptionsFlowPage from '@/components/options-terminal/OptionsFlowView';
import TerminalCryptoDesk from '@/components/terminal/TerminalCryptoDesk';
import TimeScannerPage from '@/components/time/TimeScannerPage';
import ConfluenceScannerPage from '@/app/tools/confluence-scanner/page';
import { selectCryptoDeskTiles } from '@/lib/terminal/cryptoDeskTiles';

const calls: string[] = [];

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  calls.length = 0;
  tierState.tier = 'pro';
  tierState.isLoading = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Options Flow uses the loaded Terminal symbol', () => {
  it('does not show the empty enter-symbol prompt when a symbol is set', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return json(403, { error: 'Options Flow requires a Pro subscription' });
    }));
    render(<OptionsFlowPage embeddedInTerminal symbol="MU" />);
    await waitFor(() => expect(calls.some((url) => url.includes('/api/options-flow?symbol=MU'))).toBe(true));
    expect(screen.queryByText(/Enter a symbol/)).toBeNull();
    expect(screen.queryByLabelText('Ticker symbol')).toBeNull();
    expect(screen.getByTestId('flow-loaded-symbol').textContent).toBe('MU');
  });

  it('shows the loaded symbol and an unlock path for free users without calling the flow route', async () => {
    tierState.tier = 'free';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return json(200, {});
    }));
    render(<OptionsFlowPage embeddedInTerminal symbol="mu" />);
    expect(await screen.findByRole('heading', { name: 'Options Flow for MU' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Unlock Options Flow' })).toBeTruthy();
    expect(screen.queryByText(/Enter a symbol/)).toBeNull();
    expect(calls.some((url) => url.includes('/api/options-flow'))).toBe(false);
  });
});

describe('Crypto Derivatives tab', () => {
  it('shows funding, open interest and long/short without a liquidations tile', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/api/funding-rates')) {
        return json(200, {
          meta: { freshnessStatus: 'fresh' },
          stale: false,
          coins: [{ symbol: 'BTC', fundingRatePercent: 0.0125 }],
        });
      }
      if (url.includes('/api/long-short-ratio')) {
        return json(200, { coins: [{ symbol: 'BTC', longAccount: 55, shortAccount: 45 }] });
      }
      if (url.includes('/api/crypto/open-interest')) {
        return json(200, {
          meta: { freshnessStatus: 'fresh' },
          coins: [{
            symbol: 'BTC',
            openInterestFormatted: '$30.00B',
            openInterestValue: 30_000_000_000,
            observedAt: new Date().toISOString(),
            sourceLabel: 'CoinGecko derivatives · top 3 exchanges',
          }],
        });
      }
      return json(500, {});
    }));
    render(<TerminalCryptoDesk symbol="BTCUSD" />);
    expect(await screen.findByText('Funding')).toBeTruthy();
    expect(screen.getByText('+0.0125%')).toBeTruthy();
    expect(screen.getByText('Open interest')).toBeTruthy();
    expect(screen.getByText('$30.00B')).toBeTruthy();
    expect(screen.getByText('CoinGecko derivatives · top 3 exchanges')).toBeTruthy();
    expect(screen.getByText('Long/short')).toBeTruthy();
    expect(screen.getByText('55.0 / 45.0')).toBeTruthy();
    expect(screen.queryByText('Liquidations')).toBeNull();
    expect(screen.getByText('Based on funding, long/short and open interest.')).toBeTruthy();
    expect(calls.some((url) => url.includes('/api/crypto/liquidations'))).toBe(false);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows one not-collected gate when the feeds have no reading', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return json(200, { coins: [], meta: { freshnessStatus: 'stale' } });
    }));
    render(<TerminalCryptoDesk symbol="BTCUSD" />);
    expect(await screen.findByRole('heading', { name: 'Not collected for BTC' })).toBeTruthy();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.queryByText(/Liquidations/)).toBeNull();
    expect(document.body.textContent).not.toContain('3 of 4');
    expect(screen.queryByRole('link')).toBeNull();
    expect(calls.some((url) => url.includes('/api/crypto/liquidations'))).toBe(false);
    expect(document.body.textContent).not.toMatch(/Unavailable/);
  });

  it('uses the selected coin observation time, not the response freshness', () => {
    const now = Date.now();
    const openInterest = {
      meta: { freshnessStatus: 'delayed' as const },
      coins: [
        {
          symbol: 'BTC',
          openInterestFormatted: '$14.35B',
          openInterestValue: 14_350_000_000,
          observedAt: new Date(now - 60_000).toISOString(),
          sourceLabel: 'CoinGecko derivatives · top 3 exchanges',
        },
        {
          symbol: 'ETH',
          openInterestFormatted: '$2.00B',
          openInterestValue: 2_000_000_000,
          observedAt: new Date(now - 2 * 60 * 60_000).toISOString(),
          sourceLabel: 'CoinGecko derivatives · top 1 exchange',
        },
      ],
    };
    const btc = selectCryptoDeskTiles('BTCUSD', { funding: null, longShort: null, openInterest }, now);
    expect(btc.mode).toBe('tiles');
    if (btc.mode !== 'tiles') return;
    const tile = btc.tiles.find((item) => item.label === 'Open interest');
    expect(tile).toMatchObject({ value: '$14.35B', source: 'CoinGecko derivatives · top 3 exchanges' });
    const eth = selectCryptoDeskTiles('ETHUSD', { funding: null, longShort: null, openInterest }, now);
    expect(eth.mode).toBe('gate');
    const undated = selectCryptoDeskTiles('BTCUSD', {
      funding: { meta: { freshnessStatus: 'fresh' }, stale: false, coins: [] },
      longShort: null,
      openInterest: { meta: { freshnessStatus: 'fresh' }, coins: [{ symbol: 'BTC', openInterestFormatted: '$1.00B', openInterestValue: 1 }] },
    }, now);
    expect(undated.mode).toBe('gate');
  });

  it('does not invent a zero when the loaded coin is missing', () => {
    const selected = selectCryptoDeskTiles('SOLUSD', {
      funding: { meta: { freshnessStatus: 'fresh' }, stale: false, coins: [{ symbol: 'BTC', fundingRatePercent: 0.01 }] },
      longShort: { coins: [{ symbol: 'BTC', longAccount: 50, shortAccount: 50 }] },
      openInterest: { meta: { freshnessStatus: 'fresh' }, coins: [{ symbol: 'BTC', openInterestFormatted: '$1.00B', openInterestValue: 1 }] },
    });
    expect(selected.mode).toBe('gate');
  });
});

describe('Time Confluence before a run', () => {
  it('does not render score 0 and Unavailable tiles together', () => {
    render(<TimeScannerPage embeddedInTerminal symbol="BTCUSD" assetType="crypto" />);
    expect(screen.getByRole('heading', { name: 'Run Time Confluence for BTCUSD' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Run Time Confluence' })).toBeTruthy();
    const text = document.body.textContent || '';
    expect(text).not.toMatch(/Unavailable/);
    expect(text).not.toMatch(/UNKNOWN/);
    expect(text).not.toMatch(/\bLOW\b/);
    expect(text).not.toMatch(/Run scan to assess/);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('shows one unlock card for free users inside Terminal', async () => {
    tierState.tier = 'free';
    render(<ConfluenceScannerPage embeddedInTerminal symbol="btcusd" assetType="crypto" />);
    expect(await screen.findByRole('heading', { name: 'Time Confluence for BTCUSD' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Unlock Time Confluence' })).toBeTruthy();
    const text = document.body.textContent || '';
    expect(text).not.toMatch(/Unavailable/);
    expect(text).not.toMatch(/UNKNOWN/);
    expect(text).not.toMatch(/Golden Egg/);
    expect(screen.queryByText('0')).toBeNull();
  });
});

it('keeps the market-wide crypto link as a secondary action on the Terminal page', () => {
  const page = readFileSync('app/tools/terminal/page.tsx', 'utf8');
  expect(page).toContain('<TerminalCryptoDesk symbol={sym} />');
  expect(page).toContain('href="/tools/crypto-dashboard"');
  expect(page).not.toContain('crypto-dashboard?symbol=');
  expect(page).not.toContain('Back to Golden Egg');
  expect(page).toContain('Back to Symbol');
  expect(page).toContain('Symbol checks the setup.');
});
