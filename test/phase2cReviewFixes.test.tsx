// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const tierState = vi.hoisted(() => ({
  tier: 'pro' as 'pro' | 'free' | 'anonymous' | 'pro_trader',
  isLoading: false,
  isAdmin: false,
  isLoggedIn: true,
  email: null as string | null,
}));

const chain = vi.hoisted(() => ({
  contracts: [] as Array<Record<string, unknown>>,
  expirations: [] as Array<Record<string, unknown>>,
  underlyingPrice: 0,
  spotObservation: null as null | { price: number; asOf?: string; changePercent?: number },
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
  fetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/tools/scanner',
}));
vi.mock('@/lib/useUserTier', async () => {
  const actual = await vi.importActual<typeof import('@/lib/useUserTier')>('@/lib/useUserTier');
  return { ...actual, useUserTier: () => tierState };
});
vi.mock('@/app/v2/_lib/V2Context', () => ({
  useV2: () => ({ navigateTo: () => {}, selectSymbol: () => {} }),
}));
vi.mock('@/app/v2/_lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/app/v2/_lib/api')>('@/app/v2/_lib/api');
  const idle = { data: { results: [], metadata: { count: 0, timestamp: '', dataQuality: null } }, error: null, loading: false, isAuthError: false, isUpgradeRequired: false, refetch: () => {} };
  return { ...actual, useScannerResults: () => idle, useRegime: () => ({ data: null, loading: false, error: null, refetch: () => {} }) };
});
vi.mock('@/hooks/useOptionsChain', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useOptionsChain')>('@/hooks/useOptionsChain');
  return { ...actual, useOptionsChain: () => chain };
});
vi.mock('@/components/options-terminal/OptionsResearchSections', () => ({ default: () => null }));

import ScannerPage from '@/app/tools/scanner/page';
import LiquiditySweepPage from '@/app/tools/liquidity-sweep/page';
import OptionsTerminalView from '@/components/options-terminal/OptionsTerminalView';

const sweepPayload = { success: true, type: 'equity', scanned: 2, sweepCount: 0, nearLevelCount: 0, results: [], duration: '1ms' };
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/api/liquidity-sweep')) {
    return { ok: true, status: 200, json: async () => sweepPayload };
  }
  return { ok: true, status: 200, json: async () => ({}) };
});

function sweepCalls() {
  return fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/liquidity-sweep'));
}

beforeEach(() => {
  sessionStorage.clear();
  tierState.tier = 'pro';
  tierState.isLoading = false;
  tierState.isLoggedIn = true;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  chain.contracts = [];
  chain.strikeGroups = [];
  chain.underlyingPrice = 0;
  chain.spotObservation = null;
  chain.asOfDate = '';
  chain.provider = 'HISTORICAL_OPTIONS';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('keeps Run Educational Scan outside Advanced filters after a preset', () => {
  render(<ScannerPage />);
  const run = screen.getByTestId('run-educational-scan');
  expect(run.textContent).toMatch(/Run Educational Scan/);
  expect(run.closest('details')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Momentum' }));
  const details = screen.getByText('Advanced filters').closest('details') as HTMLDetailsElement;
  expect(details.open).toBe(false);
  expect(details.contains(screen.getByTestId('run-educational-scan'))).toBe(false);
  expect(screen.getByTestId('run-educational-scan').textContent).toMatch(/Run Educational Scan/);
});

it('shows the locked liquidity preview to a free user and does not scan', async () => {
  tierState.tier = 'free';
  tierState.isLoggedIn = true;
  render(<LiquiditySweepPage />);
  await waitFor(() => expect(screen.getByRole('heading', {name: 'Liquidity Sweep'})).toBeTruthy());
  expect(screen.queryByRole('button', {name: 'Run scan'})).toBeNull();
  expect(sweepCalls()).toHaveLength(0);
  expect(screen.queryByText(/Scan failed/)).toBeNull();
});

it('shows the locked liquidity preview to an anonymous user and does not scan', async () => {
  tierState.tier = 'anonymous';
  tierState.isLoggedIn = false;
  render(<LiquiditySweepPage />);
  await waitFor(() => expect(screen.getByRole('heading', {name: 'Liquidity Sweep'})).toBeTruthy());
  expect(sweepCalls()).toHaveLength(0);
  expect(screen.queryByText(/Scan failed/)).toBeNull();
});

it('does not scan liquidity while the tier is still loading', async () => {
  tierState.tier = 'anonymous';
  tierState.isLoading = true;
  render(<LiquiditySweepPage />);
  expect(screen.getByRole('status').textContent).toContain('Loading access');
  expect(sweepCalls()).toHaveLength(0);
  expect(screen.queryByText(/Scan failed/)).toBeNull();
});

it('auto-scans liquidity once per browser session for a paid user', async () => {
  render(<LiquiditySweepPage />);
  await waitFor(() => expect(sweepCalls()).toHaveLength(1));
  expect(sweepCalls()[0][1]).toMatchObject({ method: 'POST' });
  await waitFor(() => expect(screen.getByText(/2 scanned/)).toBeTruthy());
  cleanup();
  render(<LiquiditySweepPage />);
  await waitFor(() => expect(screen.getByText(/2 scanned/)).toBeTruthy());
  expect(sweepCalls()).toHaveLength(1);
});

it('prints real zeros, a dash only when a chain value is missing, and a readable quote badge', () => {
  const call = {
    contractId: 'SPY', expiration: '2026-11-20', strike: 100, type: 'call', bid: 1.2, ask: 1.3, mark: 1.25, last: 1.24,
    volume: 0, openInterest: undefined, iv: 0, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0, itm: true, spread: 0.1, spreadPct: 8,
  };
  const put = { ...call, type: 'put', bid: 0, ask: 0, volume: 0, openInterest: 0, last: 0, spreadPct: null };
  chain.contracts = [call, put];
  chain.underlyingPrice = 100;
  chain.spotObservation = { price: 100, asOf: '2026-10-02', changePercent: 0.4 };
  chain.asOfDate = '2026-10-02';
  chain.strikeGroups = [{ strike: 100, distFromSpot: 0, distFromSpotAbs: 0, isAtm: true, call, put }];
  render(<OptionsTerminalView symbol="SPY" />);
  expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  expect(screen.getAllByText('0.0%').length).toBeGreaterThan(0);
  expect(screen.getAllByText('0.00').length).toBeGreaterThan(0);
  expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  const badge = screen.getByTestId('no-two-sided-quote');
  expect(badge.textContent).toContain('No two-sided quote');
  for (const cell of screen.getAllByRole('button', { name: '0.00' })) {
    expect(cell.textContent).not.toContain('No two-sided quote');
    expect(cell.contains(badge)).toBe(false);
  }
  const bases = [...document.querySelectorAll('[data-price-stamp]')].map((node) => node.getAttribute('data-price-basis'));
  expect(bases).toContain('last close');
  expect(bases).toContain('quotes: last session');
  expect(document.querySelectorAll('[data-source-line]')).toHaveLength(1);
  expect(screen.getByText(/Chain · select a contract/)).toBeTruthy();
  expect(document.body.textContent || '').not.toMatch(/HISTORICAL_OPTIONS|—/);
});
