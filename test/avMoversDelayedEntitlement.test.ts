import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ q: vi.fn(), top: vi.fn(), market: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/coingecko', () => ({ getTopGainersLosers: mocks.top, getMarketData: mocks.market }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));

import { AV_US_EQUITY_ENTITLEMENT, avEquityEntitlementParam, formatEasternAsOf } from '@/lib/alphaVantageEntitlement';

describe('Alpha Vantage US equity entitlement (OV-14)', () => {
  it('is the licensed 15-minute delayed feed', () => {
    expect(AV_US_EQUITY_ENTITLEMENT).toBe('delayed');
    expect(avEquityEntitlementParam()).toBe('&entitlement=delayed');
  });

  it('formats the provider time as "as of HH:MM ET", adding the date when it is not today in New York', () => {
    const fri1600Et = '2026-09-25T20:00:00.000Z';
    expect(formatEasternAsOf('2026-09-25T19:45:00.000Z', Date.parse(fri1600Et))).toBe('as of 15:45 ET');
    expect(formatEasternAsOf('2026-09-25T20:15:59.000Z', Date.parse('2026-09-26T08:00:00Z'))).toBe('as of 16:15 ET, Fri 25 Sep');
    expect(formatEasternAsOf('2026-01-15T15:00:00.000Z', Date.parse('2026-01-15T16:00:00Z'))).toBe('as of 10:00 ET');
    expect(formatEasternAsOf(null)).toBeNull();
    expect(formatEasternAsOf('nope')).toBeNull();
  });

  it('both TOP_GAINERS_LOSERS calls send the entitlement (market movers route + Pro scan)', () => {
    for (const file of ['app/api/market-movers/route.ts', 'app/api/scanner/bulk/route.ts']) {
      const src = readFileSync(resolve(__dirname, '..', file), 'utf8');
      const line = src.split('\n').find((l) => l.includes('function=TOP_GAINERS_LOSERS'));
      expect(line, file).toContain('avEquityEntitlementParam()');
    }
  });
});

describe('GET /api/market-movers requests delayed movers', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.q.mockResolvedValue([]);
    mocks.top.mockResolvedValue({ top_gainers: [], top_losers: [] });
    mocks.market.mockResolvedValue([]);
    process.env.ALPHA_VANTAGE_API_KEY = 'test';
    mocks.fetch.mockReset();
    mocks.fetch.mockImplementation(async () => ({ json: async () => ({ last_updated: '2026-09-25 15:44:01 US/Eastern', top_gainers: [{ ticker: 'APUS', price: '5.03', change_amount: '1', change_percentage: '60%', volume: '2500000' }], top_losers: [], most_actively_traded: [] }) }));
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('sends entitlement=delayed and returns the provider as-of time', async () => {
    const { GET } = await import('@/app/api/market-movers/route');
    const body = await (await GET(new NextRequest('https://example.test/api/market-movers'))).json();
    const avUrl = String(mocks.fetch.mock.calls.map((c) => c[0]).find((u) => String(u).includes('TOP_GAINERS_LOSERS')));
    expect(new URL(avUrl).searchParams.get('entitlement')).toBe('delayed');
    expect(body.equityAsOf).toBe('2026-09-25T19:44:01.000Z');
  });
});

describe('movers surfaces show the delayed basis', () => {
  const dashboard = readFileSync(resolve(__dirname, '../app/tools/dashboard/page.tsx'), 'utf8');
  const moversPage = readFileSync(resolve(__dirname, '../app/tools/market-movers/page.tsx'), 'utf8');
  it('dashboard equity movers: "15-min delayed" + as-of; crypto keeps "Live movement"', () => {
    expect(dashboard).toMatch(/title="Equity movers" eyebrow="15-min delayed" action=\{formatEasternAsOf\(movers\.data\?\.equityAsOf\)/);
    expect(dashboard).toContain('<PanelHeader title="Crypto movers" eyebrow="Live movement" />');
  });
  it('Movers tab carries equityAsOf into a "US equities" status chip', () => {
    expect(moversPage).toContain('equityAsOf: result.equityAsOf ?? null');
    expect(moversPage).toContain("['US equities', `15-min delayed");
  });
});
