/**
 * Regression: the Pro Scanner must return candidates for a normal universe at the UI's DEFAULT filters
 * (Factor agreement 2/4+, Min evidence Any) for equity, crypto and forex.
 *
 * Root cause guarded here: the cached-equity path dropped EMA20/EMA50/Bollinger/DI from each row, so the canonical
 * engine (snapshot mode) BLOCKed every row "INSUFFICIENT_HISTORY" with a neutral side, which projected onto the row
 * as direction = neutral → 0/4 factor agreement → every candidate excluded ("Factor agreement (303)").
 * All data below is synthetic.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
  return { query: vi.fn(), cache: vi.fn(), series: vi.fn() };
});
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'test-workspace', tier: 'pro' }) }));
vi.mock('@/lib/entitlements', () => ({ getEffectiveTier: async () => 'pro' }));
vi.mock('@/lib/adaptiveTrader', () => ({ getAdaptiveLayer: async () => null }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));
vi.mock('@/lib/db', () => ({ q: mocks.query }));
vi.mock('@/lib/scannerCache', () => ({ getBulkCachedScanData: vi.fn(), getBulkCachedScanDataFast: mocks.cache }));
vi.mock('@/lib/coingecko', () => ({
  getMarketData: async () => [], getDerivativesForSymbols: async () => [], getOHLC: async () => [],
  COINGECKO_ID_MAP: {}, resolveSymbolToId: async (symbol: string) => `${symbol.toLowerCase()}-coin`,
}));
vi.mock('@/lib/scanner/cryptoBars', () => ({ fetchCryptoSeries: mocks.series }));
import { POST } from '@/app/api/scanner/bulk/route';

const DAY_MS = 86_400_000;
const DEFAULT_UI_FILTERS = { direction: 'all', quality: 'all', minConfidence: 0, minAlignment: 2, volatility: 'all', squeeze: false, requireRelativeStrength: false };
const symbols = Array.from({ length: 12 }, (_, i) => `T${String.fromCharCode(65 + i)}X`);
const isUp = (i: number) => i % 2 === 0;

/** Trending synthetic closes ending yesterday (UTC); half up, half down. */
function closes(i: number, n = 300) {
  const end = Date.now() - DAY_MS;
  return Array.from({ length: n }, (_, d) => ({
    t: new Date(end - (n - 1 - d) * DAY_MS).toISOString().slice(0, 10),
    close: 100 + (isUp(i) ? 1 : -1) * d * 0.12 + Math.sin(d / 4 + i) * 1.5,
  }));
}

const post = async (body: Record<string, unknown>) => (await POST(new NextRequest('https://example.test/api/scanner/bulk', {
  method: 'POST', body: JSON.stringify({ timeframe: '1d', filters: DEFAULT_UI_FILTERS, ...body }), headers: { 'content-type': 'application/json' },
}))).json();

function expectUsableDefaultResults(data: any, universe: number) {
  expect(data.selection.evaluated).toBe(universe);
  expect(data.selection.matched).toBeGreaterThan(0);
  expect(data.selection.exclusions['Factor inputs unavailable'] ?? 0).toBe(0);
  expect(data.topPicks.length).toBeGreaterThan(0);
  for (const pick of data.topPicks) {
    expect(pick.canonical.blockReasons.map((r: { code: string }) => r.code)).not.toContain('INSUFFICIENT_HISTORY');
    expect(pick.direction).not.toBe('neutral');
  }
}

describe('Pro Scanner returns candidates at default filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('TOP_GAINERS_LOSERS')) return new Response(JSON.stringify({ top_gainers: [], top_losers: [], most_actively_traded: [] }));
      if (u.includes('FX_DAILY')) {
        const from = /from_symbol=(\w{3})/.exec(u)![1];
        const i = ['EUR', 'GBP', 'AUD', 'NZD'].indexOf(from);
        const series: Record<string, Record<string, string>> = {};
        for (const b of closes(i, 100)) {
          const c = b.close / 100;
          series[b.t] = { '1. open': String(c - 0.002), '2. high': String(c + 0.004), '3. low': String(c - 0.004), '4. close': String(c) };
        }
        return new Response(JSON.stringify({ 'Time Series FX (Daily)': series }));
      }
      return new Response('{}', { status: 404 });
    }));
  });

  it('equity (worker cache path) — the Factor agreement regression', async () => {
    const bars = symbols.flatMap((symbol, i) => closes(i).map((b) => ({ symbol, ts: b.t, close: String(b.close), volume: '2000000' })));
    mocks.query.mockImplementation(async (sql: string) => (sql.includes('symbol_universe') ? symbols.map((symbol) => ({ symbol })) : bars));
    mocks.cache.mockImplementation(async (list: string[]) => new Map(list.map((symbol, i) => {
      const up = isUp(i); const price = up ? 135 : 65;
      return [symbol, {
        price, rsi: up ? 61 : 39, macdLine: up ? 1.2 : -1.2, macdSignal: up ? 0.8 : -0.8, macdHist: up ? 0.4 : -0.4,
        ema20: up ? 132 : 68, ema50: up ? 128 : 72, ema200: up ? 115 : 85, atr: price * 0.02, adx: 27,
        plusDI: up ? 28 : 14, minusDI: up ? 14 : 28, stochK: up ? 65 : 35, stochD: 50, cci: up ? 80 : -80,
        aroonUp: up ? 85 : 20, aroonDown: up ? 20 : 85, bbUpper: price * 1.04, bbMiddle: price, bbLower: price * 0.96,
        volume: 2_300_000, changePct: up ? 0.8 : -0.8, latestTradingDay: new Date(Date.now() - DAY_MS).toISOString().slice(0, 10),
      }];
    })));
    const data = await post({ type: 'equity', mode: 'hybrid' });
    expect(data.mode).toBe('cached');
    expectUsableDefaultResults(data, symbols.length);
    expect(data.selection.exclusions['Factor agreement'] ?? 0).toBeLessThan(symbols.length);
    // The canonical engine now sees the EMA/Bollinger inputs the worker cache already had.
    expect(data.topPicks[0].canonical.raw.ema50).not.toBeNull();
  });

  it('crypto (Deep)', async () => {
    mocks.query.mockResolvedValue(symbols.slice(0, 6).map((symbol) => ({ symbol })));
    mocks.series.mockImplementation(async (symbol: string, _tf: string, _now: number, opts: { coinId: string }) => {
      const i = symbols.indexOf(symbol);
      const bars = closes(i).map((b) => ({ t: `${b.t}T00:00:00.000Z`, open: b.close - 0.4, high: b.close + 1, low: b.close - 1, close: b.close, volume: 5_000_000 }));
      return { symbol, bars, barInterval: '1d', lastCompletedBarAt: bars[bars.length - 1].t, volumeBasis: 'market_chart_24h', coinId: opts.coinId };
    });
    const data = await post({ type: 'crypto', mode: 'deep' });
    expect(data.mode).toBe('deep');
    expectUsableDefaultResults(data, 6);
  });

  it('forex', async () => {
    mocks.query.mockResolvedValue(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD'].map((symbol) => ({ symbol })));
    const data = await post({ type: 'forex', mode: 'hybrid' });
    expectUsableDefaultResults(data, 4);
  });
});
