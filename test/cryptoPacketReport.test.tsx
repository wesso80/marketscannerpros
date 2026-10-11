// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { buildPayload } from '@/lib/goldenEgg/engine';
import { toPublicSymbolPacket } from '@/lib/research/publicSymbolPacket';
import { now, price, ind } from './fixtures/goldenEggTiming';

const tierState = vi.hoisted(() => ({
  tier: 'anonymous' as 'anonymous' | 'free' | 'pro',
  isLoading: false,
  isLoggedIn: false,
  isAdmin: false,
  email: null as string | null,
}));
vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => tierState }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: any) => <a {...props}>{children}</a> }));

import CryptoBreakdown from '@/components/crypto/CryptoBreakdown';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('known unpaid crypto report does not call the signed-in breakdown feed', async () => {
  tierState.tier = 'anonymous';
  tierState.isLoading = false;
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const pub = toPublicSymbolPacket(buildPayload('BTC', 'crypto', price, ind, null, null, '1D', null, null, null, { nowMs: now }));
  render(<CryptoBreakdown compact symbol="BTC" timeframe="1D" packet={pub} />);
  const needle = pub.priceEvidence?.summary[0] || 'BTC observations from this report.';
  expect(screen.getByText(needle)).toBeTruthy();
  expect(screen.queryByText(/Crypto data feed failed/)).toBeNull();
  expect(document.body.textContent).not.toContain('Daily chart feed has no bars');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).not.toHaveBeenCalled();
});

it('Pro still shows the loaded report when the breakdown feed fails', async () => {
  tierState.tier = 'pro';
  tierState.isLoading = false;
  tierState.isLoggedIn = true;
  const fetchMock = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: 'Crypto breakdown unavailable', secret: 'RAW_BREAKDOWN_BARS' }) }));
  vi.stubGlobal('fetch', fetchMock);
  const pub = toPublicSymbolPacket(buildPayload('BTC', 'crypto', price, ind, null, null, '1D', null, null, null, { nowMs: now }));
  if (pub.canonical) pub.canonical.dataTrust = { ...pub.canonical.dataTrust, level: 'STALE', label: 'STALE', freshness: 'stale' };
  render(<CryptoBreakdown compact symbol="BTC" timeframe="1D" packet={pub} />);
  const needle = pub.priceEvidence?.summary[0] || 'BTC observations from this report.';
  expect(await screen.findByText(needle)).toBeTruthy();
  expect(screen.getByText('Full breakdown unavailable')).toBeTruthy();
  expect(document.querySelector('[data-price-stale]')?.textContent).toBe('STALE');
  expect(screen.queryByText(/Crypto data feed failed/)).toBeNull();
  expect(document.body.textContent).not.toContain('RAW_BREAKDOWN_BARS');
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/crypto/breakdown');
});

it('a refused breakdown response is not rendered when the report packet is already loaded', async () => {
  tierState.isLoading = true;
  const fetchMock = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'Pro access required', secret: 'RAW_BREAKDOWN_BARS' }) }));
  vi.stubGlobal('fetch', fetchMock);
  const pub = toPublicSymbolPacket(buildPayload('BTC', 'crypto', price, ind, null, null, '1D', null, null, null, { nowMs: now }));
  render(<CryptoBreakdown compact symbol="BTC" timeframe="1D" packet={pub} />);
  const needle = pub.priceEvidence?.summary[0] || 'BTC observations from this report.';
  expect(await screen.findByText(needle)).toBeTruthy();
  expect(screen.queryByText(/Crypto data feed failed/)).toBeNull();
  expect(document.body.textContent).not.toContain('RAW_BREAKDOWN_BARS');
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/crypto/breakdown');
});
