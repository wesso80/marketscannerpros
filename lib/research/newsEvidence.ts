import { avFetch } from '@/lib/avRateGovernor';
import { readShared, writeShared } from '@/lib/cache/sharedResponse';
import { avTickerKey, filterRelevantNews, summarizeNews, type NewsEvent, type RelevantArticle } from '@/lib/goldenEgg/newsRelevance';

/**
 * Symbol-specific news for the research page (Phase 3), shared by Symbol and Deep Analysis so both show the same
 * articles, the same event grouping and the same counts. One Alpha Vantage NEWS_SENTIMENT call per ticker, cached
 * for 15 minutes (a failed call for 2 minutes, labelled unavailable, never an empty "no news").
 */
export const SYMBOL_NEWS = {
  version: 'symbol-news-v1',
  provider: 'Alpha Vantage NEWS_SENTIMENT',
  rule: 'Ticker-filtered: relevance ≥ 0.3 and the article names the company or ticker, or relevance ≥ 0.9. Articles about the same event (same catalyst, within 72 hours, matching headline wording) count once.',
  cacheSeconds: 15 * 60,
  failedCacheSeconds: 2 * 60,
} as const;

export type SymbolNewsFeed = { feed: unknown[]; status: 'available' | 'unavailable'; fetchedAt: string; reason?: string };
export type SymbolNews = {
  version: string;
  symbol: string;
  status: 'available' | 'unavailable';
  provider: string;
  rule: string;
  fetchedAt: string;
  considered: number;
  headline: string;
  counts: { positive: number; negative: number; eventRisk: number; neutral: number; articles: number; events: number };
  events: NewsEvent[];
  articles: RelevantArticle[];
  reason?: string;
};

const feedKey = (key: string) => `research-news-feed:v1:${key}`;

/** Raw ticker feed (shared cache). Never throws; a provider failure is returned as `unavailable` with its reason. */
export async function fetchSymbolNewsFeed(symbol: string, assetClass: 'equity' | 'crypto' | 'forex', nowMs = Date.now()): Promise<SymbolNewsFeed> {
  const key = avTickerKey(symbol, assetClass);
  const cached = await readShared<SymbolNewsFeed>(feedKey(key)).catch(() => null);
  if (cached) return cached;
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  let out: SymbolNewsFeed;
  if (!apiKey) out = { feed: [], status: 'unavailable', fetchedAt: new Date(nowMs).toISOString(), reason: 'News provider not configured' };
  else {
    const data = await avFetch<any>(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(key)}&limit=50&sort=LATEST&apikey=${apiKey}`, `NEWS ${key}`).catch(() => null);
    out = Array.isArray(data?.feed)
      ? { feed: data.feed, status: 'available', fetchedAt: new Date(nowMs).toISOString() }
      : { feed: [], status: 'unavailable', fetchedAt: new Date(nowMs).toISOString(), reason: typeof data?.Information === 'string' || typeof data?.Note === 'string' ? 'Provider quota or rate limit reached' : 'Provider request failed' };
  }
  await writeShared(feedKey(key), out, out.status === 'available' ? SYMBOL_NEWS.cacheSeconds : SYMBOL_NEWS.failedCacheSeconds).catch(() => false);
  return out;
}

/** Pure: ticker-filtered, event-grouped news from a fetched feed. */
export function buildSymbolNews(symbol: string, assetClass: 'equity' | 'crypto' | 'forex', feed: SymbolNewsFeed, companyName: string | null): SymbolNews {
  const articles = feed.status === 'available' ? filterRelevantNews(feed.feed as any[], symbol, assetClass, { companyName }) : [];
  const s = summarizeNews(articles);
  return {
    version: SYMBOL_NEWS.version, symbol, status: feed.status, provider: SYMBOL_NEWS.provider, rule: SYMBOL_NEWS.rule,
    fetchedAt: feed.fetchedAt, considered: feed.feed.length,
    headline: feed.status === 'available' ? s.headline : `News unavailable: ${feed.reason ?? 'provider request failed'}.`,
    counts: { positive: s.positive, negative: s.negative, eventRisk: s.eventRisk, neutral: s.neutral, articles: s.articles, events: s.events.length },
    events: s.events, articles, ...(feed.reason ? { reason: feed.reason } : {}),
  };
}
