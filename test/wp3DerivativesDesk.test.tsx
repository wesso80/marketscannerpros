// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/useUserTier', () => ({
  useUserTier: () => ({ tier: 'pro', isLoading: false, isLoggedIn: true, isAdmin: false, email: null }),
  canAccessCryptoCommandCenter: () => true,
}));

import CryptoDashboard from '@/app/tools/crypto-dashboard/page';

const calls: string[] = [];
const json = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const emptyFeeds = () => json(200, { coins: [], meta: { freshnessStatus: 'stale' }, summary: null, cryptos: [] });

function installFetch(mode: 'empty' | 'three') {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/api/crypto/liquidations')) return json(503, { error: 'Verified liquidation totals are unavailable', available: false });
    if (mode === 'empty') return emptyFeeds();
    if (url.includes('/api/funding-rates')) {
      return json(200, {
        meta: { freshnessStatus: 'fresh' },
        stale: false,
        coins: [
          { symbol: 'BTC', fundingRatePercent: 0.02, annualized: 1, sentiment: 'Neutral' },
          { symbol: 'ETH', fundingRatePercent: 0.01, annualized: 1, sentiment: 'Neutral' },
          { symbol: 'SOL', fundingRatePercent: -0.004, annualized: 1, sentiment: 'Neutral' },
          { symbol: 'BNB', fundingRatePercent: 0.003, annualized: 1, sentiment: 'Neutral' },
        ],
        average: { fundingRatePercent: '0.008', sentiment: 'Neutral' },
      });
    }
    if (url.includes('/api/long-short-ratio')) {
      return json(200, {
        coins: [
          { symbol: 'BTC', longAccount: 55, shortAccount: 45, longShortRatio: 1.22 },
          { symbol: 'ETH', longAccount: 52, shortAccount: 48, longShortRatio: 1.08 },
          { symbol: 'SOL', longAccount: 48, shortAccount: 52, longShortRatio: 0.92 },
          { symbol: 'XRP', longAccount: 50, shortAccount: 50, longShortRatio: 1 },
        ],
        average: { longPercent: '51.25', shortPercent: '48.75', sentiment: 'Neutral' },
      });
    }
    if (url.includes('/api/crypto/open-interest')) {
      return json(200, {
        meta: { freshnessStatus: 'fresh', provider: 'coingecko' },
        summary: {
          totalOpenInterest: 50_000_000_000,
          totalOpenInterestFormatted: '$50.00B',
          change24h: 1.2,
          marketSignal: 'stable',
          comparisonReason: null,
          coverage: 'Fixed contracts',
          baselineReadyAt: null,
        },
        coins: [{ symbol: 'BTC', openInterestValue: 30_000_000_000, change24h: 1.1 }],
      });
    }
    if (url.includes('/api/crypto/heatmap')) {
      return json(200, {
        cryptos: [
          { symbol: 'BTC', price: 60000, changePercent: 1.2 },
          { symbol: 'ETH', price: 3000, changePercent: 0.4 },
          { symbol: 'SOL', price: 150, changePercent: 2.1 },
        ],
      });
    }
    return json(200, {});
  }));
}

beforeEach(() => { calls.length = 0; vi.stubGlobal('React', React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('crypto derivatives desk', () => {
  it('empty fixtures and a liquidations 503 show one liquidations chip and no raw gap words', async () => {
    installFetch('empty');
    render(<CryptoDashboard />);
    expect(await screen.findByRole('button', { name: /Liquidations: not collected/ })).toBeTruthy();
    await waitFor(() => expect(calls.some((url) => url.includes('/api/funding-rates'))).toBe(true));
    expect(calls.some((url) => url.includes('/api/crypto/liquidations'))).toBe(false);
    expect(screen.getAllByRole('button', { name: /Liquidations: not collected/ })).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/Unavailable/);
    expect(document.body.textContent).not.toContain('Wait for complete data');
    expect(document.body.textContent).not.toContain('Trade Ideas');
    expect(document.body.textContent).not.toContain('Playbook');
    expect(screen.getByRole('status').textContent).toContain('Not enough feed coverage');
    expect(document.querySelectorAll('[data-derivatives-summary]')).toHaveLength(1);
    expect(document.querySelectorAll('details[open]')).toHaveLength(0);
  });

  it('renders the conditions row from funding, long/short and open interest with the 3 of 4 label', async () => {
    installFetch('three');
    render(<CryptoDashboard />);
    expect(await screen.findByText('Based on 3 of 4 feeds · liquidations not collected')).toBeTruthy();
    const conditions = screen.getByRole('region', { name: 'Conditions' });
    expect(conditions.textContent).toMatch(/Conditions/);
    expect(document.querySelectorAll('[data-derivatives-summary]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-source-line]')).toHaveLength(1);
    expect(document.querySelectorAll('details[open]')).toHaveLength(0);
    const charts=screen.getByText('Funding and account-ratio charts');
    expect(conditions.compareDocumentPosition(charts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const source=document.querySelector('[data-source-line]')!;
    expect(source.textContent).toContain('Last response with data received');
    expect(source.textContent).toContain('request completion, not a provider observation time');
    expect(source.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(source.textContent).toMatch(/\b(AEDT|AEST)\b/);
    expect(source.textContent).toContain('no shared provider observation time supplied');
    expect(screen.getAllByRole('button', { name: /Liquidations: not collected/ })).toHaveLength(1);
    expect(screen.getAllByText('Show all 4').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Unavailable/);
    expect(document.body.textContent).not.toContain('Wait for complete data');
    expect(conditions.textContent).not.toMatch(/\b(buy|sell|should|likely|bullish|bearish|probability)\b/i);
    expect(calls.some((url) => url.includes('/api/crypto/liquidations'))).toBe(false);
  });
});
