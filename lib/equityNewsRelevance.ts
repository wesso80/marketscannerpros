import { newsPublishedAt } from '@/lib/newsEvidence';

/**
 * Ticker-specific news for the Equity Deep-Dive (OV-17).
 *
 * Alpha Vantage NEWS_SENTIMENT with `tickers=AAPL` returns plenty of articles that are not about Apple: Investing.com
 * Form 4 / 13D filings for other issuers, other companies' "stock forecasts", and so on. They still carry an AAPL
 * `ticker_sentiment` entry with relevance around 0.53-0.65 (measured 26 Sep 2026: 23 of 50 AAPL feed items were
 * unrelated, and all 50 were at or above 0.3). So a relevance floor alone does not remove them. An article is kept
 * only when:
 *   1. its `ticker_sentiment` entry for this ticker has relevance_score >= minRelevance (default 0.3), and
 *   2. the title/summary actually names the company or ticker, or AV scores relevance >= 0.9 (article is about it).
 * Sentiment uses that ticker's `ticker_sentiment_score`/label, never the article-wide score.
 */

export const EQUITY_NEWS_MIN_RELEVANCE = 0.3;
/** At or above this AV relevance the article is about the ticker even if the text uses a nickname. */
export const EQUITY_NEWS_STRONG_RELEVANCE = 0.9;

export interface AvNewsFeedItem {
  title?: string;
  url?: string;
  time_published?: string;
  summary?: string;
  source?: string;
  overall_sentiment_label?: string;
  overall_sentiment_score?: number | string;
  ticker_sentiment?: Array<{ ticker?: string; relevance_score?: string | number; ticker_sentiment_score?: string | number; ticker_sentiment_label?: string }>;
}

export interface TickerNewsItem {
  title: string;
  url: string;
  /** ISO-8601 UTC, or '' when AV sent an unparseable time. */
  publishedAt: string;
  source: string;
  /** Sentiment label for THIS ticker. */
  sentiment: string;
  /** Sentiment score for THIS ticker (-1..1). */
  sentimentScore: number;
  relevance: number;
  summary?: string;
}

const CORPORATE_SUFFIX = /(?:[\s,]+(?:inc\.?|incorporated|corp\.?|corporation|co\.?|company|ltd\.?|limited|plc|llc|l\.p\.|lp|n\.v\.|s\.a\.|ag|se|holdings?|group|class [a-z]|common stock|ordinary shares|adr|ads))+\s*$/i;

/** "Apple Inc" -> "Apple", "Alphabet Inc Class C" -> "Alphabet", "NVIDIA Corporation" -> "NVIDIA". */
export function companyNameCore(name: string | null | undefined): string {
  let s = String(name ?? '').trim().replace(/^the\s+/i, '');
  let prev = '';
  while (s && s !== prev) {
    prev = s;
    s = s.replace(CORPORATE_SUFFIX, '').replace(/[\s,.]+$/, '').trim();
  }
  return s;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when the text names the company (case-insensitive core name) or the ticker ($AAPL, (AAPL), NASDAQ:AAPL, bare AAPL). */
export function mentionsCompany(text: string, symbol: string, companyName?: string | null): boolean {
  const sym = symbol.trim().toUpperCase();
  if (sym) {
    const t = escapeRe(sym);
    if (new RegExp(`\\$${t}(?![A-Za-z0-9])|\\(${t}\\)|\\b(?:nasdaq|nyse|nysearca|nyse arca|amex|otc)\\s*:\\s*${t}(?![A-Za-z0-9])`, 'i').test(text)) return true;
    // Bare ticker only when it can't be an ordinary word ("A", "IT", "ON"): 3+ chars and upper-case in the text.
    if (sym.length >= 3 && new RegExp(`(?<![A-Za-z0-9$])${t}(?![A-Za-z0-9])`).test(text)) return true;
  }
  const core = companyNameCore(companyName);
  if (core.length >= 3 && new RegExp(`(?<![A-Za-z0-9])${escapeRe(core)}(?![A-Za-z0-9])`, 'i').test(text)) return true;
  return false;
}

function toIso(timePublished: string | undefined): string {
  const ms = newsPublishedAt(String(timePublished ?? ''));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

/** Symbol to look for in article text: "CRYPTO:BTC" -> "BTC", "FOREX:EUR" -> "EUR", "AAPL" -> "AAPL". */
export function newsMatchSymbol(providerTicker: string): string {
  return providerTicker.trim().toUpperCase().replace(/^(CRYPTO|FOREX):/, '');
}

export interface TickerRelevance {
  relevance: number;
  /** Sentiment for THIS ticker (-1..1), never the article-wide score. */
  sentimentScore: number;
  sentimentLabel: string;
}

/**
 * The shared rule for one article and one AV ticker key (AAPL, CRYPTO:BTC): null unless the article's
 * ticker_sentiment entry for that key has relevance >= minRelevance AND the text names the company/coin or ticker,
 * or relevance >= EQUITY_NEWS_STRONG_RELEVANCE.
 */
export function tickerRelevance(
  item: AvNewsFeedItem,
  providerTicker: string,
  companyName?: string | null,
  minRelevance: number = EQUITY_NEWS_MIN_RELEVANCE,
): TickerRelevance | null {
  const key = providerTicker.trim().toUpperCase();
  const ts = (item.ticker_sentiment ?? []).find((t) => String(t.ticker ?? '').toUpperCase() === key);
  if (!ts) return null;
  const relevance = Number(ts.relevance_score);
  if (!Number.isFinite(relevance) || relevance < minRelevance) return null;
  const text = `${item.title ?? ''} ${item.summary ?? ''}`;
  if (relevance < EQUITY_NEWS_STRONG_RELEVANCE && !mentionsCompany(text, newsMatchSymbol(key), companyName)) return null;
  const score = Number(ts.ticker_sentiment_score);
  return { relevance, sentimentScore: Number.isFinite(score) ? score : 0, sentimentLabel: ts.ticker_sentiment_label || 'Neutral' };
}

export function selectTickerNews(
  feed: AvNewsFeedItem[] | null | undefined,
  symbol: string,
  companyName?: string | null,
  opts: { minRelevance?: number; limit?: number } = {},
): TickerNewsItem[] {
  if (!Array.isArray(feed)) return [];
  const out: TickerNewsItem[] = [];
  for (const item of feed) {
    const rel = tickerRelevance(item, symbol, companyName, opts.minRelevance);
    if (!rel) continue;
    out.push({
      title: item.title ?? '',
      url: item.url ?? '',
      publishedAt: toIso(item.time_published),
      source: item.source ?? '',
      sentiment: rel.sentimentLabel,
      sentimentScore: rel.sentimentScore,
      relevance: rel.relevance,
      summary: item.summary?.slice(0, 200),
    });
  }
  // Newest first; items without a parseable time go last.
  out.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  return out.slice(0, opts.limit ?? 10);
}

/** AV's own label bands for a ticker sentiment score (sentiment_score_definition in the NEWS_SENTIMENT response). */
export function avSentimentLabel(score: number): string {
  if (score <= -0.35) return 'Bearish';
  if (score <= -0.15) return 'Somewhat-Bearish';
  if (score < 0.15) return 'Neutral';
  if (score < 0.35) return 'Somewhat-Bullish';
  return 'Bullish';
}

export type TickerSentimentSummary =
  | { ticker: string; status: 'ok'; articles: number; avgScore: number; label: string }
  | { ticker: string; status: 'unavailable'; reason: string };

/** Per-ticker sentiment from the RELEVANT items only; "unavailable" (with a reason) when none qualify. */
export function summarizeTickerSentiment(ticker: string, relevant: Array<{ sentimentScore: number }>): TickerSentimentSummary {
  if (relevant.length === 0) return { ticker, status: 'unavailable', reason: 'no ticker-specific articles in the feed' };
  const avg = relevant.reduce((sum, r) => sum + r.sentimentScore, 0) / relevant.length;
  const avgScore = Math.round(avg * 1000) / 1000;
  return { ticker, status: 'ok', articles: relevant.length, avgScore, label: avSentimentLabel(avgScore) };
}

/** Deep-Dive date/time for a news item: accepts ISO or AV compact (YYYYMMDDTHHMMSS, UTC). Null when unparseable. */
export function formatNewsPublished(value: string | null | undefined, locale?: string): string | null {
  const ms = newsPublishedAt(String(value ?? ''));
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
