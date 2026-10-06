import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ q: vi.fn(), top: vi.fn(), market: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/coingecko', () => ({ getTopGainersLosers: mocks.top, getMarketData: mocks.market }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));

import { isWarrantRightOrUnit, passesServerMoverFilter } from '@/lib/analysis/moverQuality';
import { latestUsSessionDate, previousUsTradingDay } from '@/lib/time/usSession';

const row = (ticker: string, price: string, volume: string, pct = '50%') => ({ ticker, price, change_amount: '1', change_percentage: pct, volume });

describe('equity mover filter (OV-9)', () => {
  it('flags Nasdaq warrants, rights and units', () => {
    for (const t of ['PDYNW', 'NTRBW', 'GLNDW', 'ABCDR', 'ABCDU']) expect(isWarrantRightOrUnit(t), t).toBe(true);
    for (const t of ['GLND', 'AAPL', 'GOOGL', 'BRKB', 'W', 'RUN', 'SNOW']) expect(isWarrantRightOrUnit(t), t).toBe(false);
  });
  it('applies the price and volume floor', () => {
    expect(passesServerMoverFilter({ asset_class: 'equity', ticker: 'APUS', price: '5.03', volume: '2000000' })).toBe(true);
    expect(passesServerMoverFilter({ asset_class: 'equity', ticker: 'DCX', price: '0.0603', volume: '511477710' })).toBe(false);
    expect(passesServerMoverFilter({ asset_class: 'equity', ticker: 'THIN', price: '12', volume: '5000' })).toBe(false);
    expect(passesServerMoverFilter({ asset_class: 'equity', ticker: 'NTRBW', price: '2.4', volume: '7333000' })).toBe(false);
    // Crypto keeps sub-dollar prices but not nano-caps.
    expect(passesServerMoverFilter({ asset_class: 'crypto', ticker: 'DOGE', price: '0.2', volume: '1', market_cap: '3e10' })).toBe(true);
    expect(passesServerMoverFilter({ asset_class: 'crypto', ticker: 'NANO1', price: '0.2', volume: '1', market_cap: '1000000' })).toBe(false);
  });
});

describe('GET /api/market-movers filters equities server-side', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.q.mockResolvedValue([]);
    mocks.top.mockResolvedValue({ top_gainers: [{ symbol: 'sol', usd: 150, usd_24h_change: 5, usd_24h_vol: 1e9, usd_market_cap: 7e10 }], top_losers: [] });
    mocks.market.mockResolvedValue([]);
    process.env.ALPHA_VANTAGE_API_KEY = 'test';
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({
        last_updated: '2026-09-25 16:15:59 US/Eastern',
        top_gainers: [row('PDYNW', '0.0022', '5385129', '175%'), row('NTRBW', '2.4', '7333', '152%'), row('APUS', '5.03', '2500000', '60%'), row('PENY', '0.40', '9000000', '55%')],
        top_losers: [row('JSPRW', '0.0001', '863065', '-92%'), row('BENF', '3.1', '400000', '-30%')],
        most_actively_traded: [row('DCX', '0.0603', '511477710'), row('INTC', '31', '90000000', '2%')],
      }),
    })));
  });

  it('returns no warrants or sub-$1 / thin tickers, so every page sees the same list', async () => {
    const { GET } = await import('@/app/api/market-movers/route');
    const body = await (await GET(new NextRequest('https://example.test/api/market-movers'))).json();
    const eq = (list: any[]) => list.filter((m) => m.asset_class === 'equity').map((m) => m.ticker);
    expect(eq(body.topGainers)).toEqual(['APUS']);
    expect(eq(body.topLosers)).toEqual(['BENF']);
    expect(eq(body.mostActive)).toEqual(['INTC']);
    expect(body.topGainers.some((m: any) => m.asset_class === 'crypto')).toBe(true);
    expect(body.metadata.equityFilter).toMatch(/warrants/);
    // OV-7: the provider's own time for the equity lists, not just the response time.
    expect(body.equityAsOf).toBe('2026-09-25T20:15:59.000Z');
    expect(body.extremeHiddenCount).toBe(0);
  });

  const session = latestUsSessionDate(Date.now());
  const equityClose = (symbol: string, prev: string, day = session, asset = 'equity') => (
    { symbol, prev_close: prev, latest_trading_day: day, asset_type: asset }
  );
  const gainers = () => ({
    last_updated: '2026-09-25 16:15:59 US/Eastern',
    top_gainers: [
      row('APUS', '5.03', '2500000', '60%'),
      row('FAKE', '10', '5000000', '900%'),
      // The feed's own previous close would agree with +200.10%. It must not keep the row.
      { ...row('REAL', '30.01', '1000000', '200.10%'), previous_close: '10' },
    ],
    top_losers: [row('BENF', '3.1', '400000', '-30%')],
    most_actively_traded: [row('INTC', '31', '90000000', '2%')],
  });

  it('keeps an extreme when our stored close matches, and hides one with no stored close', async () => {
    mocks.q.mockImplementation(async (sql: string) => (
      String(sql).includes('prev_close') ? [equityClose('REAL', '10')] : []
    ));
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => gainers() })));
    const { GET } = await import('@/app/api/market-movers/route');
    const body = await (await GET(new NextRequest('https://example.test/api/market-movers'))).json();
    const tickers = (list: any[]) => list.map((m: any) => m.ticker);
    expect(tickers(body.topGainers)).toEqual(expect.arrayContaining(['APUS', 'REAL']));
    expect(tickers(body.topGainers)).not.toContain('FAKE');
    expect(body.extremeHiddenCount).toBe(1);
    expect(JSON.stringify(body)).not.toContain('FAKE');
  });

  it('hides an extreme when the stored close is missing, even if the feed row carries previous_close', async () => {
    mocks.q.mockImplementation(async (sql: string) => (String(sql).includes('prev_close') ? [] : []));
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => gainers() })));
    const { GET } = await import('@/app/api/market-movers/route');
    const body = await (await GET(new NextRequest('https://example.test/api/market-movers'))).json();
    const tickers = (list: any[]) => list.map((m: any) => m.ticker);
    expect(tickers(body.topGainers)).not.toContain('REAL');
    expect(tickers(body.topGainers)).not.toContain('FAKE');
    expect(tickers(body.topGainers)).toContain('APUS');
    expect(body.extremeHiddenCount).toBe(2);
  });

  it('hides every extreme when the stored-close lookup throws', async () => {
    mocks.q.mockImplementation(async (sql: string) => {
      if (String(sql).includes('prev_close')) throw new Error('db down');
      return [];
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => gainers() })));
    const { GET } = await import('@/app/api/market-movers/route');
    const body = await (await GET(new NextRequest('https://example.test/api/market-movers'))).json();
    const tickers = (list: any[]) => list.map((m: any) => m.ticker);
    expect(tickers(body.topGainers).filter((ticker: string) => ticker !== 'SOL')).toEqual(['APUS']);
    expect(body.extremeHiddenCount).toBe(2);
  });

  it('rejects a stored close from the other asset class, a stale session, and counts hides by asset class plus symbol', async () => {
    mocks.top.mockResolvedValue({
      top_gainers: [{ symbol: 'fake', usd: 10, usd_24h_change: 900, usd_24h_vol: 2e7, usd_market_cap: 7e10 }],
      top_losers: [],
    });
    mocks.q.mockImplementation(async (sql: string) => (
      String(sql).includes('prev_close')
        ? [equityClose('REAL', '10', session, 'crypto'), equityClose('FAKE', '1', '2020-01-02', 'equity')]
        : []
    ));
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => gainers() })));
    const { GET } = await import('@/app/api/market-movers/route');
    const body = await (await GET(new NextRequest('https://example.test/api/market-movers'))).json();
    const tickers = (list: any[]) => list.filter((m: any) => m.asset_class === 'equity').map((m: any) => m.ticker);
    expect(tickers(body.topGainers)).not.toContain('REAL');
    expect(body.topGainers.some((m: any) => m.asset_class === 'crypto' && m.ticker === 'FAKE')).toBe(false);
    expect(body.extremeHiddenCount).toBe(3);
    expect(previousUsTradingDay(session) < session).toBe(true);
  });
});
