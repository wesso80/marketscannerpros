import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  limiterCheck: vi.fn(() => ({ allowed: true, remaining: 4, resetTime: Date.now() + 60_000 })),
  ip: '203.0.113.20',
  writes: [] as { key: string; ttl: number }[],
  store: new Map<string, unknown>(),
}));

vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'ws1' }) }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));
vi.mock('@/lib/rateLimit', () => ({
  deepAnalysisLimiter: { check: (...args: unknown[]) => state.limiterCheck(...args) },
  getClientIP: () => state.ip,
}));
vi.mock('@/lib/redis', () => ({
  getCached: async (key: string) => state.store.get(key) ?? null,
  setCached: async (key: string, value: object, ttl: number) => {
    state.writes.push({ key, ttl });
    state.store.set(key, { ...value, _ts: 1 });
    return true;
  },
}));

import { GET } from '@/app/api/news-sentiment/route';

const article = {
  title: 'Apple updates a product line',
  url: 'https://example.test/aapl',
  time_published: '20260922T040000',
  overall_sentiment_label: 'Neutral',
  overall_sentiment_score: '0',
  ticker_sentiment: [{ ticker: 'AAPL', relevance_score: '0.9', ticker_sentiment_score: '0.1', ticker_sentiment_label: 'Neutral' }],
};

describe('shared news cache skips the limiter on a hit', () => {
  beforeEach(() => {
    state.store.clear();
    state.writes.length = 0;
    state.limiterCheck.mockReset();
    state.limiterCheck.mockReturnValue({ allowed: true, remaining: 4, resetTime: Date.now() + 60_000 });
    state.ip = '203.0.113.20';
    delete process.env.OPENAI_API_KEY;
  });

  it('does not count a second shared request or call the vendor again', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ feed: [article] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const url = 'https://example.test/api/news-sentiment?tickers=AAPL&limit=5';
    const first = await GET(new NextRequest(url));
    state.ip = '203.0.113.21';
    const second = await GET(new NextRequest(url));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.limiterCheck).toHaveBeenCalledTimes(1);
    expect(state.writes.some((write) => write.ttl === 15 * 60 && write.key.includes(':ignored:'))).toBe(true);
    console.log('NEWS_AFTER ' + JSON.stringify({
      limiterChecks: state.limiterCheck.mock.calls.length,
      vendorCalls: fetcher.mock.calls.length,
    }));
  });

  it('still counts an AI brief, and does not serve it from the shared cache', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ feed: [article] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const shared = 'https://example.test/api/news-sentiment?tickers=AAPL&limit=5';
    await GET(new NextRequest(shared));
    const ai = await GET(new NextRequest(shared + '&includeAI=true'));
    await GET(new NextRequest(shared));
    expect(ai.status).toBe(200);
    expect((await ai.json()).aiAnalysis).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(state.limiterCheck).toHaveBeenCalledTimes(2);
  });

  it('does not cache a provider failure, so the next miss still counts', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ Information: 'provider unavailable' }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const url = 'https://example.test/api/news-sentiment?tickers=AAPL&limit=5';
    expect((await GET(new NextRequest(url))).status).toBe(503);
    expect((await GET(new NextRequest(url))).status).toBe(503);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(state.limiterCheck).toHaveBeenCalledTimes(2);
  });

  it('caches a partial ticker set for about two minutes and keys ignored tickers', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (String(url).includes('MSFT')) return new Response(JSON.stringify({ Information: 'provider unavailable' }), { status: 200 });
      return new Response(JSON.stringify({ feed: [article] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetcher);
    const url = 'https://example.test/api/news-sentiment?tickers=AAPL,MSFT,GOOGL,NVDA,AMZN,TSLA&limit=5';
    const first = await GET(new NextRequest(url));
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.filter.ignoredTickers).toEqual(['TSLA']);
    expect(body.tickerSummaries.some((row: { ticker: string; status?: string }) => row.ticker === 'MSFT' && row.status === 'unavailable')).toBe(true);
    expect(state.writes.some((write) => write.ttl === 2 * 60 && write.key.includes(':ignored:TSLA'))).toBe(true);
    state.ip = '203.0.113.22';
    const second = await GET(new NextRequest(url));
    expect(second.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(state.limiterCheck).toHaveBeenCalledTimes(1);
  });
});
