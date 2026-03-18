/**
 * Alpha Vantage News Provider
 *
 * Concrete implementation of NewsProvider that fetches from
 * Alpha Vantage's NEWS_SENTIMENT endpoint.
 *
 * Converts AV's response format into the catalyst pipeline's NewsItem shape
 * so classifyNews() / ingestNews() can categorise and store them.
 */

import { avTakeToken } from '@/lib/avRateGovernor';
import type { NewsProvider } from './newsProvider';
import type { NewsItem } from './types';

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';
const BASE = 'https://www.alphavantage.co/query';

export class AlphaVantageNewsProvider implements NewsProvider {
  readonly name = 'ALPHA_VANTAGE';

  async fetchRecent(tickers: string[], _lookbackHours: number): Promise<NewsItem[]> {
    if (!AV_KEY) {
      console.warn('[AV-News] ALPHA_VANTAGE_API_KEY not set — skipping');
      return [];
    }

    const items: NewsItem[] = [];

    // If tickers provided, fetch per-ticker news
    if (tickers.length > 0) {
      // AV accepts comma-separated tickers (max ~5 per call for relevance)
      const batches = chunkArray(tickers, 5);
      for (const batch of batches) {
        const articles = await this.fetchBatch(batch.join(','));
        items.push(...articles);
      }
    } else {
      // No tickers → fetch broad market news (financial markets topic)
      const articles = await this.fetchBatch(undefined, 'financial_markets');
      items.push(...articles);
    }

    return items;
  }

  private async fetchBatch(tickerParam?: string, topic?: string): Promise<NewsItem[]> {
    await avTakeToken();

    const params = new URLSearchParams({
      function: 'NEWS_SENTIMENT',
      limit: '50',
      apikey: AV_KEY,
    });
    if (tickerParam) params.set('tickers', tickerParam);
    if (topic) params.set('topics', topic);

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`[AV-News] HTTP ${res.status} for tickers=${tickerParam || 'broad'}`);
      return [];
    }

    const data = await res.json();
    if (!data.feed || !Array.isArray(data.feed)) {
      // Rate-limited or bad response
      if (data.Note || data.Information) {
        console.warn(`[AV-News] Rate limited: ${data.Note || data.Information}`);
      }
      return [];
    }

    return data.feed.map((article: AVArticle) => mapToNewsItem(article)).filter(Boolean) as NewsItem[];
  }
}

// ─── AV response shape ──────────────────────────────────────────────

interface AVArticle {
  title: string;
  url: string;
  time_published: string; // "20260318T143000"
  source: string;
  summary?: string;
  ticker_sentiment?: Array<{
    ticker: string;
    relevance_score: string;
    ticker_sentiment_score: string;
    ticker_sentiment_label: string;
  }>;
}

function mapToNewsItem(article: AVArticle): NewsItem | null {
  if (!article.title || !article.url) return null;

  const ts = parseAVTimestamp(article.time_published);
  if (!ts) return null;

  // Extract tickers with relevance > 0.1
  const tickers = (article.ticker_sentiment || [])
    .filter((t) => parseFloat(t.relevance_score) > 0.1)
    .map((t) => t.ticker.replace('CRYPTO:', '').replace('FOREX:', ''))
    .filter((t) => t.length <= 10); // filter noise

  if (tickers.length === 0) return null;

  return {
    headline: article.title,
    timestamp: ts,
    tickers,
    url: article.url,
    source: article.source || 'AlphaVantage',
    body: article.summary?.slice(0, 2000),
  };
}

/** Parse AV timestamp "20260318T143000" → Date */
function parseAVTimestamp(ts: string): Date | null {
  if (!ts || ts.length < 15) return null;
  // "20260318T143000" → "2026-03-18T14:30:00Z"
  const iso = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
