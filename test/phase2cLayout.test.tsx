// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const fetched = vi.hoisted(() => vi.fn());
const chain = vi.hoisted(() => ({
  contracts: [] as Array<Record<string, unknown>>,
  expirations: [] as Array<Record<string, unknown>>,
  underlyingPrice: 0,
  spotObservation: null,
  provider: 'HISTORICAL_OPTIONS',
  quoteBasis: 'previous_session',
  asOfDate: '',
  sourceLabel: 'HISTORICAL_OPTIONS',
  providerIssues: [] as string[],
  strikeGroups: [] as Array<Record<string, unknown>>,
  bestStrikes: [] as Array<Record<string, unknown>>,
  ivMetrics: { avgIV: 0, ivLevel: 'normal', atmStraddleMid: null, expectedMoveAbs: 0, expectedMovePct: 0 },
  oiHeatmap: [] as Array<{ strike: number; callOI: number; putOI: number }>,
  loading: false,
  error: null as string | null,
  lastFetchedAt: null,
  fetch: fetched,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/tools/options',
}));
vi.mock('@/hooks/useOptionsChain', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useOptionsChain')>('@/hooks/useOptionsChain');
  return { ...actual, useOptionsChain: () => chain };
});
vi.mock('@/components/options-terminal/OptionsResearchSections', () => ({ default: () => null }));
vi.mock('@/lib/free/funnel', () => ({ trackFreeEvent: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

import OptionsTerminalView from '@/components/options-terminal/OptionsTerminalView';
import FreeScannerModes from '@/components/scanner/FreeScannerModes';
import { OverviewPicks } from '@/components/market/OverviewPicks';

afterEach(() => {
  cleanup();
  chain.contracts = [];
  chain.strikeGroups = [];
  chain.oiHeatmap = [];
  chain.underlyingPrice = 0;
  fetched.mockReset();
});

const RAW = /HISTORICAL_OPTIONS|UNKNOWN|Unavailable|N\/A|MISSING|DEGRADED|Awaiting data|—/;

it('loads SPY and does not open an empty options desk', () => {
  render(<OptionsTerminalView />);
  expect(fetched).toHaveBeenCalledWith('SPY', undefined);
  expect(screen.queryByText(/Enter a symbol/)).toBeNull();
  expect(document.body.textContent || '').not.toMatch(RAW);
});

it('renders a 7-column chain with a sticky strike and a phone Calls/Puts toggle', () => {
  const call = {
    contractId: 'SPY', expiration: '2026-11-20', strike: 100, type: 'call', bid: 1.2, ask: 1.3, mark: 1.25, last: 1.24,
    volume: 4, openInterest: 8, iv: 0.2, delta: 0.4, gamma: 0.01, theta: -0.02, vega: 0.1, rho: 0, itm: true, spread: 0.1, spreadPct: 8,
  };
  const put = { ...call, type: 'put', bid: 1.1, ask: 1.2 };
  chain.contracts = [call, put];
  chain.underlyingPrice = 100;
  chain.strikeGroups = [{ strike: 100, distFromSpot: 0, distFromSpotAbs: 0, isAtm: true, call, put }];
  chain.oiHeatmap = [{ strike: 100, callOI: 8, putOI: 8 }];
  chain.ivMetrics = { avgIV: 0.2, ivLevel: 'normal', atmStraddleMid: 2.4, expectedMoveAbs: 2, expectedMovePct: 2 };
  render(<OptionsTerminalView symbol="SPY" />);
  for (const name of ['Strike', 'Bid', 'Ask', 'Vol', 'OI', 'IV', 'Delta']) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
  expect(document.querySelector('.sticky-strike')).toBeTruthy();
  expect(document.querySelector('[data-testid="calls-puts-toggle"]')).toBeTruthy();
  const css = readFileSync('app/globals.css', 'utf8');
  expect(css).toMatch(/@media \(max-width: 639px\)[\s\S]*\.msp-options-side-toggle \{ display: flex; \}/);
  const puts = document.querySelector('[data-testid="calls-puts-toggle"] button:last-child') as HTMLButtonElement;
  fireEvent.click(puts);
  expect(puts.getAttribute('aria-pressed')).toBe('true');
});

it('shows a free user the Pro scanner teaser instead of the scan controls', () => {
  render(<FreeScannerModes />);
  expect(screen.getByRole('tab', { name: 'Quick scan' })).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'Pro scanner' }));
  expect(document.querySelector('[data-pro-teaser]')).toBeTruthy();
  expect(screen.queryByText('Run Educational Scan')).toBeNull();
  expect(document.querySelector('#pro-min-confidence')).toBeNull();
  expect(document.body.textContent || '').not.toMatch(RAW);
});

it('shows five daily picks on desktop and three on a phone', () => {
  const rows = ['A', 'B', 'C', 'D', 'E'].map((symbol) => ({ symbol, asset_class: 'equity', grade: 'B', price: 10, scan_date: '2026-10-02' }));
  const html = render(<OverviewPicks rows={rows as never} asset="equity" />).container.innerHTML;
  expect(html.match(/<li/g)).toHaveLength(5);
  expect(html.match(/msp-pick-desktop/g)).toHaveLength(2);
  const page = readFileSync('app/tools/command-center/page.tsx', 'utf8');
  expect(page).toContain('rows.slice(0,5)');
  expect(page).not.toContain('title="Market Regime"');
  expect(page).toContain('Drivers and risk clock');
});

it('keeps Daily Radar candidates ahead of the folded detail', () => {
  const report = readFileSync('components/msp-radar/MspRadarReport.tsx', 'utf8');
  expect(report.indexOf('<CandidateCards')).toBeLessThan(report.indexOf('title="More detail"'));
  expect(report).toContain('title="Data quality and archive"');
});

it('folds crypto derivatives and hides an empty feed wall', () => {
  const page = readFileSync('app/tools/crypto-dashboard/page.tsx', 'utf8');
  expect(page).toContain('title="Research scenarios"');
  expect(page).toContain('Some feeds are not available right now');
  expect(page).toContain('Displayed values may be incomplete.');
  expect(page.indexOf('Some feeds are not available right now')).toBeLessThan(page.indexOf('title="Research scenarios"'));
  expect(page).not.toMatch(/get\('\/api\/crypto\/liquidations'\)/);
  expect(page).not.toContain('Liquidations: not collected');
  expect(page).toContain('24h change on the fixed contract basket, not this total');
  expect(page).toContain('Object.keys(data.prices).length === 0');
});
