// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SymbolComparisonChart from '@/components/research/SymbolComparisonChart';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const model = (symbol = 'AAPL') => ({ symbol, type: 'equity', dates: ['2026-10-05', '2026-10-06'], from: '2026-10-05', to: '2026-10-06', requestedDays: 90, returnPairs: 1, missing: [], basis: 'fixture', series: [{ symbol, source: 'fixture', values: [0, 2], changePct: 2, correlation: null }, { symbol: 'SPY', source: 'fixture', values: [0, 1], changePct: 1, correlation: null }] });
it('renders the curve, supports date inspection and refetches the selected period', async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => model() })); vi.stubGlobal('fetch', fetcher);
  render(<SymbolComparisonChart symbol="AAPL" type="equity" />);
  await screen.findByRole('img');
  expect(screen.getByText('+2.00%')).toBeTruthy();
  fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });
  expect(screen.getAllByText('+0.00%')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: '1M' }));
  await waitFor(() => expect(fetcher.mock.calls.length).toBe(2));
  expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('days=30');
});
it('does not show previous-symbol data while a new request is pending', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => model() }).mockImplementationOnce(() => new Promise(() => {})));
  const { rerender } = render(<SymbolComparisonChart symbol="AAPL" type="equity" />);
  await screen.findByRole('img'); rerender(<SymbolComparisonChart symbol="MSFT" type="equity" />);
  expect(screen.queryByRole('img')).toBeNull(); expect(screen.getByRole('status').textContent).toContain('Loading');
});
it('shows unavailable instead of drawing an invalid response', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  render(<SymbolComparisonChart symbol="ETH" type="crypto" />);
  await screen.findByText('Matching comparison data unavailable');
});

it('retains the selected period across modes and does not fabricate missing price history', async () => {
 const fetcher=vi.fn(async()=>({ok:true,json:async()=>model()}));vi.stubGlobal('fetch',fetcher);
 render(<SymbolComparisonChart symbol="AAPL" type="equity"/>);await screen.findByRole('img');
 fireEvent.click(screen.getByRole('button',{name:'1M'}));await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 fireEvent.click(screen.getByRole('button',{name:'Price & indicators'}));
 expect(await screen.findByText('Price history unavailable.')).toBeTruthy();
 expect(screen.getByRole('checkbox',{name:'Moving averages'}).getAttribute('checked')).not.toBeNull();
 expect(screen.getByRole('button',{name:'1M'}).getAttribute('aria-pressed')).toBe('true');
 fireEvent.click(screen.getByRole('button',{name:'Compare',exact:true}));expect(screen.getByRole('img')).toBeTruthy();
 expect(fetcher).toHaveBeenCalledTimes(2);
});
