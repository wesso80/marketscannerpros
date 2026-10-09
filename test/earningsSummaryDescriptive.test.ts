/**
 * /api/earnings-calendar?includeAI=true: the earnings summary uses a descriptive prompt and is filtered for advice
 * and directional sentences before it is returned with its label; provider errors are not echoed. Alpha Vantage,
 * OpenAI, auth and the rate limiter are fakes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => { process.env.OPENAI_API_KEY = 'test-key'; return { reply: '', sentSystem: '' as string, avFail: false }; });
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'ws-a', tier: 'pro' })) }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: vi.fn(async () => {}) }));
vi.mock('@/lib/rateLimit', () => ({ deepAnalysisLimiter: { check: () => ({ allowed: true }) }, getClientIP: () => '1.1.1.1' }));
vi.mock('@/lib/earningsCalendarCsv', () => ({ parseAlphaVantageEarningsCalendar: () => ({ rows: [{ symbol: 'AAPL', name: 'Apple', reportDate: '2026-10-30', fiscalDateEnding: '2026-09-30', estimate: 1.6, currency: 'USD' }] }) }));
import { GET } from '@/app/api/earnings-calendar/route';
import { EARNINGS_SUMMARY_LABEL, EARNINGS_SUMMARY_SYSTEM_PROMPT, sanitizeEarningsSummary } from '@/lib/news/earningsBrief';

beforeEach(() => {
  h.reply = ''; h.sentSystem = ''; h.avFail = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
    const u = String(url);
    if (u.includes('api.openai.com')) { h.sentSystem = JSON.parse(init.body).messages[0].content; return new Response(JSON.stringify({ choices: [{ message: { content: h.reply } }] }), { status: 200 }); }
    if (u.includes('function=EARNINGS_CALENDAR')) return h.avFail ? new Response('down', { status: 503 }) : new Response('symbol,name\nAAPL,Apple', { status: 200 });
    if (u.includes('function=EARNINGS')) return new Response(JSON.stringify({ quarterlyEarnings: [{ fiscalDateEnding: '2026-06-30', reportedDate: '2026-07-30', reportedEPS: '1.70', estimatedEPS: '1.60', surprise: '0.10', surprisePercentage: '6.25' }] }), { status: 200 });
    return new Response('{}', { status: 404 });
  }));
});
const call = async () => { const r = await GET(new NextRequest('https://msp.test/api/earnings-calendar?symbol=&horizon=3month&includeResults=true&includeAI=true')); return { status: r.status, body: await r.json() }; };

describe('earnings summary', () => {
  it('sends the descriptive prompt and returns only descriptive sentences with the label', async () => {
    h.reply = 'One of one companies reported EPS above the consensus estimate. This is bullish for tech and investors should consider adding exposure. Apple beat by 6.3%.';
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(h.sentSystem).toBe(EARNINGS_SUMMARY_SYSTEM_PROMPT);
    expect(body.aiAnalysis).toBe('One of one companies reported EPS above the consensus estimate. Apple beat by 6.3%.');
    expect(body.aiAnalysisLabel).toBe(EARNINGS_SUMMARY_LABEL);
  });
  it('an all-advice reply is dropped rather than shown', () => {
    expect(sanitizeEarningsSummary('Traders should buy the dip. Expect a rally into next week.')).toBeNull();
  });
  it('a provider error returns a generic message', async () => {
    h.avFail = true;
    const { status, body } = await call();
    expect(status).toBe(500);
    expect(body.error).toBe('Failed to fetch earnings calendar');
    expect(JSON.stringify(body)).not.toMatch(/503|Alpha Vantage API error/);
  });
});
