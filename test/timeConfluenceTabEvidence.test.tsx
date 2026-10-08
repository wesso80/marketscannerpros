// @vitest-environment jsdom
/**
 * Terminal "Time Confluence" tab: after a run it shows the public timing evidence (closes, midpoints, source) and no
 * direction, confidence, score, entry window or trade level. Nested widgets are stubs; fetch is a fake.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => '/tools/terminal' }));
vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => ({ tier: 'pro', isLoading: false }), canAccessTimeScanner: () => true }));
vi.mock('@/components/MarketPressureWidget', () => ({ default: () => <div data-stub="pressure" /> }));
vi.mock('@/components/TimeGravityMapWidget', () => ({ default: () => <div data-stub="gravity" /> }));
vi.mock('@/components/time/CloseCalendar', () => ({ default: () => <div data-stub="calendar" /> }));
vi.mock('@/components/TimeConfluenceWidget', () => ({ default: () => <div data-stub="widget" /> }));
import TimeScannerPage from '@/components/time/TimeScannerPage';

const DATA = {
  contract: 'public-time-confluence-v1', symbol: 'AAPL', scanMode: 'intraday_1h', modeLabel: 'Intraday 1H', primaryTF: '1h', includedTFs: ['30m', '1h', '2h', '4h'], unmeasuredTFs: ['4h'],
  price: { value: 101.5, basis: 'last 30-minute bar close', source: 'Alpha Vantage' }, observedAt: '2026-10-08T14:35:00.000Z', latestBarAt: '2026-10-08T14:30:00.000Z',
  closes: {
    schedule: [{ tf: '1h', tfMinutes: 60, nextCloseAt: '2026-10-08T15:00:00.000Z', minsToClose: 12, midpoint: 100, distanceToMidpointPct: 1.5 }],
    closingNow: { count: 1, timeframes: ['30m'], highestTF: '30m', windowMins: 5 }, closingSoon: { count: 2, timeframes: [{ tf: '1h', minsAway: 12 }, { tf: '4h', minsAway: 72 }] },
    densestWindow: { count: 2, timeframes: ['1h', '4h'], startMins: 60, endMins: 75 }, calendarEvents: { monthEnd: false, weekEnd: true, quarterEnd: false, yearEnd: false, sessionClose: 'ny' }, marketOpen: true, basis: 'Schedule basis.',
  },
  midpoints: { levels: [{ tf: '1h', level: 100, distancePct: 1.5 }, { tf: '2h', level: 99.6, distancePct: 1.91 }], groups: [{ tfs: ['1h', '2h'], levels: [100, 99.6], averageLevel: 99.8 }], basis: 'Midpoint basis.' },
  note: 'Measured timing and price-level evidence only.',
};
const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: DATA, cached: false }), { status: 200 }));
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Time Confluence tab', () => {
  it('requests only the hierarchical mode and shows measured timing evidence without trade advice', async () => {
    render(<TimeScannerPage embeddedInTerminal symbol="AAPL" assetType="equity" />);
    fireEvent.click(screen.getByRole('button', { name: 'Run Time Confluence' }));
    await waitFor(() => expect(document.querySelector('[data-time-evidence]')).toBeTruthy());
    const sent = JSON.parse((fetchMock.mock.calls[0] as any[])[1].body);
    expect(sent.mode).toBe('hierarchical');
    const text = document.body.textContent || '';
    expect(text).toContain('3 timeframe closes in the next 4 hours');
    expect(text).toContain('1 timeframe close within 5 minutes · 2 more within 4 hours');
    expect(text).toContain('Midpoints measured2 of 4');
    expect(text).toContain('Alpha Vantage · last 30-minute bar close');
    expect(text).toContain('Not measured (too few bars): 4h');
    expect(text).toContain('Calendar: Week end · New York session close');
    expect(text).not.toMatch(/Entry|Stop|Take profit|Reaction|Risk Level|R:R|Upside|Downside|bullish|bearish|Alignment|Confidence|Confluence\s*\d|\/ 100|Gate|Window Quality|Key Level|pull\b/i);
  });
  it('does not render a response that is not the public contract', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ success: true, data: { prediction: { direction: 'bullish' }, tradeSetup: { stopLoss: 1 } } }), { status: 200 }));
    render(<TimeScannerPage embeddedInTerminal symbol="AAPL" assetType="equity" />);
    fireEvent.click(screen.getByRole('button', { name: 'Run Time Confluence' }));
    await waitFor(() => expect(screen.getByText('Time scan failed')).toBeTruthy());
    expect(document.querySelector('[data-time-evidence]')).toBeNull();
  });
});
