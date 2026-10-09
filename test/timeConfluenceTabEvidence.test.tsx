// @vitest-environment jsdom
/**
 * Terminal "Time Confluence" tab: after a run it shows the public timing evidence (closes, midpoints, source) and no
 * direction, confidence, score, weight, entry window or trade level. The embedded Close Calendar and Time Gravity Map
 * are REAL: their calendar requests go through the real /api/confluence-scan route and the real calendar engine (auth
 * faked). Only the Market Pressure and scheduled-context widgets are stubs; other fetches return 404.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => '/tools/terminal' }));
vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => ({ tier: 'pro', isLoading: false }), canAccessTimeScanner: () => true }));
vi.mock('@/components/MarketPressureWidget', () => ({ default: () => <div data-stub="pressure" /> }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'ws-a', tier: 'pro' })) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => true }));
vi.mock('@/components/TimeConfluenceWidget', () => ({ default: () => <div data-stub="widget" /> }));
import TimeScannerPage from '@/components/time/TimeScannerPage';
import { POST as confluenceScan } from '@/app/api/confluence-scan/route';
import { NextRequest } from 'next/server';

const DATA = {
  contract: 'public-time-confluence-v1', symbol: 'BTCUSD', scanMode: 'intraday_1h', modeLabel: 'Intraday 1H', primaryTF: '1h', includedTFs: ['30m', '1h', '2h', '4h'], unmeasuredTFs: ['4h'],
  price: { value: 101.5, basis: 'last 30-minute bar close', source: 'CoinGecko' }, observedAt: '2026-10-08T14:35:00.000Z', latestBarAt: '2026-10-08T14:30:00.000Z',
  closes: {
    schedule: [{ tf: '1h', tfMinutes: 60, nextCloseAt: '2026-10-08T15:00:00.000Z', minsToClose: 12, midpoint: 100, distanceToMidpointPct: 1.5 }],
    closingNow: { count: 1, timeframes: ['30m'], highestTF: '30m', windowMins: 5 }, closingSoon: { count: 2, timeframes: [{ tf: '1h', minsAway: 12 }, { tf: '4h', minsAway: 72 }] },
    densestWindow: { count: 2, timeframes: ['1h', '4h'], startMins: 60, endMins: 75 }, calendarEvents: { monthEnd: false, weekEnd: true, quarterEnd: false, yearEnd: false, sessionClose: 'ny' }, marketOpen: true, basis: 'Schedule basis.',
  },
  midpoints: { levels: [{ tf: '1h', level: 100, distancePct: 1.5 }, { tf: '2h', level: 99.6, distancePct: 1.91 }], groups: [{ tfs: ['1h', '2h'], levels: [100, 99.6], averageLevel: 99.8 }], basis: 'Midpoint basis.' },
  note: 'Measured timing and price-level evidence only.',
};
const calendarResponses: any[] = [];
const fetchMock = vi.fn(async (url: any, init?: any) => {
  const path = String(url);
  const body = init?.body ? JSON.parse(init.body) : {};
  if (path.startsWith('/api/confluence-scan') && body.mode === 'calendar') {
    const r = await confluenceScan(new NextRequest('https://msp.test/api/confluence-scan', { method: 'POST', body: init.body }));
    const json = await r.json();
    calendarResponses.push(json);
    return new Response(JSON.stringify(json), { status: r.status });
  }
  if (path.startsWith('/api/confluence-scan')) return new Response(JSON.stringify({ success: true, data: DATA, cached: false }), { status: 200 });
  return new Response(JSON.stringify({ success: false, error: 'not in test' }), { status: 404 });
});
beforeEach(() => {
  // 31 Mar 12:00 UTC: the next UTC midnight closes the daily, monthly and quarterly candles together.
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-03-31T12:00:00.000Z'));
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear(); calendarResponses.length = 0;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Time Confluence tab', () => {
  it('requests only the hierarchical mode and shows measured timing evidence without trade advice', async () => {
    render(<TimeScannerPage embeddedInTerminal symbol="BTCUSD" assetType="crypto" />);
    fireEvent.click(screen.getByRole('button', { name: 'Run Close timing' }));
    await waitFor(() => expect(document.querySelector('[data-time-evidence]')).toBeTruthy());
    const modes = fetchMock.mock.calls.filter((c: any[]) => String(c[0]).startsWith('/api/confluence-scan')).map((c: any[]) => JSON.parse(c[1].body).mode);
    expect(modes).toContain('hierarchical');
    expect(modes.every((m: string) => m === 'hierarchical' || m === 'calendar')).toBe(true);
    // The embedded Close Calendar rendered real windows from the real route, with no weight or score.
    await waitFor(() => expect(document.querySelector('[data-close-windows]')).toBeTruthy(), { timeout: 20_000 });
    expect(calendarResponses.length).toBeGreaterThan(0);
    for (const c of calendarResponses) expect(JSON.stringify(c)).not.toMatch(/"weight"|clusterScore/);
    expect(document.querySelector('[data-close-windows]')!.textContent).toMatch(/Close windows in time order/);
    expect(document.querySelector('[data-close-windows]')!.textContent).toMatch(/\d+ timeframes close/);
    const text = document.body.textContent || '';
    expect(text).toContain('3 timeframe closes in the next 4 hours');
    expect(text).toContain('1 timeframe close within 5 minutes · 2 more within 4 hours');
    expect(text).toContain('Midpoints measured2 of 4');
    expect(text).toContain('CoinGecko · last 30-minute bar close');
    expect(text).toContain('Not measured (too few bars): 4h');
    expect(text).toContain('Calendar: Week end · New York session close');
    expect(text).not.toMatch(/Entry|Stop|Take profit|Reaction|Risk Level|R:R|Upside|Downside|bullish|bearish|Alignment|Confidence|Confluence\s*\d|\/ 100|Gate|Window Quality|Key Level|pull\b/i);
    expect(text).not.toMatch(/\bScore\b|\bWt\b|\bWeight\b/);
  }, 30_000);
  it('does not render a response that is not the public contract', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ success: true, data: { prediction: { direction: 'bullish' }, tradeSetup: { stopLoss: 1 } } }), { status: 200 }));
    render(<TimeScannerPage embeddedInTerminal symbol="BTCUSD" assetType="crypto" />);
    fireEvent.click(screen.getByRole('button', { name: 'Run Close timing' }));
    await waitFor(() => expect(screen.getByText('Time scan failed')).toBeTruthy());
    expect(document.querySelector('[data-time-evidence]')).toBeNull();
  });
});

describe('Time Gravity Map close-calendar panel', () => {
  it('renders the real public calendar without weight or score, windows in time order', async () => {
    const { ForwardSchedulePanel } = await import('@/components/TimeGravityMapWidget');
    const r = await confluenceScan(new NextRequest('https://msp.test/api/confluence-scan', { method: 'POST', body: JSON.stringify({ symbol: 'BTCUSD', mode: 'calendar', assetType: 'crypto', anchor: 'CUSTOM', anchorTime: '2026-03-27T12:00:00.000Z', horizonDays: 10 }) }));
    const cal = (await r.json()).data;
    expect(cal.forwardClusters.length).toBeGreaterThan(1);
    render(<ForwardSchedulePanel calendar={cal} loading={false} />);
    const text = document.body.textContent || '';
    expect(text).toContain('CLOSE CALENDAR');
    expect(text).toContain(`${cal.forwardClusters[0].timeframeCount} timeframes close`);
    expect(text.indexOf(cal.forwardClusters[0].label)).toBeLessThan(text.indexOf(cal.forwardClusters[1].label));
    expect(text).not.toMatch(/\bScore\b|\bWt\b|\bWeight\b/);
    fireEvent.click(screen.getByRole('button', { name: 'Full Schedule' }));
    expect(document.body.textContent || '').not.toMatch(/\bWt\b|\bWeight\b/);
  });
});

describe('every public close-calendar view', () => {
  it('reads the public calendar type and never renders weight or score', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['components/time/CloseCalendar.tsx', 'components/TimeGravityMapWidget.tsx', 'app/tools/terminal/page.tsx', 'components/terminal/GravityResearchView.tsx']) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/clusterScore|cluster\.weight|row\.weight|>Weight<|Wt \{/);
      expect(src, file).not.toMatch(/ForwardCloseCalendar[^\n]*from ['"]@\/lib\/confluence-learning-agent['"]/);
    }
  });
});
