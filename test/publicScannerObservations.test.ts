import { describe, expect, it } from 'vitest';
import { buildPublicScannerObservations, matchesFindSymbolFilters, publicScannerObservation } from '@/lib/scanner/publicObservations';

const row = (extra: Record<string, unknown> = {}) => ({ symbol: 'AAPL', type: 'equity', timeframe: 'daily', price: 210, rsi: 0, adx: 0, atr: 0, ema200: 200, macd_hist: -1, dataBasis: { source: 'stored-bars', barInterval: '1d', lastCompletedBarAt: '2026-10-07T20:00:00Z', historyBars: 250 }, ...extra });

describe('public Find symbols observations', () => {
  it('projects known leaves without mutating internal rows or leaking nested private fields', () => {
    const input = row({ score: 99, direction: 'bullish', entry: 211, stop: 195, target: 250, canonical: { secret: 'CANARY' }, dataTrust: { factor: 0.7, reasons: ['CANARY'], missingInputs: [], score: 99 }, dataBasis: { source: 'stored-bars', permission: 'CANARY' } });
    const before = JSON.stringify(input);
    const result = buildPublicScannerObservations([input]);
    expect(JSON.stringify(result)).not.toMatch(/CANARY|canonical|permission|"score"|"direction"|"entry"|"stop"|"target"|"factor"/);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('keeps genuine zeros and signed MACD values', () => {
    const result = publicScannerObservation(row())!;
    expect(result.indicators.rsi.value).toBe(0);
    expect(result.indicators.adx.value).toBe(0);
    expect(result.indicators.atr.value).toBe(0);
    expect(result.indicators.macdHistogram.value).toBe(-1);
  });
  it('does not turn missing or invalid values into zeros', () => {
    const result = publicScannerObservation(row({ rsi: NaN, adx: Infinity, atr: -1, ema200: undefined, price: 0 }))!;
    expect(Object.values(result.indicators).filter(x => x.value === null)).toHaveLength(4);
    expect(result.price.value).toBeNull();
  });
  it('honors explicit missing-input evidence even when an internal neutral placeholder exists', () => {
    const result = publicScannerObservation(row({ rsi: 50, dataTrust: { missingInputs: ['RSI'] } }))!;
    expect(result.indicators.rsi).toEqual({ value: null, missingReason: 'reported_missing' });
    expect(matchesFindSymbolFilters(result, { rsiMax: 60 })).toBe(false);
  });
  it('sorts all evaluated rows alphabetically before pagination, independent of score', () => {
    const inputs = Array.from({ length: 25 }, (_, i) => row({ symbol: `S${String(i).padStart(2, '0')}`, score: i })).reverse();
    const page = buildPublicScannerObservations(inputs, {}, 0, 10);
    expect(page.observations.map(r => r.symbol)).toEqual(inputs.slice().reverse().slice(0, 10).map(r => r.symbol));
    expect(page.selection.matched).toBe(25);
    expect(page.selection.nextOffset).toBe(10);
    expect(buildPublicScannerObservations(inputs, {}, 20, 10).selection.nextOffset).toBeNull();
  });
  it('applies only measured filters before paging', () => {
    const result = buildPublicScannerObservations([row({ symbol: 'AAA', rsi: 90 }), row({ symbol: 'BBB', rsi: 10 }), row({ symbol: 'CCC', rsi: null })], { rsiMax: 15, aboveEma200: true }, 0, 1);
    expect(result.observations.map(r => r.symbol)).toEqual(['BBB']);
    expect(result.selection.matched).toBe(1);
  });
  it('missing EMA cannot satisfy either side of a comparison', () => {
    const result = publicScannerObservation(row({ ema200: null }))!;
    expect(matchesFindSymbolFilters(result, { aboveEma200: true })).toBe(false);
    expect(matchesFindSymbolFilters(result, { aboveEma200: false })).toBe(false);
  });
  it('retains actual interval without inventing quote time from the last bar', () => {
    const result = publicScannerObservation(row({ type: 'crypto', barInterval: '4h', dataBasis: { barInterval: '4h', lastCompletedBarAt: '2026-10-07T20:00:00Z' } }))!;
    expect(result.requestedTimeframe).toBe('daily');
    expect(result.barInterval).toBe('4h');
    expect(result.priceObservedAt).toBeNull();
    expect(result.basis.lastCompletedBarAt).toBe('2026-10-07T20:00:00Z');
  });
  it('rejects score filters, invalid indicator bounds and invalid paging', () => {
    expect(() => buildPublicScannerObservations([], { minScore: 80 } as any)).toThrow();
    expect(() => buildPublicScannerObservations([], { rsiMin: 60, rsiMax: 20 })).toThrow();
    expect(() => buildPublicScannerObservations([], { adxMin: NaN })).toThrow();
    expect(() => buildPublicScannerObservations([], {}, -1)).toThrow();
    expect(() => buildPublicScannerObservations([], {}, 0, 101)).toThrow();
  });
  it('discloses unusable identities rather than fabricating them', () => {
    const result = buildPublicScannerObservations([row(), row({ type: 'forex' }), null, row({ symbol: '' })]);
    expect(result.selection.evaluated).toBe(4);
    expect(result.selection.usableIdentity).toBe(1);
    expect(buildPublicScannerObservations([]).observations).toEqual([]);
  });
});
