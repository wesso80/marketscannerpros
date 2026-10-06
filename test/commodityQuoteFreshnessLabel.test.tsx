// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { commodityFreshnessLabel } from '@/lib/commodities/quoteFreshnessLabel';

const NOW = Date.parse('2026-10-06T12:00:00Z');

it('says Live only for a timed quote inside the live window', () => {
  expect(commodityFreshnessLabel({
    date: new Date(NOW - 30_000).toISOString(),
    cadence: 'live',
    source: 'SPOT',
    freshnessStatus: 'LIVE',
  }, NOW)).toBe('Live');
});

it('labels a Yahoo futures quote as Delayed, not the UTC session close', () => {
  expect(commodityFreshnessLabel({
    date: '2026-10-06',
    cadence: 'live',
    source: 'YAHOO_FUTURES',
    freshnessStatus: 'LIVE',
  }, NOW)).toBe('Delayed');
  expect(commodityFreshnessLabel({
    date: '2026-10-05',
    cadence: 'live',
    source: 'YAHOO_FUTURES',
    freshnessStatus: 'DELAYED',
  }, Date.parse('2026-10-05T23:00:00Z'))).toBe('Delayed');
});

it('labels a same-day daily close as the session date, not Live', () => {
  expect(commodityFreshnessLabel({
    date: '2026-10-06',
    cadence: 'daily',
    source: 'ETF_PROXY',
    freshnessStatus: 'LIVE',
  }, NOW)).toBe('Close 6 Oct');
});

it('labels a one-day-old fund close as delayed even when the feed says LIVE', () => {
  expect(commodityFreshnessLabel({
    date: '2026-10-05',
    cadence: 'live',
    source: 'ETF_PROXY',
    freshnessStatus: 'LIVE',
  }, NOW)).toBe('Delayed · 1d');
});

it('labels an older session date as stale', () => {
  expect(commodityFreshnessLabel({
    date: '2026-09-20',
    cadence: 'daily',
    source: 'LEGACY_DAILY',
    freshnessStatus: 'LIVE',
  }, NOW)).toBe('Stale · 16d');
  expect(commodityFreshnessLabel({ date: 'not-a-date', freshnessStatus: 'STALE' }, NOW)).toBe('Stale');
});

vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => ({ tier: 'pro' }), canAccessPortfolioInsights: () => true }));
vi.mock('@/hooks/usePolling', () => ({ usePolling: vi.fn() }));
vi.mock('@/lib/ai/pageContext', () => ({ useAIPageContext: () => ({ setPageData: vi.fn() }) }));
vi.mock('@/components/ComplianceDisclaimer', () => ({ default: () => <p>Protected disclosure</p> }));

import CommoditiesPage from '@/app/tools/commodities/page';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('shows the quote-date label on the commodity card instead of LIVE', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  const row = {
    symbol: 'WTI',
    name: 'USO (WTI Crude Oil proxy)',
    category: 'Energy',
    price: 77,
    change: -1,
    changePercent: -1.12,
    unit: 'USD/share',
    date: '2026-10-05',
    history: [],
    source: 'ETF_PROXY',
    sourceSymbol: 'USO',
    freshnessStatus: 'LIVE',
    dataAgeDays: 1,
    eligibleForGate: true,
    cadence: 'live',
  };
  const fixture = {
    success: true,
    commodities: [row],
    byCategory: { Energy: [row], Metals: [], Agriculture: [] },
    summary: { totalCommodities: 1, gainers: 0, losers: 1, avgChange: -1.12, topGainer: null, topLoser: row },
    dataHealth: { gateReady: false, eligibleCount: 1, totalCount: 1, staleSymbols: [] },
    sourceAsOf: '2026-10-05',
    lastUpdate: '2026-10-06T12:00:00Z',
  };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => fixture })));
  const { container } = render(<CommoditiesPage embedded />);
  await screen.findByText('USO (WTI Crude Oil proxy)');
  expect(container.textContent).toContain('Delayed · 1d');
  expect(container.textContent).toContain('proxy USO');
  expect(container.textContent).not.toMatch(/\bLIVE\b/);
});
