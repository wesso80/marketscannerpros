// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import CryptoHeatmap from '@/components/CryptoHeatmap';
import { cryptoHeatmapFreshnessLabel } from '@/lib/crypto/heatmapFreshnessLabel';
import { formatMarketTime } from '@/lib/market/priceStamp';

const AS_OF = '2026-10-10T12:34:00.000Z';
const TIME = formatMarketTime(AS_OF, 'UTC')!;

function payload(meta: { stale: boolean; freshnessStatus: string }) {
  return {
    cryptos: [{
      symbol: 'BTC',
      name: 'Bitcoin',
      price: 1,
      change: 0,
      changePercent: 1,
      weight: 55,
      color: '#F7931A',
      marketCap: 1,
    }],
    meta: { lastUpdated: AS_OF, ...meta },
    timestamp: AS_OF,
    source: 'coingecko',
    freshnessStatus: meta.freshnessStatus,
    stale: meta.stale,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('prints one freshness label from asOf and stale, and never both', async () => {
  expect(TIME).toBeTruthy();
  expect(cryptoHeatmapFreshnessLabel({ asOf: AS_OF, stale: false, freshnessStatus: 'fresh' })).toBe(`Updated ${TIME}`);
  expect(cryptoHeatmapFreshnessLabel({ asOf: AS_OF, stale: true, freshnessStatus: 'fresh' })).toBe(`Delayed, as of ${TIME}`);
  expect(cryptoHeatmapFreshnessLabel({ asOf: AS_OF, stale: false, freshnessStatus: 'delayed' })).toBe(`Delayed, as of ${TIME}`);
  expect(cryptoHeatmapFreshnessLabel({ asOf: AS_OF, stale: false, freshnessStatus: 'stale' })).toBe(`Delayed, as of ${TIME}`);
  expect(cryptoHeatmapFreshnessLabel({ asOf: null, stale: false, freshnessStatus: 'fresh' })).toBe('Updated time unavailable');
  expect(cryptoHeatmapFreshnessLabel({ asOf: null, stale: true })).toBe('Delayed, as of unavailable');

  const source = readFileSync('components/CryptoHeatmap.tsx', 'utf8');
  expect(source).not.toContain('Data updates every 60s');
  expect(source).not.toContain('Last updated');

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload({ stale: false, freshnessStatus: 'fresh' }) }));
  const fresh = render(<CryptoHeatmap />);
  expect(await screen.findByText(`Updated ${TIME}`)).toBeTruthy();
  expect(fresh.container.querySelectorAll('[data-heatmap-freshness]')).toHaveLength(1);
  expect(fresh.container.textContent).not.toMatch(/Delayed|Fresh|updates every 60s|Last updated/);
  fresh.unmount();

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload({ stale: false, freshnessStatus: 'delayed' }) }));
  const delayed = render(<CryptoHeatmap />);
  expect(await screen.findByText(`Delayed, as of ${TIME}`)).toBeTruthy();
  expect(delayed.container.querySelectorAll('[data-heatmap-freshness]')).toHaveLength(1);
  expect(delayed.container.textContent).not.toMatch(/\bUpdated\b|Fresh|updates every 60s|Last updated/);
  delayed.unmount();

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload({ stale: true, freshnessStatus: 'stale' }) }));
  const stale = render(<CryptoHeatmap />);
  expect(await screen.findByText(`Delayed, as of ${TIME}`)).toBeTruthy();
  expect(stale.container.textContent).not.toMatch(/\bUpdated\b|Fresh|updates every 60s|Last updated/);
});
