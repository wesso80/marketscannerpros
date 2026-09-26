import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'mv2-test' })) }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: vi.fn(async () => {}) }));
vi.mock('@/lib/rateLimit', () => ({ getClientIP: () => 'mv2-test', deepAnalysisLimiter: { check: () => ({ allowed: true }) } }));

import { avSentimentLabel, selectTickerNews, summarizeTickerSentiment, tickerRelevance } from '@/lib/equityNewsRelevance';
import { avNewsFeedError, buildTickerNews } from '@/lib/news/tickerNewsFeed';
import { cryptoNewsName, cryptoSymbolForId, dedupeNewsByTitle, isCoinRelevantNews } from '@/lib/crypto/newsRelevance';
import { GET } from '../app/api/news-sentiment/route';

const load = (f: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', f), 'utf8'));
const btcFeed = load('avNewsSentimentCryptoBtc.json').feed;
const aaplFeed = load('avNewsSentimentAapl.json').feed;
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

afterEach(() => vi.unstubAllGlobals());

describe('MV-2 shared ticker-relevance rule extended to crypto (real AV CRYPTO:BTC feed)', () => {
  it('keeps BTC items that name Bitcoin/BTC at >= 0.3, drops low-relevance and unnamed ones', () => {
    const kept = btcFeed.filter((a: any) => tickerRelevance(a, 'CRYPTO:BTC', 'bitcoin'));
    expect(btcFeed).toHaveLength(22);
    expect(kept).toHaveLength(15);
    const titles = kept.map((a: any) => a.title);
    expect(titles).toContain('IBIT vs. FBTC: Which Bitcoin ETF Is Better?');
    // 0.42 relevance for BTC, but the article is about an insurance acquisition and never names Bitcoin/BTC.
    expect(titles).not.toContain('WTW Acquires Crypto Insurance Platform Redefind');
    // 0.04 relevance (Coinbase earnings call).
    expect(titles.some((t: string) => t.startsWith('Coinbase  ( COIN )  Q2 2026 Earnings Call'))).toBe(false);
    // selectTickerNews (Deep-Dive) now accepts the AV crypto key too, same result.
    expect(selectTickerNews(btcFeed, 'CRYPTO:BTC', 'bitcoin', { limit: 50 })).toHaveLength(15);
  });

  it('crypto names and symbols come from the CoinGecko id map', () => {
    expect(cryptoNewsName('BTC')).toBe('bitcoin');
    expect(cryptoNewsName('CRYPTO:ETH')).toBe('ethereum');
    expect(cryptoNewsName('SHIB-USD')).toBe('shiba inu');
    expect(cryptoNewsName('solana')).toBe('solana');
    expect(cryptoNewsName('NOTACOIN')).toBeNull();
    expect(cryptoSymbolForId('bitcoin')).toBe('BTC');
    expect(cryptoSymbolForId('ethereum')).toBe('ETH');
  });

  it('per-ticker sentiment uses AV label bands and only relevant items', () => {
    expect(avSentimentLabel(-0.35)).toBe('Bearish');
    expect(avSentimentLabel(-0.2)).toBe('Somewhat-Bearish');
    expect(avSentimentLabel(0.1)).toBe('Neutral');
    expect(avSentimentLabel(0.15)).toBe('Somewhat-Bullish');
    expect(avSentimentLabel(0.35)).toBe('Bullish');
    expect(summarizeTickerSentiment('BTC', [])).toEqual({ ticker: 'BTC', status: 'unavailable', reason: 'no ticker-specific articles in the feed' });
  });
});

describe('buildTickerNews (News Intelligence / Crypto Intel)', () => {
  const requested = [
    { ticker: 'AAPL', providerKey: 'AAPL', name: null },
    { ticker: 'BTC', providerKey: 'CRYPTO:BTC', name: 'bitcoin' },
    { ticker: 'ETH', providerKey: 'CRYPTO:ETH', name: 'ethereum' },
  ];

  it('merges per-ticker feeds, tags relevant tickers, and averages sentiment over relevant items only', () => {
    const { articles, tickerSummaries, considered } = buildTickerNews(requested, {
      AAPL: { feed: aaplFeed },
      'CRYPTO:BTC': { feed: btcFeed },
      'CRYPTO:ETH': { error: 'Alpha Vantage rate limit reached' },
    }, 100);
    expect(considered).toBe(aaplFeed.length + btcFeed.length);
    const btc = tickerSummaries.find((s) => s.ticker === 'BTC')!;
    const keptScores = btcFeed.map((a: any) => tickerRelevance(a, 'CRYPTO:BTC', 'bitcoin')).filter(Boolean).map((r: any) => r.sentimentScore);
    const allScores = btcFeed.map((a: any) => Number(a.ticker_sentiment.find((t: any) => t.ticker === 'CRYPTO:BTC').ticker_sentiment_score));
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(btc).toMatchObject({ status: 'ok', articles: 15 });
    expect(btc.status === 'ok' && btc.avgScore).toBeCloseTo(mean(keptScores), 3);
    expect(Math.abs(mean(keptScores) - mean(allScores))).toBeGreaterThan(0.005);
    expect(tickerSummaries.find((s) => s.ticker === 'ETH')).toEqual({ ticker: 'ETH', status: 'unavailable', reason: 'Alpha Vantage rate limit reached' });
    // AAPL without a company name: ticker mentions or relevance >= 0.9 (27 of the 30 the Deep-Dive keeps with "Apple").
    expect(tickerSummaries.find((s) => s.ticker === 'AAPL')).toMatchObject({ status: 'ok', articles: 27 });
    expect(articles).toHaveLength(27 + 15);
    expect(articles.every((a) => a.relevantTickers.length > 0)).toBe(true);
    expect(articles.find((a) => a.title === 'IBIT vs. FBTC: Which Bitcoin ETF Is Better?')!.tickerSentiments.find((t) => t.ticker === 'CRYPTO:BTC')!.relevant).toBe(true);
    expect(articles.map((a) => a.title)).not.toContain('WTW Acquires Crypto Insurance Platform Redefind');
    // Newest first.
    expect([...articles].sort((a, b) => b.timePublished.localeCompare(a.timePublished)).map((a) => a.url)).toEqual(articles.map((a) => a.url));
  });

  it('names why a provider response is unusable', () => {
    expect(avNewsFeedError(true, 200, { feed: [] })).toBeNull();
    expect(avNewsFeedError(false, 502, null)).toBe('Alpha Vantage HTTP 502');
    expect(avNewsFeedError(true, 200, { Note: 'Thank you for using Alpha Vantage! ...' })).toBe('Alpha Vantage rate limit reached');
    expect(avNewsFeedError(true, 200, { Information: 'premium endpoint' })).toBe('Alpha Vantage: premium endpoint');
    expect(avNewsFeedError(true, 200, {})).toBe('Alpha Vantage returned no feed');
  });
});

describe('/api/news-sentiment makes one AV call per ticker (AV ANDs comma-separated tickers)', () => {
  it('requests each ticker separately and keeps a partial failure as "unavailable" for that ticker only', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const t = new URL(url).searchParams.get('tickers');
      if (t === 'CRYPTO:BTC') return new Response(JSON.stringify({ feed: btcFeed }), { status: 200 });
      return new Response(JSON.stringify({ Note: 'rate limit' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetcher);
    const res = await GET(new NextRequest('https://example.test/api/news-sentiment?tickers=BTC,MSFT&limit=10'));
    expect(fetcher.mock.calls.map((c) => new URL(String(c[0])).searchParams.get('tickers')).sort()).toEqual(['CRYPTO:BTC', 'MSFT']);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.articles).toHaveLength(10);
    expect(body.tickerSummaries).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticker: 'BTC', status: 'ok', articles: 15 }),
      { ticker: 'MSFT', status: 'unavailable', reason: 'Alpha Vantage rate limit reached' },
    ]));
    expect(body.filter.rule).toContain('names the company/coin or ticker');
  });

  it('all feeds failing is a 503 naming the reason, never an empty success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ Information: 'provider unavailable' }), { status: 200 })));
    const res = await GET(new NextRequest('https://example.test/api/news-sentiment?tickers=ETH'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain('Alpha Vantage: provider unavailable');
    expect(body.tickerSummaries[0]).toMatchObject({ ticker: 'ETH', status: 'unavailable' });
  });
});

describe('CoinGecko /news coin feeds (Analyst plan, coin_id)', () => {
  it('coin feed keeps items naming the coin or ticker; guides always pass', () => {
    expect(isCoinRelevantNews({ title: 'Bitcoin ETF inflows hit a record', type: 'news' }, 'bitcoin')).toBe(true);
    expect(isCoinRelevantNews({ title: 'BTC reclaims $110k', type: 'news' }, 'bitcoin')).toBe(true);
    // CoinGecko's own docs example: an EU cloud-tender story auto-tagged "could"/"union-2".
    expect(isCoinRelevantNews({ title: 'EU picks four firms for sovereign cloud tender', type: 'news' }, 'bitcoin')).toBe(false);
    expect(isCoinRelevantNews({ title: 'What is a hardware wallet?', type: 'guide' }, 'bitcoin')).toBe(true);
  });

  it('drops repeated headlines including full-width punctuation variants', () => {
    const items = [{ title: '比特币突破11万美元，创新高' }, { title: '比特币突破11万美元,创新高' }, { title: 'Other' }];
    expect(dedupeNewsByTitle(items).map((i) => i.title)).toEqual(['比特币突破11万美元，创新高', 'Other']);
  });

  it('route and UI wiring', () => {
    const cg = read('app/api/crypto/cg-news/route.ts');
    expect(cg).toContain('isCoinRelevantNews(item, coin_id)');
    expect(cg).toContain('dedupeNewsByTitle(relevant)');
    const widget = read('components/CryptoNewsWidget.tsx');
    expect(widget).toContain('/api/news-sentiment?tickers=${SENTIMENT_TICKERS}');
    expect(widget).toContain('<TickerSentimentSummary items={coinSentiment}');
    expect(read('app/tools/news/page.tsx')).toContain('<TickerSentimentSummary items={tickerSummaries}');
    expect(read('app/tools/research/page.tsx')).toContain('(article.relevantTickers ?? []).includes(candidateSymbol)');
    expect(read('components/news/TickerSentimentSummary.tsx')).toContain('Unavailable ({item.reason})');
    expect(read('app/api/deep-analysis/route.ts')).toContain("if (assetClass === 'crypto') return cryptoNewsName(symbol);");
  });
});
