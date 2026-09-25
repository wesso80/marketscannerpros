/**
 * Regression: the Pro Scanner must return candidates for a normal universe at the UI's DEFAULT filters
 * (Factor agreement 2/4+, Min evidence Any) for equity, crypto and forex.
 *
 * Root cause guarded here: the cached-equity path dropped EMA20/EMA50/Bollinger/DI from each row, so the canonical
 * engine (snapshot mode) BLOCKed every row "INSUFFICIENT_HISTORY" with a neutral side, which projected onto the row
 * as direction = neutral → 0/4 factor agreement → every candidate excluded ("Factor agreement (303)").
 *
 * After #51 (~86% of rows are canonical "No setup" by design) a no-setup row must keep the indicator factor-bias side
 * so it is still filterable; only hard blocks lose their side. All data below is synthetic.
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
/** 5 uptrends, 5 mirrored downtrends, 2 sideways ranges — a normal mix, so the filter still has something to drop. */
const trendOf = (i: number): 1 | -1 | 0 => (i >= 10 ? 0 : i % 2 === 0 ? 1 : -1);

/** Synthetic daily closes ending yesterday (UTC): drift by trend plus two overlapping swings (pullbacks, noise). */
function closes(i: number, n = 300) {
  const end = Date.now() - DAY_MS;
  return Array.from({ length: n }, (_, d) => ({
    t: new Date(end - (n - 1 - d) * DAY_MS).toISOString().slice(0, 10),
    close: 100 + trendOf(i) * d * 0.12 + Math.sin(d / 4 + i) * 1.5 + Math.sin(d / 11 + i) * 2,
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
  const statuses: string[] = [];
  for (const pick of data.topPicks) {
    // Every returned row carries the canonical verdict and a readable label (setup / "No setup: <why>").
    expect(pick.canonical).toBeTruthy();
    expect(pick.canonicalLabel).toMatch(/^(WATCH · .+|No setup(: .+)?)$/);
    expect(pick.canonical.permission).not.toBe('PASS'); // factors-only mode: no validated edge
    expect(pick.canonicalStatus).not.toBe('HARD_BLOCK');
    expect(pick.canonical.blockReasons.map((r: { code: string }) => r.code)).not.toContain('INSUFFICIENT_HISTORY');
    expect(pick.direction).not.toBe('neutral');
    // Side = the canonical setup's side, or the indicator factor bias when there is no setup.
    expect(pick.directionBasis).toBe(pick.canonical.direction === 'neutral' ? 'factor_bias' : 'canonical_setup');
    statuses.push(pick.canonicalStatus);
  }
  // Rows with a canonical setup sort above no-setup rows.
  const lastSetup = statuses.lastIndexOf('SETUP'), firstNoSetup = statuses.indexOf('NO_SETUP');
  if (lastSetup >= 0 && firstNoSetup >= 0) expect(lastSetup).toBeLessThan(firstNoSetup);
  return statuses;
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
      const t = trendOf(i); const price = 100 + t * 35;
      return [symbol, {
        price, rsi: 50 + t * 11, macdLine: t * 1.2, macdSignal: t * 0.8, macdHist: t * 0.4,
        ema20: price - t * 3, ema50: price - t * 7, ema200: price - t * 20, atr: price * 0.02, adx: t ? 27 : 14,
        plusDI: 21 + t * 7, minusDI: 21 - t * 7, stochK: 50 + t * 15, stochD: 50, cci: t * 80,
        aroonUp: 50 + t * 35, aroonDown: 50 - t * 35, bbUpper: price * 1.04, bbMiddle: price, bbLower: price * 0.96,
        volume: 2_300_000, changePct: t * 0.8, latestTradingDay: new Date(Date.now() - DAY_MS).toISOString().slice(0, 10),
      }];
    })));
    const data = await post({ type: 'equity', mode: 'hybrid' });
    expect(data.mode).toBe('cached');
    expectUsableDefaultResults(data, symbols.length);
    expect(data.selection.exclusions['Factor agreement'] ?? 0).toBeLessThan(symbols.length);
    // The canonical engine now sees the EMA/Bollinger inputs the worker cache already had.
    expect(data.topPicks[0].canonical.raw.ema50).not.toBeNull();
  });

  it('crypto (Deep): no-setup rows keep their factor-bias side instead of vanishing', async () => {
    mocks.query.mockResolvedValue(symbols.map((symbol) => ({ symbol })));
    mocks.series.mockImplementation(async (symbol: string, _tf: string, _now: number, opts: { coinId: string }) => {
      const bars = closes(symbols.indexOf(symbol)).map((b) => ({ t: `${b.t}T00:00:00.000Z`, open: b.close - 0.4, high: b.close + 1, low: b.close - 1, close: b.close, volume: 80_000_000 }));
      return { symbol, bars, barInterval: '1d', lastCompletedBarAt: bars[bars.length - 1].t, volumeBasis: 'market_chart_24h', coinId: opts.coinId };
    });
    const data = await post({ type: 'crypto', mode: 'deep' });
    expect(data.mode).toBe('deep');
    const statuses = expectUsableDefaultResults(data, symbols.length);
    expect(statuses).toContain('NO_SETUP');
    const sides = new Set(data.topPicks.map((p: { direction: string }) => p.direction));
    expect(sides).toEqual(new Set(['bullish', 'bearish'])); // symmetric fixture: both sides survive
  });

  it('crypto hard blocks (liquidity) are excluded with a named reason, not "Factor agreement"', async () => {
    mocks.query.mockResolvedValue(symbols.slice(0, 4).map((symbol) => ({ symbol })));
    mocks.series.mockImplementation(async (symbol: string, _tf: string, _now: number, opts: { coinId: string }) => {
      const bars = closes(symbols.indexOf(symbol)).map((b) => ({ t: `${b.t}T00:00:00.000Z`, open: b.close - 0.4, high: b.close + 1, low: b.close - 1, close: b.close, volume: 1_000_000 }));
      return { symbol, bars, barInterval: '1d', lastCompletedBarAt: bars[bars.length - 1].t, volumeBasis: 'market_chart_24h', coinId: opts.coinId };
    });
    const data = await post({ type: 'crypto', mode: 'deep' });
    expect(data.topPicks).toEqual([]);
    expect(data.selection.exclusions).toEqual({ 'Blocked (data, earnings or liquidity)': 4 });
  });

  it('forex (bar time attached, so rows are no longer "data unreliable")', async () => {
    mocks.query.mockResolvedValue(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD'].map((symbol) => ({ symbol })));
    const data = await post({ type: 'forex', mode: 'hybrid' });
    expectUsableDefaultResults(data, 4);
    for (const pick of data.topPicks) {
      expect(pick.dataBasis.lastCompletedBarAt).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
      expect(pick.canonical.blockReasons.map((r: { code: string }) => r.code)).not.toContain('DATA_UNRELIABLE');
    }
  });
});
