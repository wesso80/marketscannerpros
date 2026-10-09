// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FindSymbols from '@/components/scanner/FindSymbols';
import { buildPublicScannerObservations } from '@/lib/scanner/publicObservations';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('does not scan on mount; filters loaded observations without extra calls and retains zero', async () => {
  const packet = buildPublicScannerObservations([{ symbol: 'AAPL', type: 'equity', price: 200, rsi: 0, adx: 0, ema200: 190 }, { symbol: 'MSFT', type: 'equity', price: 400, rsi: 80, adx: 20, ema200: 390 }]);
  const fetch = vi.fn(async () => ({ ok: true, json: async () => packet })); vi.stubGlobal('fetch', fetch);
  render(<FindSymbols />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Find symbols' }));
  await screen.findByRole('link', { name: 'AAPL' });
  expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText('RSI at most'), { target: { value: '15' } });
  await waitFor(() => expect(screen.queryByRole('link', { name: 'MSFT' })).toBeNull());
  expect(screen.getByRole('link', { name: 'AAPL' }).getAttribute('href')).toContain('type=equity');
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Market'), { target: { value: 'crypto' } });
  expect(screen.queryByRole('link', { name: 'AAPL' })).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('shows failed requests without invented readings', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Scan allowance reached.' }) })));
  render(<FindSymbols />); fireEvent.click(screen.getByRole('button', { name: 'Find symbols' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Scan allowance reached.');
  expect(screen.queryAllByRole('article')).toHaveLength(0);
});
