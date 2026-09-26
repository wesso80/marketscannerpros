/**
 * OV-14 follow-up: after #151 the live /api/market-movers had no equity rows and no equityAsOf (26 Sep 22:25 AEST),
 * because a delayed TOP_GAINERS_LOSERS answer without the expected keys was dropped silently. lib/avTopMovers reads
 * delayed-suffixed keys, falls back to the end-of-day list with a label, and says why.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ q: vi.fn(), top: vi.fn(), market: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/coingecko', () => ({ getTopGainersLosers: mocks.top, getMarketData: mocks.market }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));

import { fetchAvTopMovers, parseAvTopMovers } from '@/lib/avTopMovers';
import { equityMoversBasisLabel } from '@/lib/alphaVantageEntitlement';

const row = { ticker: 'MSGY', price: '8.07', change_amount: '6.1', change_percentage: '309.6447%', volume: '54900000' };
const eod = { metadata: 'Top gainers', last_updated: '2026-09-25 16:15:57 US/Eastern', top_gainers: [row], top_losers: [], most_actively_traded: [] };
const res = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;
const entitlementOf = (url: unknown) => new URL(String(url)).searchParams.get('entitlement');

describe('parseAvTopMovers', () => {
  it('reads the documented keys and the last_updated time', () => {
    const p = parseAvTopMovers(eod);
    expect(p).toMatchObject({ gainers: [row], asOf: '2026-09-25T20:15:57.000Z' });
  });
  it('reads delayed-suffixed keys, as Alpha Vantage does for other delayed payloads', () => {
    const p = parseAvTopMovers({ 'last_updated - DATA DELAYED BY 15 MINUTES': '2026-09-28 11:30:00 US/Eastern', 'top_gainers - DATA DELAYED BY 15 MINUTES': [row] });
    expect(p).toMatchObject({ gainers: [row], asOf: '2026-09-28T15:30:00.000Z' });
  });
  it('returns Alpha Vantage\'s message instead of empty lists', () => {
    expect(parseAvTopMovers({ Information: 'This entitlement is not included in your plan.' })).toEqual({ error: 'This entitlement is not included in your plan.' });
    expect(parseAvTopMovers({ metadata: 'x' })).toEqual({ error: 'no mover lists in the response (keys: metadata)' });
  });
});

describe('fetchAvTopMovers', () => {
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });

  it('uses the realtime list when it has rows (one call)', async () => {
    const fetcher = vi.fn(async () => res(eod));
    const m = await fetchAvTopMovers('k', fetcher as unknown as typeof fetch);
    expect(m).toMatchObject({ feed: 'realtime', note: null, apiCalls: 1, asOf: '2026-09-25T20:15:57.000Z' });
    expect(entitlementOf(fetcher.mock.calls[0][0])).toBe('realtime');
  });

  it('falls back to the end-of-day list, labelled, with the reason', async () => {
    const fetcher = vi.fn(async (url: string) => res(entitlementOf(url) === 'realtime' ? { Information: 'Premium entitlement required.' } : eod));
    const m = await fetchAvTopMovers('k', fetcher as unknown as typeof fetch);
    expect(m).toMatchObject({ feed: 'end_of_day', apiCalls: 2, gainers: [row], note: 'Realtime list unavailable (Premium entitlement required.)' });
    expect(fetcher.mock.calls.map((c) => entitlementOf(c[0]))).toEqual(['realtime', null]);
  });

  it('is unavailable (no fake rows) when both calls fail', async () => {
    const fetcher = vi.fn(async () => res({ Note: 'rate limit' }));
    const m = await fetchAvTopMovers('k', fetcher as unknown as typeof fetch);
    expect(m).toMatchObject({ feed: 'unavailable', gainers: [], asOf: null, note: 'Alpha Vantage movers unavailable (rate limit)' });
  });

  it('labels each basis; realtime reads "Market closed" outside the US regular session', () => {
    const friOpen = Date.parse('2026-09-25T15:00:00Z'); // Fri 11:00 ET
    const satAest = Date.parse('2026-09-26T13:00:00Z'); // Sat 09:00 ET
    const friAfterClose = Date.parse('2026-09-25T20:15:00Z'); // Fri 16:15 ET
    expect(equityMoversBasisLabel('realtime', friOpen)).toBe('Realtime');
    expect(equityMoversBasisLabel(undefined, friOpen)).toBe('Realtime');
    expect(equityMoversBasisLabel('realtime', satAest)).toBe('Market closed');
    expect(equityMoversBasisLabel('realtime', friAfterClose)).toBe('Market closed');
    expect(equityMoversBasisLabel('end_of_day', friOpen)).toBe('End of day');
    expect(equityMoversBasisLabel('unavailable', friOpen)).toBe('Unavailable');
  });
});

describe('GET /api/market-movers returns equity rows, as-of and feed after a realtime refusal', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.q.mockResolvedValue([]);
    mocks.top.mockResolvedValue({ top_gainers: [], top_losers: [] });
    mocks.market.mockResolvedValue([]);
    process.env.ALPHA_VANTAGE_API_KEY = 'test';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (url: string) => res(entitlementOf(url) === 'realtime' ? { Information: 'Premium entitlement required.' } : eod)));
  });

  it('shows the end-of-day list with its time instead of no equity data', async () => {
    const { GET } = await import('@/app/api/market-movers/route');
    const body = await (await GET(new NextRequest('https://example.test/api/market-movers'))).json();
    expect(body.topGainers.filter((m: any) => m.asset_class === 'equity').map((m: any) => m.ticker)).toEqual(['MSGY']);
    expect(body).toMatchObject({ equityAsOf: '2026-09-25T20:15:57.000Z', equityFeed: 'end_of_day', equityNote: 'Realtime list unavailable (Premium entitlement required.)' });
  });
});
