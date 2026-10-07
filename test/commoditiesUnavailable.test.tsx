// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => ({ tier: 'pro' }), canAccessPortfolioInsights: () => true }));
vi.mock('@/hooks/usePolling', () => ({ usePolling: vi.fn() }));
const pageContext = vi.hoisted(() => ({ setPageData: vi.fn() }));
vi.mock('@/lib/ai/pageContext', () => ({ useAIPageContext: () => ({ setPageData: pageContext.setPageData }) }));
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

afterEach(() => { cleanup(); pageContext.setPageData.mockClear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each([false, true])('shows unavailable and the Yahoo futures label, never 0.00% (embedded: %s)', async (embedded) => {
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes('economic-indicators') ? {} : payload(row({}))),
  })));
  const { container } = render(<CommoditiesPage embedded={embedded} />);
  await screen.findByText('Gold');
  expect(screen.getAllByText('unavailable').length).toBeGreaterThan(0);
  expect(screen.getAllByText(SOURCE).length).toBeGreaterThan(0);
  const card = container.querySelector('[data-commodity-card]');
  expect(card?.textContent).toContain(SOURCE);
  expect(card?.querySelector('p.break-words')?.textContent).toContain(SOURCE);
  expect(container.querySelector('.grid.sm\\:grid-cols-2.lg\\:grid-cols-3')).toBeTruthy();
  expect(container.textContent).not.toContain('0.00%');
  expect(container.textContent).not.toContain('$0.00');
  expect(container.textContent?.includes('General information only, not financial advice.')).toBe(!embedded);
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
  expect(container.textContent).toContain('Delayed · as of 6 Oct 2026, 14:30 AEDT');
  expect(container.textContent).not.toContain('Close 6 Oct');
  expect(container.textContent).not.toContain('Close 5 Oct');
  expect(container.textContent).not.toContain('0.00%');
});

it('shows unavailable growth lines when gold is missing and leaves gold out of the page context', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000 + 20 * 60 * 1000);
  const metal = (symbol: string, name: string, changePercent: number | null, eligible: boolean) => row({
    symbol,
    name,
    category: 'Metals',
    price: changePercent == null ? null : 100,
    change: changePercent,
    changePercent,
    eligibleForGate: eligible,
    freshnessStatus: eligible ? 'LIVE' : 'STALE',
    unavailableReason: changePercent == null ? 'Yahoo Finance futures quote unavailable' : null,
    source: symbol === 'GOLD' || symbol === 'SILVER' ? 'YAHOO_FUTURES' : 'LEGACY_MONTHLY',
  });
  const energy = row({ symbol: 'WTI', name: 'WTI', category: 'Energy', price: 70, change: 0.4, changePercent: 0.4, eligibleForGate: true, freshnessStatus: 'LIVE', source: 'ETF_PROXY', unavailableReason: null, sourceLabel: null });
  const wheat = row({ symbol: 'WHEAT', name: 'Wheat', category: 'Agriculture', price: 200, change: 0.1, changePercent: 0.1, eligibleForGate: true, freshnessStatus: 'DELAYED', source: 'LEGACY_MONTHLY', unavailableReason: null, sourceLabel: null });
  const copper = metal('COPPER', 'Copper', 1.2, true);
  const aluminum = metal('ALUMINUM', 'Aluminum', 0.2, true);
  const gold = metal('GOLD', 'Gold', null, false);
  const commodities = [energy, copper, aluminum, wheat, gold];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes('economic-indicators') ? {} : {
      success: true,
      commodities,
      byCategory: {
        Energy: [energy],
        Metals: [copper, aluminum, gold],
        Agriculture: [wheat],
      },
      summary: { totalCommodities: 4, gainers: 4, losers: 0, avgChange: 0.4, topGainer: copper, topLoser: null },
      dataHealth: { gateReady: true, eligibleCount: 4, totalCount: 5, staleSymbols: [] },
      sourceAsOf: '2026-10-06',
      lastUpdate: '2026-10-06T04:00:00Z',
    }),
  })));
  const { container } = render(<CommoditiesPage embedded />);
  await screen.findByText('Growth proxy');
  expect(container.querySelector('[data-growth-proxy]')?.textContent).toBe('unavailable');
  expect(container.querySelector('[data-copper-vs-gold]')?.textContent).toBe('unavailable');
  const context = pageContext.setPageData.mock.calls.at(-1)?.[0];
  expect(context.data.commodities.some((item: { symbol: string }) => item.symbol === 'GOLD')).toBe(false);
  expect(context.data.commodityGate.relative.copperVsGold).toBeNull();
  expect(context.data.commodityGate.growthTrend).toBeNull();
  expect(context.data.commodityGate.impulseType).not.toBe('INFLATION');
});
