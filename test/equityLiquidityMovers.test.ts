/**
 * Equity Pro Scanner regressions (Sep 2026, US session open): 144/305 rows hard-blocked, 54 rows "noCachedRow".
 *  1. LIQUIDITY_MIN read price × TODAY's partial live volume instead of the 20-session average daily volume.
 *  2. AV top movers outside the worker cache were appended to the scan list and then silently dropped (bulk-quote
 *     rows use close / previous_close / change_percent; the light scorer read '05. price').
 *  3. Every hard block was reported as "data unavailable" instead of its actual reason.
 * All data below is synthetic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cachedMoversToAdd, completedSessionAvgVolume, parseEquityQuote } from '@/lib/scanner/equityScanInputs';
import { scoreProSnapshot } from '@/lib/scanner/proScore';
import { formatExclusionBreakdown, hardBlockExclusion, parseProFilters, selectProCandidates } from '@/lib/scanner/proSelection';

const mocks = vi.hoisted(() => {
  process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
  return { query: vi.fn(), cache: vi.fn(), fetch: vi.fn() };
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
import { POST } from '@/app/api/scanner/bulk/route';

const DAY_MS = 86_400_000;
const FRI_OPEN = Date.parse('2026-09-25T15:00:00Z'); // Fri 11:00 ET — session open, last closed session = Thu 24 Sep

describe('20-session average volume (completed sessions only)', () => {
  const bars = Array.from({ length: 20 }, (_, i) => ({ ts: new Date(Date.parse('2026-08-27T00:00:00Z') + i * DAY_MS).toISOString(), volume: 2_000_000 }))
    .filter((b) => b.ts.slice(0, 10) <= '2026-09-24')
    .concat([{ ts: '2026-09-25T00:00:00.000Z', volume: 150_000 }]); // today's unfinished bar

  it('drops today\'s unfinished bar while the session is open', () => {
    expect(completedSessionAvgVolume(bars, FRI_OPEN)).toBe(2_000_000);
  });
  it('includes the bar once the session has closed', () => {
    expect(completedSessionAvgVolume(bars, Date.parse('2026-09-25T21:00:00Z'))).toBeLessThan(2_000_000);
  });
  it('needs at least 5 volume bars', () => {
    expect(completedSessionAvgVolume(bars.slice(0, 4), FRI_OPEN)).toBeNull();
  });
});

describe('liquidity hard block uses price × 20d average volume', () => {
  const pick = (direction: 1 | -1, liveVolume: number, avgDailyVolume20: number | null) => ({
    symbol: direction > 0 ? 'LNG' : 'SHT',
    indicators: { price: 20, volume: liveVolume, atr: 0.5, rsi: 50 + direction * 10, adx: 26, ema200: 20 - direction * 2, macd: direction * 0.2, macdSignal: 0 },
    dataBasis: { barInterval: '1d', lastCompletedBarAt: '2026-09-24', historyBars: 300, avgDailyVolume20 },
  });
  const blocks = (p: any) => scoreProSnapshot(p, 'equity', 'daily', {}, false, { nowMs: FRI_OPEN, macroFlags: [] });

  for (const dir of [1, -1] as const) {
    const side = dir > 0 ? 'long' : 'short';
    it(`${side}: mid-session partial volume ($4M so far) no longer blocks a $40M/day stock`, () => {
      const r = blocks(pick(dir, 200_000, 2_000_000));
      expect(r.compositeV2.blockReasons.map((b: { code: string }) => b.code)).not.toContain('LIQUIDITY_MIN');
      expect(r.hardBlockDetail.liquidity).toMatchObject({ status: 'OK', value: 40_000_000 });
    });
    it(`${side}: a genuinely illiquid stock ($2M/day average) still blocks, even on a busy day`, () => {
      const r = blocks(pick(dir, 5_000_000, 100_000));
      expect(r.compositeV2.blockReasons.map((b: { code: string }) => b.code)).toContain('LIQUIDITY_MIN');
      expect(r.hardBlockDetail.liquidity).toMatchObject({ status: 'BELOW_MIN', value: 2_000_000 });
    });
    it(`${side}: falls back to the live volume only when no average is available`, () => {
      expect(blocks(pick(dir, 200_000, null)).hardBlockDetail.liquidity).toMatchObject({ status: 'BELOW_MIN', value: 4_000_000 });
      expect(blocks(pick(dir, 1_000_000, null)).hardBlockDetail.liquidity).toMatchObject({ status: 'OK', value: 20_000_000 });
    });
  }
});

describe('Alpha Vantage quote parsing', () => {
  it('reads REALTIME_BULK_QUOTES close / previous_close / change_percent (gainer and mirrored loser)', () => {
    const up = parseEquityQuote({ symbol: 'UPP', open: '10.00', close: '11.00', previous_close: '10.00', change_percent: '10.0', volume: '3000000' });
    const down = parseEquityQuote({ symbol: 'DWN', open: '10.00', close: '9.00', previous_close: '10.00', change_percent: '-10.0', volume: '3000000' });
    expect(up).toEqual({ price: 11, open: 10, prevClose: 10, changePct: 10, volume: 3_000_000 });
    expect(down).toEqual({ price: 9, open: 10, prevClose: 10, changePct: -10, volume: 3_000_000 });
  });
  it('derives change % from close and previous close when change_percent is missing', () => {
    expect(parseEquityQuote({ close: '12.5', previous_close: '10' }).changePct).toBeCloseTo(25);
    expect(parseEquityQuote({ close: '7.5', previous_close: '10' }).changePct).toBeCloseTo(-25);
  });
  it('still reads GLOBAL_QUOTE rows', () => {
    expect(parseEquityQuote({ '05. price': '101.5', '02. open': '100', '08. previous close': '100', '10. change percent': '1.5%', '06. volume': '1,000' }))
      .toEqual({ price: 101.5, open: 100, prevClose: 100, changePct: 1.5, volume: 1000 });
  });
  it('a row without a price parses as NaN (the scorer drops it)', () => {
    expect(parseEquityQuote({ symbol: 'X' }).price).toBeNaN();
  });
});

describe('movers join the scan only when cached', () => {
  it('keeps cached movers, skips uncached and already-scanned ones, respects room', () => {
    const cached = new Set(['AAA', 'CCC', 'DDD']);
    expect(cachedMoversToAdd(['AAA', 'BBB', 'CCC', 'DDD'], new Set(['AAA']), cached, 5)).toEqual(['CCC', 'DDD']);
    expect(cachedMoversToAdd(['AAA', 'BBB', 'CCC', 'DDD'], new Set(), cached, 1)).toEqual(['AAA']);
    expect(cachedMoversToAdd(['BBB'], new Set(), cached, 5)).toEqual([]);
  });
});

describe('exclusion breakdown names the block reason', () => {
  const blocked = (symbol: string, ...codes: string[]) => ({ symbol, confidence: 50, canonicalStatus: 'HARD_BLOCK', canonical: { blockReasons: codes.map((code) => ({ code, message: code })) } });
  it('one named reason per row; only data problems count as unavailable', () => {
    expect(hardBlockExclusion(blocked('A', 'LIQUIDITY_MIN'))).toEqual({ reason: 'Blocked: liquidity', unavailable: false });
    expect(hardBlockExclusion(blocked('B', 'EARNINGS_IN_WINDOW', 'NO_SETUP'))).toEqual({ reason: 'Blocked: earnings', unavailable: false });
    expect(hardBlockExclusion(blocked('C', 'LIQUIDITY_MIN', 'DATA_UNRELIABLE', 'STALE_DATA'))).toEqual({ reason: 'Blocked: stale data', unavailable: true });
    expect(hardBlockExclusion(blocked('D', 'INSUFFICIENT_HISTORY'))).toEqual({ reason: 'Blocked: short history', unavailable: true });
  });
  it('selection counts each reason and the display groups them', () => {
    const rows = [
      ...['L1', 'L2', 'L3'].map((s) => blocked(s, 'LIQUIDITY_MIN')),
      ...['E1', 'E2', 'E3', 'E4', 'E5'].map((s) => blocked(s, 'EARNINGS_IN_WINDOW')),
      ...['S1', 'S2'].map((s) => blocked(s, 'STALE_DATA', 'DATA_UNRELIABLE')),
    ];
    const sel = selectProCandidates(rows, parseProFilters({}));
    expect(sel.selection.exclusions).toEqual({ 'Blocked: liquidity': 3, 'Blocked: earnings': 5, 'Blocked: stale data': 2 });
    expect(sel.selection.unavailable).toBe(2);
    expect(formatExclusionBreakdown({ ...sel.selection.exclusions, 'Factor agreement': 4 }))
      .toEqual(['Blocked: earnings 5, liquidity 3, stale data 2', 'Factor agreement (4)']);
  });
});

describe('cached equity scan during US hours (route)', () => {
  const symbols = Array.from({ length: 12 }, (_, i) => `T${String.fromCharCode(65 + i)}X`);
  const ILLIQUID = symbols[11];
  const trendOf = (i: number): 1 | -1 | 0 => (i >= 10 ? 0 : i % 2 === 0 ? 1 : -1);
  const bulkQuoteCalls = () => mocks.fetch.mock.calls.filter(([u]) => String(u).includes('REALTIME_BULK_QUOTES')).length;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FRI_OPEN);
    mocks.fetch.mockImplementation(async (url: string) => {
      if (String(url).includes('TOP_GAINERS_LOSERS')) return new Response(JSON.stringify({
        top_gainers: [{ ticker: 'PENNYW' }, { ticker: symbols[0] }, { ticker: 'CACHEDM' }],
        top_losers: [{ ticker: 'JUNKQ' }, { ticker: symbols[1] }],
        most_actively_traded: [{ ticker: 'SPAC.U' }],
      }));
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', mocks.fetch);
    const all = [...symbols, 'CACHEDM'];
    const dailyBars = all.flatMap((symbol, i) => {
      const bars = Array.from({ length: 300 }, (_, d) => ({
        symbol, ts: new Date(FRI_OPEN - (300 - d) * DAY_MS).toISOString().slice(0, 10),
        close: String(100 + trendOf(i % 12) * d * 0.12 + Math.sin(d / 4 + i) * 1.5 + Math.sin(d / 11 + i) * 2),
        volume: symbol === ILLIQUID ? '10000' : '2000000', // ~$1M/day vs ~$200M/day
      }));
      return [...bars, { ...bars[bars.length - 1], ts: '2026-09-25', volume: '20000' }]; // today's unfinished bar
    });
    mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('symbol_universe')) return symbols.map((symbol) => ({ symbol }));
      if (sql.includes('ohlcv_bars') && Array.isArray(params?.[0])) return dailyBars.filter((b) => (params![0] as string[]).includes(b.symbol));
      return [];
    });
    // Worker cache: universe + one mover (CACHEDM). PENNYW / JUNKQ / SPAC.U are not cached.
    mocks.cache.mockImplementation(async (list: string[]) => new Map(list.filter((s) => all.includes(s)).map((symbol) => {
      const t = trendOf(Math.max(0, symbols.indexOf(symbol))); const price = 100 + t * 35;
      return [symbol, {
        price, rsi: 50 + t * 11, macdLine: t * 1.2, macdSignal: t * 0.8, macdHist: t * 0.4,
        ema20: price - t * 3, ema50: price - t * 7, ema200: price - t * 20, atr: price * 0.02, adx: t ? 27 : 14,
        plusDI: 21 + t * 7, minusDI: 21 - t * 7, stochK: 50 + t * 15, stochD: 50, cci: t * 80,
        aroonUp: 50 + t * 35, aroonDown: 50 - t * 35, bbUpper: price * 1.04, bbMiddle: price, bbLower: price * 0.96,
        volume: 20_000, // session volume so far: ~$2M — used to fail the $5M minimum for every row
        changePct: t * 0.8, latestTradingDay: '2026-09-24',
      }];
    })));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  const scan = async () => (await POST(new NextRequest('https://example.test/api/scanner/bulk', {
    method: 'POST', body: JSON.stringify({ type: 'equity', mode: 'hybrid', timeframe: '1d', universeSize: 500, filters: {} }),
    headers: { 'content-type': 'application/json' },
  }))).json();

  it('partial session volume no longer hard-blocks liquid stocks; the illiquid one is blocked by name', async () => {
    const data = await scan();
    expect(data.mode).toBe('cached');
    expect(data.selection.exclusions).toEqual({ 'Blocked: liquidity': 1 });
    expect(data.selection.excludedCandidates).toEqual([{ symbol: ILLIQUID, reason: 'Blocked: liquidity', unavailable: false }]);
    expect(data.selection.unavailable).toBe(0);
    const liquid = data.topPicks.filter((p: any) => p.symbol !== ILLIQUID);
    expect(liquid.length).toBe(12); // 11 liquid universe rows + the cached mover
    for (const p of liquid) {
      expect(p.canonicalStatus).not.toBe('HARD_BLOCK');
      expect(p.dataBasis.avgDailyVolume20).toBe(2_000_000); // today's 20k bar excluded
    }
    const sides = new Set(liquid.map((p: any) => p.direction));
    expect(sides.has('bullish') && sides.has('bearish')).toBe(true);
  });

  it('uncached movers are not added and do not inflate noCachedRow; cached movers still join', async () => {
    const data = await scan();
    const scanned = data.topPicks.map((p: any) => p.symbol);
    for (const s of ['PENNYW', 'JUNKQ', 'SPAC.U']) expect(scanned).not.toContain(s);
    expect(scanned).toContain('CACHEDM');
    expect(data.universe.excludedCounts.noCachedRow).toBe(0);
    expect(bulkQuoteCalls()).toBe(0); // no wasted quote call for rows that could only be dropped
  });
});
