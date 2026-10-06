import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { getQuote, parseYahooChartQuote } from '@/lib/yahoo-finance';
import {
  YAHOO_FUTURES_SOURCE_LABEL,
  commodityFromYahooQuote,
  formatFuturesAsOf,
} from '@/lib/commodities/yahooFutures';
import capturedGoldChart from './fixtures/yahoo-gc-f-chart-2026-10-06.json';

const QUOTE_ISO = '2026-10-06T03:30:00.000Z';

function chart(symbol: string, price: number, previousClose: number, quoteIso: string | null = QUOTE_ISO) {
  return {
    chart: {
      result: [{
        meta: {
          symbol,
          regularMarketPrice: price,
          previousClose,
          regularMarketTime: quoteIso ? Date.parse(quoteIso) / 1000 : undefined,
        },
        indicators: { quote: [{ open: [price - 2], high: [price + 4], low: [price - 6], volume: [1500] }] },
      }],
    },
  };
}

describe('Yahoo futures gold and silver', () => {
  it('works the change out from the previous close', () => {
    const gold = parseYahooChartQuote(chart('GC=F', 4025.5, 4000));
    const silver = parseYahooChartQuote(chart('SI=F', 48.6, 48));
    expect(gold).toMatchObject({
      symbol: 'GC=F',
      price: 4025.5,
      previousClose: 4000,
      change: 25.5,
      quoteTime: QUOTE_ISO,
    });
    expect(gold?.changePercent).toBeCloseTo((25.5 / 4000) * 100, 8);
    expect(silver?.change).toBeCloseTo(0.6, 8);
    expect(silver?.changePercent).toBeCloseTo((0.6 / 48) * 100, 8);

    const goldRow = commodityFromYahooQuote('GOLD', gold);
    const silverRow = commodityFromYahooQuote('SILVER', silver);
    expect(goldRow).toMatchObject({
      symbol: 'GOLD',
      yahooSymbol: 'GC=F',
      price: 4025.5,
      change: 25.5,
      date: '2026-10-06',
      quoteTime: QUOTE_ISO,
      sourceLabel: YAHOO_FUTURES_SOURCE_LABEL,
      unavailableReason: null,
    });
    expect(goldRow.changePercent).toBeCloseTo(0.6375, 8);
    expect(goldRow.asOfLabel).toBe(formatFuturesAsOf(QUOTE_ISO));
    expect(goldRow.asOfLabel).toBe('as of 6 Oct 2026, 14:30 AEDT');
    expect(formatFuturesAsOf('2026-10-05T22:00:00.000Z')).toBe('as of 6 Oct 2026, 09:00 AEDT');
    expect(silverRow).toMatchObject({ yahooSymbol: 'SI=F', sourceLabel: YAHOO_FUTURES_SOURCE_LABEL, price: 48.6 });
    expect(silverRow.changePercent).not.toBe(0);
  });

  it('returns null prices when the fetch fails or the quote has no timestamp', () => {
    for (const quote of [null, parseYahooChartQuote({ chart: { result: [] } }), parseYahooChartQuote(chart('GC=F', 4025.5, 4000, null))]) {
      const row = commodityFromYahooQuote('GOLD', quote);
      expect(row.price).toBeNull();
      expect(row.change).toBeNull();
      expect(row.changePercent).toBeNull();
      expect(row.changePercent).not.toBe(0);
      expect(row.unavailableReason).toBe('Yahoo Finance futures quote unavailable');
      expect(row.sourceLabel).toBe('Yahoo Finance futures (GC=F / SI=F)');
    }
  });

  it('keeps the price when the close is missing or zero, and does not invent a 0% change', () => {
    const zeroClose = parseYahooChartQuote(chart('GC=F', 4025.5, 0));
    expect(zeroClose?.price).toBe(4025.5);
    expect(zeroClose?.change).toBeNull();
    expect(zeroClose?.changePercent).toBeNull();
    const row = commodityFromYahooQuote('GOLD', zeroClose);
    expect(row.price).toBe(4025.5);
    expect(row.change).toBeNull();
    expect(row.changePercent).toBeNull();
    expect(row.changePercent).not.toBe(0);
    expect(row.unavailableReason).toBeNull();

    const noClose = parseYahooChartQuote({
      chart: { result: [{ meta: { symbol: 'BTC-USD', regularMarketPrice: 86089.77, regularMarketTime: 1791282310 } }] },
    });
    expect(noClose).toMatchObject({ price: 86089.77, previousClose: null, change: null, changePercent: null });
  });

  it('prices a captured Yahoo chart that has chartPreviousClose and no previousClose', async () => {
    const raw = JSON.parse(readFileSync(new URL('./fixtures/yahoo-gc-f-chart-2026-10-06.json', import.meta.url), 'utf8'));
    expect(raw.chart.result[0].meta.previousClose).toBeUndefined();
    expect(raw.chart.result[0].meta.chartPreviousClose).toBe(4156.8);
    const gold = parseYahooChartQuote(capturedGoldChart);
    expect(gold).toMatchObject({
      symbol: 'GC=F',
      price: 4178.8,
      previousClose: 4156.8,
      change: 22,
    });
    expect(gold?.changePercent).toBeCloseTo((22 / 4156.8) * 100, 8);
    const row = commodityFromYahooQuote('GOLD', gold);
    expect(row.price).toBe(4178.8);
    expect(row.change).toBe(22);
    expect(row.changePercent).not.toBe(0);
    expect(row.asOfLabel).toBe(formatFuturesAsOf(gold?.quoteTime));
    expect(row.unavailableReason).toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => capturedGoldChart })));
    const live = await getQuote('GC=F');
    expect(live?.price).toBe(4178.8);
    expect(live?.previousClose).toBe(4156.8);
    vi.unstubAllGlobals();

    const btc = parseYahooChartQuote({
      chart: {
        result: [{
          meta: {
            symbol: 'BTC-USD',
            regularMarketPrice: 86089.77,
            chartPreviousClose: 85750.58,
            regularMarketTime: 1791282310,
          },
        }],
      },
    });
    expect(btc?.previousClose).toBe(85750.58);
    expect(btc?.price).toBe(86089.77);
    expect(btc?.change).toBeCloseTo(86089.77 - 85750.58, 5);
  });
});
