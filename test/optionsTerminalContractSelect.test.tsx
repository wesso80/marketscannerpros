// @vitest-environment jsdom
import React from 'react';
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';

const chain = vi.hoisted(() => {
  const call = {
    contractId: 'AAPL261120C00100000', expiration: '2026-11-20', strike: 100, type: 'call' as const,
    bid: 1.2, ask: 1.35, mark: 1.25, last: 1.24, volume: 40, openInterest: 80, iv: 0.25,
    delta: 0.5, gamma: 0.01, theta: -0.05, vega: 0.1, rho: 0.01, itm: true, spread: 0.15, spreadPct: 12,
  };
  const put = {...call, contractId: 'AAPL261120P00100000', type: 'put' as const, bid: 1.1, ask: 1.25};
  return {
    contracts: [call, put],
    expirations: [{date: '2026-11-20', dte: 47, label: '20 Nov 2026', calls: 1, puts: 1, totalOI: 160}],
    underlyingPrice: 100,
    spotObservation: {price: 100, asOf: '2026-10-02', changePercent: 0.4},
    provider: 'fixture',
    quoteBasis: 'previous_session',
    asOfDate: '2026-10-02',
    sourceLabel: 'fixture chain',
    providerIssues: [] as string[],
    strikeGroups: [{strike: 100, distFromSpot: 0, distFromSpotAbs: 0, isAtm: true, call, put}],
    bestStrikes: [] as Array<{label: string; strike: number; type: 'call' | 'put'; reason: string}>,
    ivMetrics: {avgIV: 0.25, ivLevel: 'normal' as const, atmStraddleMid: 2.5, expectedMoveAbs: 2, expectedMovePct: 2},
    oiHeatmap: [] as Array<{strike: number; callOI: number; putOI: number; totalOI: number; callVol: number; putVol: number}>,
    loading: false,
    error: null as string | null,
    lastFetchedAt: 1,
    fetch: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({replace: vi.fn()}),
  usePathname: () => '/tools/options',
}));
vi.mock('@/hooks/useOptionsChain', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useOptionsChain')>('@/hooks/useOptionsChain');
  return {...actual, useOptionsChain: () => chain};
});
vi.mock('@/components/options-terminal/OptionsResearchSections', () => ({default: () => null}));

import OptionsTerminalView from '@/components/options-terminal/OptionsTerminalView';

afterEach(() => cleanup());

it('selects a contract and re-renders without a hooks error', () => {
  render(<OptionsTerminalView symbol="AAPL" expiry="2026-11-20" />);
  expect(screen.getByText(/Chain · select a contract/)).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', {name: '1.20'})[0]);
  expect(screen.getByText(/100C ask/)).toBeTruthy();
});
