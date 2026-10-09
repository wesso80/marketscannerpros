// @vitest-environment jsdom
import React, { Suspense } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ query: 'symbol=AAPL&type=equity&view=find', tier: 'pro', isAdmin: false, isLoading: false }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
vi.mock('next/dynamic', () => ({ default: (loader: any) => { const Child = React.lazy(loader); return (props: any) => <Suspense fallback={<p>Loading</p>}><Child {...props} /></Suspense>; } }));
vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => state, canAccessUnlimitedScanning: (tier: string) => tier === 'pro' || tier === 'pro_trader' }));
vi.mock('@/components/scanner/FreeScannerModes', () => ({ default: () => <p>Free discovery</p> }));
import SymbolResearchDestination from '@/components/research/SymbolResearchDestination';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Object.assign(state, { query: 'symbol=AAPL&type=equity&view=find', tier: 'pro', isAdmin: false, isLoading: false }); });

it('opens discovery without mounting the report or making a scan request', async () => {
  const report = vi.fn(() => <p>Report hooks mounted</p>); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  render(<SymbolResearchDestination>{React.createElement(report)}</SymbolResearchDestination>);
  await screen.findByRole('heading', { name: 'Find symbols' });
  expect(report).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'Symbol report' }).getAttribute('href')).toBe('/tools/golden-egg?symbol=AAPL&type=equity');
});
it('keeps the existing report mounted only in report view and preserves its query in navigation', () => {
  state.query = 'symbol=BTC&type=crypto&timeframe=weekly';
  render(<SymbolResearchDestination><p>Report content</p></SymbolResearchDestination>);
  expect(screen.getByText('Report content')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Find symbols' }).getAttribute('href')).toContain('symbol=BTC&type=crypto&timeframe=weekly&view=find');
});
it('retains Free discovery access without mounting the paid report', async () => {
  state.tier = 'free';
  render(<SymbolResearchDestination><p>Report content</p></SymbolResearchDestination>);
  await screen.findByText('Free discovery'); expect(screen.queryByText('Report content')).toBeNull();
});
it('sends admins to their retained Scanner', () => {
  state.isAdmin = true;
  render(<SymbolResearchDestination><p>Report content</p></SymbolResearchDestination>);
  expect(screen.getByRole('link', { name: 'Open admin Scanner' }).getAttribute('href')).toBe('/tools/scanner');
});
