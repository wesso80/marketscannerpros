import {
  EQUITY_NEWS_MIN_RELEVANCE,
  EQUITY_NEWS_STRONG_RELEVANCE,
  summarizeTickerSentiment,
  tickerRelevance,
  type AvNewsFeedItem,
  type TickerSentimentSummary,
} from '@/lib/equityNewsRelevance';

/**
 * Per-ticker news for News Intelligence and Crypto Intel (MV-2).
 *
 * Alpha Vantage treats `tickers=AAPL,MSFT` as AND: it returns only articles that mention every listed ticker. So each
 * requested ticker gets its own NEWS_SENTIMENT call (tickers=AAPL, tickers=CRYPTO:BTC). Every article is then run
 * through the shared ticker-relevance rule (lib/equityNewsRelevance.ts), and per-ticker sentiment is averaged over
 * the RELEVANT items for that ticker only.
 */

export const NEWS_MAX_TICKERS = 5;
export const NEWS_RELEVANCE_RULE = `ticker relevance >= ${EQUITY_NEWS_MIN_RELEVANCE} and the article names the company/coin or ticker, or relevance >= ${EQUITY_NEWS_STRONG_RELEVANCE}`;

export interface RequestedNewsTicker {
  /** Display ticker (AAPL, BTC). */
  ticker: string;
  /** Alpha Vantage key (AAPL, CRYPTO:BTC). */
  providerKey: string;
  /** Company/coin name for the "names it" check, when known (e.g. "bitcoin"). */
  name: string | null;
}

export type TickerFeedResult = { feed: AvNewsFeedItem[] } | { error: string };

/** Why an Alpha Vantage NEWS_SENTIMENT response can't be used, or null when it can. */
export function avNewsFeedError(httpOk: boolean, httpStatus: number, data: any): string | null {
  if (!httpOk) return `Alpha Vantage HTTP ${httpStatus}`;
  if (!data || typeof data !== 'object') return 'Alpha Vantage returned no data';
  if (data.Note) return 'Alpha Vantage rate limit reached';
  if (data['Error Message']) return 'Alpha Vantage rejected the request';
  if (data.Information) return 'Alpha Vantage: ' + String(data.Information).slice(0, 120);
  if (!Array.isArray(data.feed)) return 'Alpha Vantage returned no feed';
  return null;
}

export interface TickerNewsArticle {
  title: string;
  url: string;
  timePublished: string;
  summary: string;
  source: string;
  sentiment: { label: string; score: number };
  tickerSentiments: Array<{ ticker: string; relevance: number; sentimentScore: number; sentimentLabel: string; relevant: boolean }>;
  /** Requested tickers this article passed the relevance rule for. */
  relevantTickers: string[];
}

export function buildTickerNews(
  requested: RequestedNewsTicker[],
  results: Record<string, TickerFeedResult>,
  limit: number,
): { articles: TickerNewsArticle[]; tickerSummaries: TickerSentimentSummary[]; considered: number } {
  const byUrl = new Map<string, TickerNewsArticle>();
  const tickerSummaries: TickerSentimentSummary[] = [];
  let considered = 0;
  for (const req of requested) {
    const res = results[req.providerKey];
    if (!res || 'error' in res) {
      tickerSummaries.push({ ticker: req.ticker, status: 'unavailable', reason: res && 'error' in res ? res.error : 'not requested' });
      continue;
    }
    const relevantForTicker = new Map<string, { sentimentScore: number }>();
    for (const item of res.feed) {
      considered++;
      const rel = tickerRelevance(item, req.providerKey, req.name);
      if (!rel) continue;
      const key = item.url || `${item.title ?? ''}|${item.time_published ?? ''}`;
      relevantForTicker.set(key, rel);
      let article = byUrl.get(key);
      if (!article) {
        article = {
          title: item.title ?? '',
          url: item.url ?? '',
          timePublished: item.time_published ?? '',
          summary: item.summary ?? '',
          source: item.source ?? '',
          sentiment: { label: item.overall_sentiment_label ?? 'Neutral', score: Number.parseFloat(String(item.overall_sentiment_score ?? '0')) || 0 },
          tickerSentiments: (item.ticker_sentiment ?? []).map((ts) => ({
            ticker: String(ts.ticker ?? ''),
            relevance: Number.parseFloat(String(ts.relevance_score ?? '0')) || 0,
            sentimentScore: Number.parseFloat(String(ts.ticker_sentiment_score ?? '0')) || 0,
            sentimentLabel: ts.ticker_sentiment_label ?? 'Neutral',
            relevant: false,
          })),
          relevantTickers: [],
        };
        byUrl.set(key, article);
      }
      if (!article.relevantTickers.includes(req.ticker)) article.relevantTickers.push(req.ticker);
      for (const ts of article.tickerSentiments) if (ts.ticker.toUpperCase() === req.providerKey) ts.relevant = true;
    }
    tickerSummaries.push(summarizeTickerSentiment(req.ticker, [...relevantForTicker.values()]));
  }
  const articles = [...byUrl.values()]
    .sort((a, b) => (b.timePublished || '').localeCompare(a.timePublished || ''))
    .slice(0, limit);
  return { articles, tickerSummaries, considered };
}
