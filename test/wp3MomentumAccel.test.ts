import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { momentumAccelFromBars, momentumAccelFromWarmup } from '@/lib/movers/momentumAccel';

const mocks = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: (...args: unknown[]) => mocks.q(...args) }));
vi.mock('@/lib/coingecko', () => ({
  getTopGainersLosers: async () => ({ top_gainers: [], top_losers: [] }),
  getMarketData: async () => [],
}));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));

const bar = (i: number) => ({ close: 100 + i, high: 101 + i, low: 99 + i, volume: 1_000 + i * 50 });
const series = (n: number) => Array.from({ length: n }, (_, i) => bar(i));

describe('momentum_accel contract', () => {
  it('is a number for 35 or more bars and null below that', () => {
    expect(momentumAccelFromBars(series(34))).toBeNull();
    expect(momentumAccelFromBars(series(35))).toEqual(expect.any(Number));
  });

  it('computes from a warmup status object when stored bars are supplied, and stays null without them', () => {
    const status = { timeframe: 'daily', barCount: 100, coreReady: true, ready: { rsi14: true }, missingIndicators: [] };
    expect(momentumAccelFromWarmup(status, null)).toBeNull();
    expect(momentumAccelFromWarmup(status, series(40))).toEqual(expect.any(Number));
    expect(momentumAccelFromWarmup(series(40))).toEqual(expect.any(Number));
    expect(momentumAccelFromWarmup({ note: 'not a warmup' }, series(40))).toBeNull();
  });
});

describe('GET /api/market-movers momentum_accel', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ALPHA_VANTAGE_API_KEY = 'test';
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        last_updated: '2026-10-02 16:00:00 US/Eastern',
        top_gainers: [
          { ticker: 'NVDA', price: '120', change_amount: '2', change_percentage: '1.70%', volume: '50000000' },
          { ticker: 'AMOD', price: '4.2', change_amount: '0.4', change_percentage: '10.00%', volume: '800000' },
        ],
        top_losers: [],
        most_actively_traded: [],
      }),
    })));
    const stored = Array.from({ length: 40 }, (_, i) => ({
      symbol: 'NVDA', high: String(101 + i), low: String(99 + i), close: String(100 + i), volume: String(1000 + i * 20), rn: String(40 - i),
    }));
    mocks.q.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('ohlcv_bars')) return stored;
      if (text.includes('warmup_json')) return [{ symbol: 'NVDA', warmup_json: { barCount: 100, coreReady: true, timeframe: 'daily' } }];
      if (text.includes('FROM indicators_latest')) return [{ symbol: 'NVDA', rsi14: '55', ema200: null, adx14: '22', in_squeeze: false }];
      if (text.includes('quotes_latest')) return [{ symbol: 'SPY', change_percent: '0.2' }, { symbol: 'BTC', change_percent: '1' }];
      return [];
    });
  });

  it('computes momentum_accel for an in-universe symbol and leaves a non-universe ticker unmarked', async () => {
    const { GET } = await import('@/app/api/market-movers/route');
    const body = await (await GET(new NextRequest('https://example.test/api/market-movers'))).json();
    const nvda = body.topGainers.find((row: { ticker: string }) => row.ticker === 'NVDA');
    const amod = body.topGainers.find((row: { ticker: string }) => row.ticker === 'AMOD');
    expect(nvda.in_universe).toBe(true);
    expect(nvda.momentum_accel).toEqual(expect.any(Number));
    expect(nvda.ema200_dist).toBeNull();
    expect(amod.in_universe).toBe(false);
    expect(amod.momentum_accel).toBeNull();
  });
});
