// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import AlertToast from '@/components/AlertToast';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubAlerts(alerts: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/auth/session')) {
      return { ok: true, json: async () => ({ workspaceId: 'ws-1' }) };
    }
    return { ok: true, json: async () => ({ alerts }) };
  }));
}

describe('AlertToast prices', () => {
  it('renders an em dash when the triggered price is null', async () => {
    stubAlerts([{
      id: 't-null',
      symbol: 'BTC',
      condition: 'greed_extreme',
      target_price: null,
      triggered_price: null,
      triggered_at: '2026-10-06T00:00:00.000Z',
    }]);
    render(<AlertToast />);
    expect(await screen.findByText('Triggered at —')).toBeTruthy();
    expect(screen.getByText('greed_extreme —')).toBeTruthy();
  });

  it('formats a numeric string without calling toFixed on the raw value', async () => {
    stubAlerts([{
      id: 't-str',
      symbol: 'AAPL',
      condition: 'price_above',
      target_price: '80',
      triggered_price: '188.5',
      triggered_at: '2026-10-06T00:00:00.000Z',
    }]);
    render(<AlertToast />);
    expect(await screen.findByText('Triggered at $188.50')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('↑ Above $80.00')).toBeTruthy());
  });
});
