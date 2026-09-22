import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({workspaceId:'audit-test'})) }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: vi.fn(async () => {}) }));
vi.mock('@/lib/rateLimit', () => ({ getClientIP: () => 'audit-test', deepAnalysisLimiter: {check: () => ({allowed:true})} }));
import { GET } from '../app/api/news-sentiment/route';
afterEach(() => vi.unstubAllGlobals());
describe('candidate news provider identity', () => {
  it.each([['ETH','CRYPTO:ETH'],['ETHUSD','CRYPTO:ETH'],['CRYPTO:ETH','CRYPTO:ETH'],['META','META']])('requests %s as %s without broad-topic replacement', async (symbol, expected) => {
    const fetcher=vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({feed:[{title:'Candidate source',url:'https://example.test/story',time_published:'20260922T040000',overall_sentiment_label:'Neutral',overall_sentiment_score:'0',ticker_sentiment:[{ticker:expected,relevance_score:'.8',ticker_sentiment_score:'0',ticker_sentiment_label:'Neutral'}]}]}),{status:200}));
    vi.stubGlobal('fetch',fetcher);
    const result=await GET(new NextRequest('https://example.test/api/news-sentiment?tickers='+encodeURIComponent(symbol)));
    expect(result.status).toBe(200);
    const called=new URL(String(fetcher.mock.calls[0][0]));
    expect(called.searchParams.get('tickers')).toBe(expected);
    expect(called.searchParams.has('topics')).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await result.json()).articles[0].tickerSentiments[0]).toMatchObject({ticker:expected,relevance:.8});
  });
  it('does not present a failed provider as an empty successful news result', async () => {
    vi.stubGlobal('fetch',vi.fn(async () => new Response(JSON.stringify({Information:'provider unavailable'}),{status:200})));
    const result=await GET(new NextRequest('https://example.test/api/news-sentiment?tickers=ETH'));
    expect(result.status).toBe(503);
    expect((await result.json()).error).toContain('could not be verified');
  });
});
