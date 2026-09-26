import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { companyNameCore, formatNewsPublished, mentionsCompany, selectTickerNews } from '@/lib/equityNewsRelevance';

// Real AV NEWS_SENTIMENT tickers=AAPL feed, fetched 26 Sep 2026 18:5x AEST (the one behind OV-17).
const feed = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/avNewsSentimentAapl.json'), 'utf8')).feed;
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('OV-17 Equity Deep-Dive news: ticker-specific, real dates, ticker sentiment', () => {
  it('a 0.3 relevance floor alone would keep everything (why the mention check exists)', () => {
    const above = feed.filter((a: any) => a.ticker_sentiment.some((t: any) => t.ticker === 'AAPL' && Number(t.relevance_score) >= 0.3));
    expect(above).toHaveLength(feed.length);
  });

  it('drops the other-issuer filings and forecasts from the OV-17 screenshot and keeps Apple items', () => {
    const items = selectTickerNews(feed, 'AAPL', 'Apple Inc', { limit: 50 });
    const titles = items.map((i) => i.title);
    for (const bad of ['Form 4 Medpace Holdings', 'Form 13D/A Inflection Point', 'Form 4 Alphabet Inc Class C', 'Core & Main, Inc. (CNM) Stock forecasts', 'Form 4 Charles Schwab']) {
      expect(titles.some((t) => t.startsWith(bad)), bad).toBe(false);
    }
    expect(titles.some((t) => t.startsWith('Apple Hit With $5.7 Billion Patent Verdict'))).toBe(true);
    expect(titles.some((t) => t.startsWith('Form 4 Apple Inc'))).toBe(true);
    expect(items.every((i) => /apple|aapl|iphone/i.test(`${i.title} ${i.summary}`) || i.relevance >= 0.9)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(10);
  });

  it('timestamps are AV compact UTC converted to ISO, newest first', () => {
    const items = selectTickerNews(feed, 'AAPL', 'Apple Inc');
    expect(items).toHaveLength(10);
    // Bloomberg Law publishes this at 2026-09-25T23:30:30Z; AV reports 20260925T233000 (UTC, not ET).
    const bb = selectTickerNews(feed, 'AAPL', 'Apple Inc', { limit: 50 }).find((i) => i.source === 'Bloomberg Law News');
    expect(bb?.publishedAt).toBe('2026-09-25T23:30:00.000Z');
    const times = items.map((i) => i.publishedAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(items.every((i) => !Number.isNaN(Date.parse(i.publishedAt)))).toBe(true);
  });

  it('sentiment is the AAPL ticker_sentiment, not the article-wide score', () => {
    const items = selectTickerNews(feed, 'AAPL', 'Apple Inc', { limit: 50 });
    const verdict = items.find((i) => i.title.startsWith('Apple (AAPL) Eyes an Apple Pay Launch'))!;
    expect(verdict.sentimentScore).toBeCloseTo(0.14245, 5); // overall_sentiment_score is -0.076114
    expect(verdict.sentiment).toBe('Neutral');
  });

  it('formats both ISO and AV compact times, never "Invalid Date"', () => {
    expect(formatNewsPublished('20260925T233000', 'en-AU')).toMatch(/Sept? 2026/);
    expect(formatNewsPublished('2026-09-25T23:30:00.000Z', 'en-AU')).toMatch(/2026/);
    expect(formatNewsPublished('')).toBeNull();
    expect(formatNewsPublished('garbage')).toBeNull();
  });

  it('company-name and ticker matching', () => {
    expect(companyNameCore('Apple Inc')).toBe('Apple');
    expect(companyNameCore('Alphabet Inc Class C')).toBe('Alphabet');
    expect(companyNameCore('The Coca-Cola Company')).toBe('Coca-Cola');
    expect(companyNameCore('NVIDIA Corporation')).toBe('NVIDIA');
    expect(mentionsCompany('Nvidia beats estimates', 'NVDA', 'NVIDIA Corporation')).toBe(true);
    expect(mentionsCompany('Shares of $F rose', 'F', 'Ford Motor Company')).toBe(true);
    expect(mentionsCompany('A new filing for Medpace', 'A', 'Agilent Technologies Inc')).toBe(false);
    expect(mentionsCompany('Form 4 Medpace Holdings Inc', 'AAPL', 'Apple Inc')).toBe(false);
    expect(mentionsCompany('Pineapple prices', 'AAPL', 'Apple Inc')).toBe(false);
  });

  it('route and page are wired to the helper', () => {
    const route = read('app/api/equity/detail/route.ts');
    expect(route).toContain('selectTickerNews(news.feed, symbol, overview.Name');
    expect(route).not.toMatch(/publishedAt: item\.time_published/);
    const page = read('app/tools/equity-explorer/page.tsx');
    expect(page).not.toContain('new Date(article.publishedAt)');
    expect(page).toContain('formatNewsPublished(article.publishedAt)');
  });
});
