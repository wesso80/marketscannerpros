// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => ({ tier: 'pro' }), canAccessPortfolioInsights: () => true }));
vi.mock('@/hooks/usePolling', () => ({ usePolling: vi.fn() }));
vi.mock('@/lib/ai/pageContext', () => ({ useAIPageContext: () => ({ setPageData: vi.fn() }) }));
vi.mock('@/components/ComplianceDisclaimer', () => ({ default: () => <p>General information only, not financial advice.</p> }));

import CommoditiesPage from '@/app/tools/commodities/page';

const SOURCE = 'Yahoo Finance futures (GC=F / SI=F)';

function row(overrides: Record<string, unknown>) {
  return {
    symbol: 'GOLD',
    name: 'Gold',
    category: 'Metals',
    price: null,
    change: null,
    changePercent: null,
    unit: '$/oz',
    date: '',
    history: [],
    source: 'YAHOO_FUTURES',
    sourceSymbol: 'GC=F',
    sourceLabel: SOURCE,
    unavailableReason: 'Yahoo Finance futures quote unavailable',
    freshnessStatus: 'STALE',
    dataAgeDays: 0,
    eligibleForGate: false,
    cadence: 'live',
    asOfLabel: null,
    ...overrides,
  };
}

function payload(commodity: ReturnType<typeof row>) {
  return {
    success: true,
    commodities: [commodity],
    byCategory: { Energy: [], Metals: [commodity], Agriculture: [] },
    summary: { totalCommodities: 0, gainers: 0, losers: 0, avgChange: 0, topGainer: null, topLoser: null },
    dataHealth: { gateReady: false, eligibleCount: 0, totalCount: 1, staleSymbols: [] },
    sourceAsOf: null,
    lastUpdate: '2026-10-06T04:00:00Z',
  };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('shows unavailable and the Yahoo futures label, never 0.00%', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes('economic-indicators') ? {} : payload(row({}))),
  })));
  const { container } = render(<CommoditiesPage embedded />);
  await screen.findByText('Gold');
  expect(screen.getAllByText('unavailable').length).toBeGreaterThan(0);
  expect(screen.getAllByText(SOURCE).length).toBeGreaterThan(0);
  const card = container.querySelector('[data-commodity-card]');
  expect(card?.textContent).toContain(SOURCE);
  expect(card?.querySelector('p.break-words')?.textContent).toContain(SOURCE);
  expect(container.querySelector('.grid.sm\\:grid-cols-2.lg\\:grid-cols-3')).toBeTruthy();
  expect(container.textContent).not.toContain('0.00%');
  expect(container.textContent).not.toContain('$0.00');
  expect(container.textContent).toContain('General information only, not financial advice.');
});

it('shows a real futures change and the as-of time on the card', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000 + 10 * 60 * 1000);
  const priced = row({
    price: 4025.5,
    change: 25.5,
    changePercent: 0.6375,
    date: '2026-10-06',
    eligibleForGate: true,
    freshnessStatus: 'LIVE',
    unavailableReason: null,
    asOfLabel: 'as of 6 Oct 2026, 14:30 AEDT',
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes('economic-indicators') ? {} : payload(priced)),
  })));
  const { container } = render(<CommoditiesPage embedded />);
  await screen.findByText('Gold');
  expect(screen.getByText('$4025.50')).toBeTruthy();
  expect(screen.getByText('+0.64%')).toBeTruthy();
  expect(container.textContent).toContain('as of 6 Oct 2026, 14:30 AEDT');
  expect(container.textContent).toContain(SOURCE);
  expect(container.textContent).not.toContain('0.00%');
});
