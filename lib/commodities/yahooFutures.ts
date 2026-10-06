import type { YahooQuote } from '@/lib/yahoo-finance';

/** User-visible source line for gold and silver. Do not reword. */
export const YAHOO_FUTURES_SOURCE_LABEL = 'Yahoo Finance futures (GC=F / SI=F)';

export const YAHOO_FUTURES_SYMBOLS = {
  GOLD: 'GC=F',
  SILVER: 'SI=F',
} as const;

export type PreciousMetal = keyof typeof YAHOO_FUTURES_SYMBOLS;

export const YAHOO_FUTURES_UNAVAILABLE = 'Yahoo Finance futures quote unavailable';

export interface YahooFuturesCommodity {
  symbol: PreciousMetal;
  yahooSymbol: (typeof YAHOO_FUTURES_SYMBOLS)[PreciousMetal];
  price: number | null;
  change: number | null;
  changePercent: number | null;
  /** Session date YYYY-MM-DD taken from the quote time. Empty when the quote cannot be used. */
  date: string;
  quoteTime: string | null;
  asOfLabel: string | null;
  sourceLabel: typeof YAHOO_FUTURES_SOURCE_LABEL;
  unavailableReason: string | null;
}

export function sessionDateFromQuoteTime(quoteTime: string | null | undefined): string {
  if (!quoteTime) return '';
  const ms = Date.parse(quoteTime);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

/** Plain as-of time in Sydney, from Yahoo's own quote timestamp. */
export function formatFuturesAsOf(quoteTime: string | null | undefined): string | null {
  if (!quoteTime) return null;
  const ms = Date.parse(quoteTime);
  if (!Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).formatToParts(new Date(ms));
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const day = pick('day');
  const month = pick('month');
  const year = pick('year');
  const hour = pick('hour');
  const minute = pick('minute');
  const zone = pick('timeZoneName');
  if (!day || !month || !year || !hour || !minute) return null;
  return `as of ${day} ${month} ${year}, ${hour}:${minute}${zone ? ` ${zone}` : ''}`;
}

function finitePrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Gold/silver row from a Yahoo futures quote.
 * Change comes from the previous close. A price without that close is kept, with change left null.
 * A missing quote or timestamp is null, never 0.
 */
export function commodityFromYahooQuote(symbol: PreciousMetal, quote: YahooQuote | null): YahooFuturesCommodity {
  const yahooSymbol = YAHOO_FUTURES_SYMBOLS[symbol];
  const blank: YahooFuturesCommodity = {
    symbol,
    yahooSymbol,
    price: null,
    change: null,
    changePercent: null,
    date: '',
    quoteTime: null,
    asOfLabel: null,
    sourceLabel: YAHOO_FUTURES_SOURCE_LABEL,
    unavailableReason: YAHOO_FUTURES_UNAVAILABLE,
  };
  const price = finitePrice(quote?.price);
  const previousClose = finitePrice(quote?.previousClose);
  const quoteTime = typeof quote?.quoteTime === 'string' ? quote.quoteTime : null;
  const date = sessionDateFromQuoteTime(quoteTime);
  if (price == null || price <= 0 || !date) return blank;
  const base = {
    symbol,
    yahooSymbol,
    price,
    date,
    quoteTime,
    asOfLabel: formatFuturesAsOf(quoteTime),
    sourceLabel: YAHOO_FUTURES_SOURCE_LABEL as typeof YAHOO_FUTURES_SOURCE_LABEL,
  };
  if (previousClose == null || previousClose <= 0) {
    return { ...base, change: null, changePercent: null, unavailableReason: null };
  }
  const change = price - previousClose;
  const changePercent = (change / previousClose) * 100;
  if (!Number.isFinite(change) || !Number.isFinite(changePercent)) {
    return { ...base, change: null, changePercent: null, unavailableReason: null };
  }
  return { ...base, change, changePercent, unavailableReason: null };
}
