import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ range: vi.fn(), cached: vi.fn(), cache: vi.fn(), token: vi.fn() }));
vi.mock('../lib/coingecko', () => ({ getOHLCRange: mocks.range, COINGECKO_ID_MAP: { BTC: 'bitcoin' }, resolveSymbolToId: vi.fn() }));
vi.mock('../lib/redis', () => ({ getCached: mocks.cached, setCached: mocks.cache }));
vi.mock('../lib/avRateGovernor', () => ({ avTakeToken: mocks.token }));

import { fetchCryptoPriceData, fetchStockPriceData, normalizeAlphaVantageBars, normalizeCoinGeckoBacktestCandles, resampleCompleteCryptoBars } from '../lib/backtest/providers';

const row = { '1. open': '100', '2. high': '110', '3. low': '90', '4. close': '100', '5. adjusted close': '50', '6. volume': '1000' };
beforeEach(() => { vi.clearAllMocks(); mocks.cached.mockResolvedValue(null); mocks.cache.mockResolvedValue(true); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('backtest OHLC source integrity', () => {
  it('uses a coherent adjustment for stock open, high, low and close', () => {
    expect(normalizeAlphaVantageBars({ '2026-01-01': row }, false)['2026-01-01']).toEqual({ open: 50, high: 55, low: 45, close: 50, volume: 1000 });
  });
  it('rejects absent adjusted prices and never reads adjusted close as volume', () => {
    expect(() => normalizeAlphaVantageBars({ d: { ...row, '5. adjusted close': '' } }, false)).toThrow(/Invalid/);
    expect(() => normalizeAlphaVantageBars({ d: { ...row, '6. volume': '' } }, false)).toThrow(/Invalid/);
  });
  it('keeps intraday adjustment provenance identical on cold and cached reads', async () => {
    const bars = { '2026-01-01 10:00:00': { open: 100, high: 110, low: 90, close: 100, volume: 1000 } };
    const request = vi.fn().mockResolvedValue({ json: async () => ({ 'Time Series (60min)': { '2026-01-01 10:00:00': { ...row, '5. volume': '1000' } } }) });
    vi.stubGlobal('fetch', request);
    const cold = await fetchStockPriceData('TEST', '60min');
    expect(String(request.mock.calls[0][0])).toContain('adjusted=true');
    mocks.cached.mockResolvedValueOnce(bars);
    const warm = await fetchStockPriceData('TEST', '60min');
    expect(cold).toEqual(warm);
    expect(warm.closeType).toBe('adjusted');
  });
  it('maps genuine daily and hourly candle closes to internal open times', () => {
    const close = Date.parse('2026-01-02T00:00:00Z');
    const candle = [close, 100, 110, 90, 105];
    expect(Object.keys(normalizeCoinGeckoBacktestCandles([candle], 'daily', close))).toEqual(['2026-01-01']);
    expect(Object.keys(normalizeCoinGeckoBacktestCandles([candle], 'hourly', close))).toEqual(['2026-01-01 23:00:00']);
  });
  it('rejects invalid or conflicting candles, deduplicates boundaries and excludes future closes', () => {
    const close = Date.parse('2026-01-02T00:00:00Z');
    const candle = [close, 100, 110, 90, 105];
    expect(Object.keys(normalizeCoinGeckoBacktestCandles([candle, candle], 'daily', close))).toHaveLength(1);
    expect(normalizeCoinGeckoBacktestCandles([candle], 'daily', close - 1)).toEqual({});
    expect(() => normalizeCoinGeckoBacktestCandles([candle, [close, 100, 110, 90, 104]], 'daily', close)).toThrow(/Conflicting/);
    expect(() => normalizeCoinGeckoBacktestCandles([[close, 100, 80, 90, 105]], 'daily', close)).toThrow(/Invalid/);
  });
  it('bounds every daily provider request and returns volume as unavailable', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-02T12:00:00Z'));
    mocks.range.mockResolvedValue([[Date.parse('2026-01-02T00:00:00Z'), 100, 110, 90, 105]]);
    const result = await fetchCryptoPriceData('BTC', 'daily');
    expect(mocks.range).toHaveBeenCalledTimes(7);
    for (const call of mocks.range.mock.calls) {
      expect(call[2] - call[1]).toBeLessThanOrEqual(180 * 86400);
      expect(call[4]).toBe('daily');
    }
    expect(result.priceData['2026-01-01'].close).toBe(105);
    expect(result.volumeUnavailable).toBe(true);
    expect(mocks.cache.mock.calls[0][0]).toContain('bt:v3:');
  });
  it('refuses to manufacture bars when OHLC fails or sub-hour data is requested', async () => {
    mocks.range.mockResolvedValue(null);
    await expect(fetchCryptoPriceData('BTC', 'daily')).rejects.toThrow(/Genuine/);
    expect(mocks.cache).not.toHaveBeenCalled();
    mocks.range.mockClear();
    await expect(fetchCryptoPriceData('BTC', '5min')).rejects.toThrow(/Sub-hour/);
    expect(mocks.range).not.toHaveBeenCalled();
  });
  it('aggregates complete hourly candles and discards partial buckets', () => {
    const data = Object.fromEntries([0, 1, 2, 3, 4].map(hour => [`2026-01-01 0${hour}:00:00`, { open: 100 + hour, high: 110 + hour, low: 90 + hour, close: 105 + hour, volume: 0 }]));
    expect(resampleCompleteCryptoBars(data, 240, 60)).toEqual({ '2026-01-01 00:00:00': { open: 100, high: 113, low: 90, close: 108, volume: 0 } });
    delete data['2026-01-01 01:00:00'];
    expect(resampleCompleteCryptoBars(data, 240, 60)).toEqual({});
  });
});
