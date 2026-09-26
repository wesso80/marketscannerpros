import { describe, expect, it } from 'vitest';
import {
  chunk,
  diffRadar,
  formatScanAge,
  parseBulkQuotePayload,
  selectDeepScanSymbols,
  selectDueSymbols,
  sharedScanUniverse,
  type PriorResult,
  type SharedScanConfig,
} from '@/lib/admin/sharedScanLogic';

const NOW = Date.parse('2026-09-25T17:00:00Z');
const MIN = 60_000;
const cfg: SharedScanConfig = { maxAgeMin: 25, refreshFloorMin: 120, maxDeepScans: 3, movePct: 0.75, dayMovePct: 2 };
const prior = (symbol: string, over: Partial<PriorResult> = {}): PriorResult => ({
  symbol, status: 'ok', scannedAtMs: NOW - 30 * MIN, checkedAtMs: NOW - 30 * MIN, scanPrice: 100, radarCount: 0, ...over,
});

describe('parseBulkQuotePayload', () => {
  it('reads REALTIME_BULK_QUOTES rows, converts the NY timestamp to UTC and drops rows without a price', () => {
    const quotes = parseBulkQuotePayload({
      data: [
        { symbol: 'AAPL', timestamp: '2026-09-25 12:59:58.123', close: '227.50', previous_close: '225.00', change_percent: '1.1111' },
        { symbol: 'msft', close: '410', previous_close: '400' },
        { symbol: 'DEAD', close: '0' },
      ],
    });
    expect([...quotes.keys()]).toEqual(['AAPL', 'MSFT']);
    expect(quotes.get('AAPL')).toMatchObject({ price: 227.5, previousClose: 225, changePercent: 1.1111, quoteAt: '2026-09-25T16:59:58.000Z' });
    // change % derived from price vs previous close when the feed omits it
    expect(quotes.get('MSFT')!.changePercent).toBeCloseTo(2.5, 6);
    expect(quotes.get('MSFT')!.quoteAt).toBeNull();
  });

  it('returns an empty map for error payloads', () => {
    expect(parseBulkQuotePayload(null).size).toBe(0);
    expect(parseBulkQuotePayload({ Information: 'not entitled' }).size).toBe(0);
  });
});

describe('selectDueSymbols', () => {
  it('skips symbols checked within the freshness window and keeps universe order', () => {
    const p = new Map([
      ['AAPL', prior('AAPL', { checkedAtMs: NOW - 5 * MIN })],
      ['MSFT', prior('MSFT', { checkedAtMs: NOW - 40 * MIN })],
    ]);
    expect(selectDueSymbols(['NVDA', 'AAPL', 'MSFT'], p, NOW, 25)).toEqual(['NVDA', 'MSFT']);
    expect(selectDueSymbols(['NVDA', 'AAPL', 'MSFT'], p, NOW, 0)).toEqual(['NVDA', 'AAPL', 'MSFT']);
  });
});

describe('selectDeepScanSymbols (shortlist from bulk quotes)', () => {
  const quote = (symbol: string, price: number, changePercent = 0) => ({ symbol, price, previousClose: null, changePercent, quoteAt: null });

  it('full-scans never-scanned, failed, refresh-floor, movers and radar names; quiet ones are quote-only', () => {
    const p = new Map<string, PriorResult>([
      ['FAIL', prior('FAIL', { status: 'failed' })],
      ['OLD', prior('OLD', { scannedAtMs: NOW - 180 * MIN })],
      ['MOVE', prior('MOVE')],
      ['QUIET', prior('QUIET')],
    ]);
    const quotes = new Map([
      ['NEW', quote('NEW', 10)], ['FAIL', quote('FAIL', 100)], ['OLD', quote('OLD', 100)],
      ['MOVE', quote('MOVE', 101)], ['QUIET', quote('QUIET', 100.1)],
    ]);
    const plan = selectDeepScanSymbols({ due: ['NEW', 'FAIL', 'OLD', 'MOVE', 'QUIET'], prior: p, quotes, nowMs: NOW, cfg: { ...cfg, maxDeepScans: 10 } });
    expect(plan.deep).toEqual(['NEW', 'FAIL', 'OLD', 'MOVE']);
    expect(plan.quoteOnly).toEqual(['QUIET']);
    expect(plan.reasons.MOVE).toMatch(/moved 1\.00%/);
    expect(plan.reasons.QUIET).toBe('quiet');
  });

  it('day change and radar membership also earn a full scan', () => {
    const p = new Map<string, PriorResult>([['DAY', prior('DAY')], ['RADAR', prior('RADAR', { radarCount: 1 })]]);
    const quotes = new Map([['DAY', quote('DAY', 100, -2.5)], ['RADAR', quote('RADAR', 100)]]);
    const plan = selectDeepScanSymbols({ due: ['DAY', 'RADAR'], prior: p, quotes, nowMs: NOW, cfg });
    expect(plan.deep).toEqual(['DAY', 'RADAR']);
  });

  it('caps full scans by priority then move size; over-cap symbols with a quote are quote-only, without are deferred', () => {
    const p = new Map<string, PriorResult>([
      ['M1', prior('M1')], ['M2', prior('M2')], ['M3', prior('M3')],
    ]);
    const quotes = new Map([['M1', quote('M1', 101)], ['M2', quote('M2', 105)], ['M3', quote('M3', 102)]]);
    const plan = selectDeepScanSymbols({ due: ['N1', 'N2', 'M1', 'M2', 'M3'], prior: p, quotes, nowMs: NOW, cfg });
    // N1/N2 never scanned (priority 3), then the biggest mover M2
    expect(plan.deep).toEqual(['N1', 'N2', 'M2']);
    expect(plan.quoteOnly).toEqual(['M1', 'M3']);
    expect(plan.deferred).toEqual([]);
    expect(plan.reasons.M1).toMatch(/over cap/);

    const noQuoteForNew = selectDeepScanSymbols({ due: ['N1', 'N2', 'N3', 'N4'], prior: new Map(), quotes: new Map(), nowMs: NOW, cfg });
    expect(noQuoteForNew.deep).toEqual(['N1', 'N2', 'N3']);
    expect(noQuoteForNew.deferred).toEqual(['N4']);
  });

  it('an over-cap symbol with no saved packet is deferred even with a quote (a quote-only refresh cannot create a row)', () => {
    const p = new Map<string, PriorResult>([['EMPTY', prior('EMPTY', { status: 'failed', hasPacket: false })]]);
    const quotes = new Map([['N1', quote('N1', 10)], ['N2', quote('N2', 10)], ['N3', quote('N3', 10)], ['N4', quote('N4', 10)], ['EMPTY', quote('EMPTY', 10)]]);
    const plan = selectDeepScanSymbols({ due: ['N1', 'N2', 'N3', 'N4', 'EMPTY'], prior: p, quotes, nowMs: NOW, cfg });
    expect(plan.deep).toEqual(['N1', 'N2', 'N3']);
    expect(plan.quoteOnly).toEqual([]);
    expect(plan.deferred).toEqual(['N4', 'EMPTY']);
  });

  it('without bulk quotes every due symbol is a full-scan candidate (capped)', () => {
    const p = new Map<string, PriorResult>([['A', prior('A')], ['B', prior('B')]]);
    const plan = selectDeepScanSymbols({ due: ['A', 'B'], prior: p, quotes: null, nowMs: NOW, cfg });
    expect(plan.deep).toEqual(['A', 'B']);
    expect(plan.reasons.A).toBe('no bulk quotes this run');
  });
});

describe('diffRadar', () => {
  const opp = (symbol: string) => ({ symbol, permission: 'ALLOW', confidenceScore: 0.8 } as never);
  it('reports appeared and dropped symbols only', () => {
    const changes = diffRadar([
      { symbol: 'A', before: null, after: [opp('A')] },
      { symbol: 'B', before: [opp('B')], after: [] },
      { symbol: 'C', before: [opp('C')], after: [opp('C')] },
      { symbol: 'D', before: [], after: [] },
    ], '2026-09-25T17:00:00.000Z');
    expect(changes.map((c) => `${c.symbol}:${c.action}`)).toEqual(['A:appeared', 'B:dropped']);
  });
});

describe('helpers', () => {
  it('universe keeps anchors first and never mixes markets', () => {
    const eq = sharedScanUniverse('EQUITIES');
    const cr = sharedScanUniverse('CRYPTO');
    expect(eq.slice(0, 2)).toEqual(['SPY', 'QQQ']);
    expect(cr.slice(0, 2)).toEqual(['BTC', 'ETH']);
    expect(eq).not.toContain('BTC');
    expect(new Set(eq).size).toBe(eq.length);
  });
  it('chunks for bulk quotes and formats ages', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(formatScanAge(null)).toBe('never');
    expect(formatScanAge(30)).toBe('just now');
    expect(formatScanAge(12 * 60)).toBe('12 min ago');
    expect(formatScanAge(3 * 3600)).toBe('3 h ago');
  });
});
