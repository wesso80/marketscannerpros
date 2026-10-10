// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import EquityTop from '@/components/crypto/top/EquityTop';
import type { PublicSymbolPacket } from '@/lib/research/publicSymbolPacket';

const daily = Array.from({ length: 30 }, (_, i) => ({ t: `2026-09-${String(i + 1).padStart(2, '0')}`, close: 100 + i, high: 101 + i, low: 99 + i }));

function packet(chart: boolean): PublicSymbolPacket {
  return {
    contract: 'public-symbol-v2',
    meta: { symbol: 'AAPL', assetClass: 'equity', price: 120, asOfTs: '2026-10-09', timeframe: '1D' },
    priceEvidence: null,
    dailyChart: chart ? { basis: 'alpha_vantage TIME_SERIES_DAILY_ADJUSTED', bars: daily.map((b) => ({ t: b.t, h: b.high, l: b.low, c: b.close })) } : null,
    timingEvidence: null,
    optionsRequest: null,
    canonical: null,
    layer2: { setup: { keyLevels: [] } },
    layer3: {
      structure: { trend: { closeVsSma50: 'unknown', closeVsSma20: 'unknown', lastBar: 'unknown', basis: '' }, volatility: { regime: 'normal' }, liquidity: {} },
      momentum: { indicators: [] },
      options: null,
      timeConfluence: null,
    },
  } as PublicSymbolPacket;
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ ok: false }) }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('draws the report candles and does not call /api/bars', async () => {
  const { container } = render(<EquityTop data={packet(true)} />);
  await screen.findByRole('img');
  expect(fetch).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Alpha Vantage daily (adjusted)');
  expect(container.textContent).toContain('30 Sept');
  expect(container.textContent).not.toContain('Daily chart feed failed');
  expect(container.textContent).not.toContain('Daily chart feed has no bars');
});

it('shows the amber failure when the report has no series and /api/bars rejects the visitor', async () => {
  render(<EquityTop data={packet(false)} />);
  expect((await screen.findByRole('status')).textContent).toContain('Daily chart feed failed');
  expect(screen.getByText('Daily chart feed has no bars for this symbol.')).toBeTruthy();
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/api/bars?symbol=AAPL');
});
