import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  getQuote: vi.fn(),
  limiterCheck: vi.fn(() => ({ allowed: true, remaining: 4, resetTime: Date.now() + 60_000 })),
  ip: '203.0.113.10',
  store: new Map<string, unknown>(),
}));

vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'ws1' }) }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));
vi.mock('@/lib/yahoo-finance', () => ({ getQuote: (...args: unknown[]) => state.getQuote(...args) }));
vi.mock('@/lib/rateLimit', () => ({
  deepAnalysisLimiter: { check: (...args: unknown[]) => state.limiterCheck(...args) },
  getClientIP: () => state.ip,
}));
vi.mock('@/lib/redis', () => ({
  getCached: async (key: string) => state.store.get(key) ?? null,
  setCached: async (key: string, value: object) => {
    state.store.set(key, { ...value, _ts: 1 });
    return true;
  },
}));

import { GET } from '@/app/api/commodities/route';

const quoteTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();

function liveQuote(symbol: string, price: number, previousClose: number) {
  return {
    symbol,
    price,
    previousClose,
    change: 0,
    changePercent: 0,
    open: price,
    high: price,
    low: price,
    volume: 10,
    quoteTime,
  };
}

describe('commodity cache and Yahoo failure row', () => {
  beforeEach(() => {
    state.store.clear();
    state.getQuote.mockReset();
    state.limiterCheck.mockReset();
    state.limiterCheck.mockReturnValue({ allowed: true, remaining: 4, resetTime: Date.now() + 60_000 });
    state.ip = '203.0.113.10';
  });

  it('serves a second request from the shared cache without a vendor call or a limiter count', async () => {
    state.getQuote.mockResolvedValue(liveQuote('GC=F', 4025.5, 4000));
    const first = await GET(new NextRequest('https://example.test/api/commodities?symbol=GOLD'));
    const body1 = await first.json();
    state.ip = '203.0.113.11';
    const second = await GET(new NextRequest('https://example.test/api/commodities?symbol=GOLD'));
    const body2 = await second.json();

    expect(first.status).toBe(200);
    expect(body1.commodity).toMatchObject({
      symbol: 'GOLD',
      price: 4025.5,
      change: 25.5,
      sourceSymbol: 'GC=F',
      sourceLabel: 'Yahoo Finance futures (GC=F / SI=F)',
      unavailableReason: null,
    });
    expect(body1.commodity.changePercent).toBeCloseTo((25.5 / 4000) * 100, 8);
    expect(body1.commodity.changePercent).not.toBe(0);
    expect(body2.commodity).toEqual(body1.commodity);
    expect(state.getQuote).toHaveBeenCalledTimes(1);
    expect(state.getQuote).toHaveBeenCalledWith('GC=F');
    expect(state.limiterCheck).toHaveBeenCalledTimes(1);
    console.log('GOLD_AFTER ' + JSON.stringify({
      price: body1.commodity.price,
      change: body1.commodity.change,
      changePercent: body1.commodity.changePercent,
      date: body1.commodity.date,
      asOfLabel: body1.commodity.asOfLabel,
      sourceLabel: body1.commodity.sourceLabel,
      limiterChecks: state.limiterCheck.mock.calls.length,
      vendorCalls: state.getQuote.mock.calls.length,
    }));
  });

  it('returns null on a failed fetch, never 0, and does not count the cached miss again', async () => {
    state.getQuote.mockResolvedValue(null);
    const first = await GET(new NextRequest('https://example.test/api/commodities?symbol=SILVER'));
    const body1 = await first.json();
    const second = await GET(new NextRequest('https://example.test/api/commodities?symbol=SILVER'));
    const body2 = await second.json();

    expect(first.status).toBe(200);
    expect(body1.commodity.price).toBeNull();
    expect(body1.commodity.change).toBeNull();
    expect(body1.commodity.changePercent).toBeNull();
    expect(JSON.stringify(body1.commodity)).not.toContain('0.00');
    expect(body1.commodity.sourceLabel).toBe('Yahoo Finance futures (GC=F / SI=F)');
    expect(body1.commodity.unavailableReason).toBe('Yahoo Finance futures quote unavailable');
    expect(body2.commodity).toEqual(body1.commodity);
    expect(state.getQuote).toHaveBeenCalledTimes(1);
    expect(state.getQuote).toHaveBeenCalledWith('SI=F');
    expect(state.limiterCheck).toHaveBeenCalledTimes(1);
    console.log('GOLD_FAIL_AFTER ' + JSON.stringify({
      price: body1.commodity.price,
      change: body1.commodity.change,
      changePercent: body1.commodity.changePercent,
      limiterChecks: state.limiterCheck.mock.calls.length,
      vendorCalls: state.getQuote.mock.calls.length,
    }));
  });

  it('does not call Yahoo when the limiter refuses a cache miss', async () => {
    state.limiterCheck.mockReturnValue({ allowed: false, remaining: 0, resetTime: Date.now() + 1000 });
    const res = await GET(new NextRequest('https://example.test/api/commodities?symbol=GOLD'));
    expect(res.status).toBe(429);
    expect(state.getQuote).not.toHaveBeenCalled();
  });
});
