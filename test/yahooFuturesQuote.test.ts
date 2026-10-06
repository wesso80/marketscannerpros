import { describe, expect, it } from 'vitest';
import { parseYahooChartQuote } from '@/lib/yahoo-finance';
import {
  YAHOO_FUTURES_SOURCE_LABEL,
  commodityFromYahooQuote,
  formatFuturesAsOf,
} from '@/lib/commodities/yahooFutures';

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
    expect(silverRow).toMatchObject({ yahooSymbol: 'SI=F', sourceLabel: YAHOO_FUTURES_SOURCE_LABEL, price: 48.6 });
    expect(silverRow.changePercent).not.toBe(0);
  });

  it('returns null prices when the fetch fails or the previous close cannot be used', () => {
    for (const quote of [null, parseYahooChartQuote({ chart: { result: [] } }), parseYahooChartQuote(chart('GC=F', 4025.5, 0)), parseYahooChartQuote(chart('GC=F', 4025.5, 4000, null))]) {
      const row = commodityFromYahooQuote('GOLD', quote);
      expect(row.price).toBeNull();
      expect(row.change).toBeNull();
      expect(row.changePercent).toBeNull();
      expect(row.changePercent).not.toBe(0);
      expect(row.unavailableReason).toBe('Yahoo Finance futures quote unavailable');
      expect(row.sourceLabel).toBe('Yahoo Finance futures (GC=F / SI=F)');
    }
    expect(parseYahooChartQuote(chart('GC=F', 4025.5, 0))?.changePercent).not.toBe(0);
  });
});
