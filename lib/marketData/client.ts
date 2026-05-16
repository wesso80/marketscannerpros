/**
 * marketData/client.ts — the ONLY place that talks to Alpha Vantage for
 * admin/market-data needs. Wraps avFetch with parsers for each function
 * we care about. Returns normalised typed structures + fetchedAt.
 */

import { avFetch } from '@/lib/avRateGovernor';
import type {
  BarTimeframe,
  OhlcBar,
  QuoteData,
  OverviewData,
  EarningsRow,
  OptionContract,
} from './types';

const AV_BASE = 'https://www.alphavantage.co/query';

function key(): string {
  const k = process.env.ALPHA_VANTAGE_API_KEY;
  if (!k) throw new Error('ALPHA_VANTAGE_API_KEY not set');
  return k;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || v === 'None' || v === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------

type AvDailySeries = Record<string, {
  '1. open': string;
  '2. high': string;
  '3. low': string;
  '4. close'?: string;
  '5. adjusted close'?: string;
  '5. volume'?: string;
  '6. volume'?: string;
}>;

export async function avFetchDailyBars(symbol: string, full: boolean): Promise<{ bars: OhlcBar[]; fetchedAt: string } | null> {
  const url = `${AV_BASE}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=${full ? 'full' : 'compact'}&apikey=${key()}`;
  const json = await avFetch<{ 'Time Series (Daily)'?: AvDailySeries; 'Meta Data'?: Record<string, string> }>(url, `DAILY_ADJ ${symbol}`);
  if (!json) return null;
  const series = json['Time Series (Daily)'];
  if (!series) return null;
  const bars: OhlcBar[] = [];
  for (const [date, row] of Object.entries(series)) {
    const close = toNum(row['5. adjusted close']) ?? toNum(row['4. close']);
    if (close === null) continue;
    bars.push({
      date,
      ts: Date.parse(date + 'T00:00:00Z'),
      open: toNum(row['1. open']) ?? close,
      high: toNum(row['2. high']) ?? close,
      low: toNum(row['3. low']) ?? close,
      close,
      volume: toNum(row['6. volume']) ?? toNum(row['5. volume']) ?? 0,
    });
  }
  bars.sort((a, b) => a.ts - b.ts);
  return { bars, fetchedAt: new Date().toISOString() };
}

export async function avFetchIntradayBars(symbol: string, interval: Exclude<BarTimeframe, 'daily' | 'weekly' | 'monthly'>): Promise<{ bars: OhlcBar[]; fetchedAt: string } | null> {
  const url = `${AV_BASE}?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=full&adjusted=true&apikey=${key()}`;
  const json = await avFetch<Record<string, unknown>>(url, `INTRADAY ${symbol} ${interval}`);
  if (!json) return null;
  const seriesKey = `Time Series (${interval})`;
  const series = json[seriesKey] as Record<string, Record<string, string>> | undefined;
  if (!series) return null;
  const bars: OhlcBar[] = [];
  for (const [ts, row] of Object.entries(series)) {
    const close = toNum(row['4. close']);
    if (close === null) continue;
    bars.push({
      date: ts,
      ts: Date.parse(ts.replace(' ', 'T') + 'Z'),
      open: toNum(row['1. open']) ?? close,
      high: toNum(row['2. high']) ?? close,
      low: toNum(row['3. low']) ?? close,
      close,
      volume: toNum(row['5. volume']) ?? 0,
    });
  }
  bars.sort((a, b) => a.ts - b.ts);
  return { bars, fetchedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

export async function avFetchQuote(symbol: string): Promise<{ quote: QuoteData; fetchedAt: string } | null> {
  const url = `${AV_BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key()}`;
  const json = await avFetch<{ 'Global Quote'?: Record<string, string> }>(url, `QUOTE ${symbol}`);
  if (!json) return null;
  const g = json['Global Quote'];
  if (!g || Object.keys(g).length === 0) return null;
  const quote: QuoteData = {
    symbol: g['01. symbol'] ?? symbol,
    price: toNum(g['05. price']),
    open: toNum(g['02. open']),
    high: toNum(g['03. high']),
    low: toNum(g['04. low']),
    prevClose: toNum(g['08. previous close']),
    volume: toNum(g['06. volume']),
    changeAmount: toNum(g['09. change']),
    changePercent: toNum((g['10. change percent'] ?? '').replace('%', '')),
    latestTradingDay: g['07. latest trading day'] ?? null,
  };
  return { quote, fetchedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function avFetchOverview(symbol: string): Promise<{ overview: OverviewData; fetchedAt: string } | null> {
  const url = `${AV_BASE}?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${key()}`;
  const json = await avFetch<Record<string, string>>(url, `OVERVIEW ${symbol}`);
  if (!json || Object.keys(json).length === 0 || !json.Symbol) return null;
  const overview: OverviewData = {
    symbol: json.Symbol,
    name: json.Name ?? null,
    sector: json.Sector ?? null,
    industry: json.Industry ?? null,
    country: json.Country ?? null,
    exchange: json.Exchange ?? null,
    currency: json.Currency ?? null,
    description: json.Description ?? null,
    marketCap: toNum(json.MarketCapitalization),
    peRatio: toNum(json.PERatio),
    pegRatio: toNum(json.PEGRatio),
    bookValue: toNum(json.BookValue),
    dividendYield: toNum(json.DividendYield),
    eps: toNum(json.EPS),
    revenueTTM: toNum(json.RevenueTTM),
    profitMargin: toNum(json.ProfitMargin),
    beta: toNum(json.Beta),
    high52w: toNum(json['52WeekHigh']),
    low52w: toNum(json['52WeekLow']),
    sharesOutstanding: toNum(json.SharesOutstanding),
    raw: json,
  };
  return { overview, fetchedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

interface AvEarningsRow {
  reportedDate?: string;
  fiscalDateEnding?: string;
  reportedEPS?: string;
  estimatedEPS?: string;
  surprise?: string;
  surprisePercentage?: string;
}

export async function avFetchEarnings(symbol: string): Promise<{ rows: EarningsRow[]; fetchedAt: string } | null> {
  const url = `${AV_BASE}?function=EARNINGS&symbol=${encodeURIComponent(symbol)}&apikey=${key()}`;
  const json = await avFetch<{ quarterlyEarnings?: AvEarningsRow[]; annualEarnings?: AvEarningsRow[] }>(url, `EARNINGS ${symbol}`);
  if (!json) return null;
  const q = json.quarterlyEarnings ?? [];
  const rows: EarningsRow[] = q.map((r) => ({
    symbol,
    reportDate: r.reportedDate ?? r.fiscalDateEnding ?? '',
    fiscalQuarter: null,
    fiscalYear: null,
    reportTime: null,
    epsEstimate: toNum(r.estimatedEPS),
    epsActual: toNum(r.reportedEPS),
    epsSurprisePercent: toNum(r.surprisePercentage),
    revenueEstimate: null,
    revenueActual: null,
  })).filter((r) => r.reportDate);
  return { rows, fetchedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Options chain (HISTORICAL_OPTIONS, latest date implicit)
// ---------------------------------------------------------------------------

interface AvOptionRow {
  contractID?: string;
  symbol?: string;
  expiration?: string;
  strike?: string;
  type?: 'call' | 'put';
  last?: string;
  mark?: string;
  bid?: string;
  ask?: string;
  volume?: string;
  open_interest?: string;
  implied_volatility?: string;
  delta?: string;
  gamma?: string;
  theta?: string;
  vega?: string;
  date?: string;
}

export async function avFetchOptionsChain(symbol: string): Promise<{ contracts: OptionContract[]; fetchedAt: string; chainDate: string | null } | null> {
  const url = `${AV_BASE}?function=HISTORICAL_OPTIONS&symbol=${encodeURIComponent(symbol)}&apikey=${key()}`;
  const json = await avFetch<{ data?: AvOptionRow[] }>(url, `OPTIONS ${symbol}`);
  if (!json || !Array.isArray(json.data)) return null;
  // AV returns the most recent trading day's full chain when no date param is given.
  let chainDate: string | null = null;
  const contracts: OptionContract[] = json.data
    .map((r) => {
      const t = r.type === 'call' ? 'C' : r.type === 'put' ? 'P' : null;
      const strike = toNum(r.strike);
      if (!t || strike === null || !r.expiration) return null;
      if (!chainDate && r.date) chainDate = r.date;
      const c: OptionContract = {
        symbol,
        expiry: r.expiration,
        strike,
        type: t,
        bid: toNum(r.bid),
        ask: toNum(r.ask),
        last: toNum(r.last) ?? toNum(r.mark),
        volume: toNum(r.volume),
        openInterest: toNum(r.open_interest),
        iv: toNum(r.implied_volatility),
        delta: toNum(r.delta),
        gamma: toNum(r.gamma),
        theta: toNum(r.theta),
        vega: toNum(r.vega),
      };
      return c;
    })
    .filter((x): x is OptionContract => x !== null);
  return { contracts, fetchedAt: new Date().toISOString(), chainDate };
}

// ---------------------------------------------------------------------------
// News sentiment
// ---------------------------------------------------------------------------

interface AvNewsItem {
  url: string;
  title: string;
  summary?: string;
  time_published: string;
  source?: string;
  overall_sentiment_score?: number;
  overall_sentiment_label?: string;
  topics?: { topic: string; relevance_score: string }[];
  ticker_sentiment?: { ticker: string; ticker_sentiment_score?: string; relevance_score?: string }[];
}

export async function avFetchNews(symbol: string, limit = 25): Promise<{ items: AvNewsItem[]; fetchedAt: string } | null> {
  const url = `${AV_BASE}?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(symbol)}&limit=${limit}&apikey=${key()}`;
  const json = await avFetch<{ feed?: AvNewsItem[] }>(url, `NEWS ${symbol}`);
  if (!json) return null;
  return { items: json.feed ?? [], fetchedAt: new Date().toISOString() };
}
