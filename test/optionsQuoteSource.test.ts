/**
 * Options Terminal showed "98/98 contracts lack valid two-sided quotes" during US market hours (AAPL, 25 Sep 2026)
 * because every options tool asked Alpha Vantage for REALTIME_OPTIONS_FMV first. FMV returns fair-value marks,
 * not a quoted market (no usable bid/ask), and the old code only fell back to HISTORICAL_OPTIONS when the call
 * failed or came back empty — never when the quotes were missing.
 *
 * Now: REALTIME_OPTIONS (live bid/ask + greeks) first; if the live chain has too few two-sided quotes,
 * HISTORICAL_OPTIONS (previous session close, bid/ask + IV) is used and labelled with its as-of date.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  fmvMarksIbm, historicalOptionsIbm, realtimeNotEntitledSample, realtimeOptionsIbm, realtimePreMarketIbm,
} from './fixtures/alphaVantageOptions';

const m = vi.hoisted(() => {
  process.env.ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'test-key';
  return { av: {} as Record<string, unknown>, calls: [] as string[] };
});
vi.mock('@/lib/redis', () => ({
  getCached: vi.fn(async () => null),
  setCached: vi.fn(async () => undefined),
  CACHE_KEYS: { optionsChain: (s: string) => `opt:chain:${s}` },
  CACHE_TTL: { optionsChain: 120 },
}));
vi.mock('@/lib/options/access', () => ({ checkOptionsAccess: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/avRateGovernor', () => ({
  avTakeToken: vi.fn(async () => undefined),
  avFetch: vi.fn(async (url: string) => {
    const fn = new URL(url).searchParams.get('function') || '';
    m.calls.push(fn);
    const v = m.av[fn];
    if (v instanceof Error) throw v;
    return v ?? null;
  }),
}));

import {
  clearSharedOptionsChainCache, defaultChainProviders, describeChainSource, fetchSharedOptionsChain,
  hasTwoSidedQuote, twoSidedQuoteCoverage, type AvChainFunction,
} from '../lib/options/chainCache';
import { avFetch } from '../lib/avRateGovernor';
import { GET as chainGET } from '../app/api/options-chain/route';
import { GET as flowGET } from '../app/api/options-flow/route';

const fetchPayload = (fn: string, url: string) => (avFetch as any)(url, fn);
const load = (symbol = 'IBM', providers?: AvChainFunction[]) => fetchSharedOptionsChain(symbol, { apiKey: 'test-key', fetchPayload, providers });

beforeEach(() => {
  m.av = {}; m.calls = [];
  clearSharedOptionsChainCache();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-25T15:15:00Z')); // Fri 11:15 ET, market open
});
afterEach(() => { vi.useRealTimers(); });

describe('two-sided quote detection on AV string fields', () => {
  it('reads string numbers; "0.00", missing or crossed quotes are not two-sided', () => {
    expect(hasTwoSidedQuote({ bid: '6.00', ask: '6.35' })).toBe(true);
    expect(hasTwoSidedQuote({ bid: '0.00', ask: '0.00' })).toBe(false);
    expect(hasTwoSidedQuote({ bid: '0.00', ask: '0.35' })).toBe(false);
    expect(hasTwoSidedQuote({ mark: '6.17' } as any)).toBe(false);
    expect(hasTwoSidedQuote({ bid: '6.40', ask: '6.35' })).toBe(false);
    expect(twoSidedQuoteCoverage(historicalOptionsIbm().data)).toBe(1);
    expect(twoSidedQuoteCoverage(fmvMarksIbm().data)).toBe(0);
  });
});

describe('shared chain source selection', () => {
  it('default order is REALTIME_OPTIONS → HISTORICAL_OPTIONS (FMV is not a quote source)', () => {
    expect(defaultChainProviders()).toEqual(['REALTIME_OPTIONS', 'HISTORICAL_OPTIONS']);
  });

  it('a quoted REALTIME_OPTIONS chain is used with ONE Alpha Vantage call', async () => {
    m.av = { REALTIME_OPTIONS: realtimeOptionsIbm(), HISTORICAL_OPTIONS: historicalOptionsIbm() };
    const chain = await load();
    expect(m.calls).toEqual(['REALTIME_OPTIONS']);
    expect(chain).toMatchObject({ provider: 'REALTIME_OPTIONS', quoteBasis: 'realtime', asOfDate: '2026-09-25', quoteCoverage: 1 });
    expect(describeChainSource(chain!)).toBe('Alpha Vantage REALTIME_OPTIONS — live bid/ask (as of 2026-09-25)');
  });

  it('FMV marks with no bid/ask → previous-session HISTORICAL_OPTIONS chain, labelled with its date', async () => {
    m.av = { REALTIME_OPTIONS_FMV: fmvMarksIbm(), HISTORICAL_OPTIONS: historicalOptionsIbm() };
    const chain = await load('IBM', ['REALTIME_OPTIONS_FMV', 'HISTORICAL_OPTIONS']);
    expect(m.calls).toEqual(['REALTIME_OPTIONS_FMV', 'HISTORICAL_OPTIONS']);
    expect(chain).toMatchObject({ provider: 'HISTORICAL_OPTIONS', quoteBasis: 'previous_session', asOfDate: '2026-09-24', quoteCoverage: 1 });
    expect(chain!.warnings).toContain('REALTIME_OPTIONS_FMV:low_quote_coverage_0pct');
    expect(describeChainSource(chain!)).toBe('Alpha Vantage HISTORICAL_OPTIONS — previous session close (as of 2026-09-24)');
  });

  it('realtime chain with empty books (pre-market) → previous session close', async () => {
    m.av = { REALTIME_OPTIONS: realtimePreMarketIbm(), HISTORICAL_OPTIONS: historicalOptionsIbm() };
    const chain = await load();
    expect(chain).toMatchObject({ provider: 'HISTORICAL_OPTIONS', quoteBasis: 'previous_session' });
  });

  it('keeps the live chain when the previous session is no better quoted', async () => {
    const thinHistory = { ...historicalOptionsIbm(), data: fmvMarksIbm().data.map((r) => ({ ...r, date: '2026-09-24' })) };
    m.av = { REALTIME_OPTIONS: realtimePreMarketIbm(), HISTORICAL_OPTIONS: thinHistory };
    const chain = await load();
    expect(chain).toMatchObject({ provider: 'REALTIME_OPTIONS', quoteBasis: 'marks_only', asOfDate: '2026-09-25' });
  });

  it('marks-only chain is still returned (labelled) when HISTORICAL_OPTIONS is unavailable', async () => {
    m.av = { REALTIME_OPTIONS_FMV: fmvMarksIbm(), HISTORICAL_OPTIONS: new Error('AV request timed out for HISTORICAL_OPTIONS IBM') };
    const chain = await load('IBM', ['REALTIME_OPTIONS_FMV', 'HISTORICAL_OPTIONS']);
    expect(chain).toMatchObject({ provider: 'REALTIME_OPTIONS_FMV', quoteBasis: 'marks_only' });
    expect(describeChainSource(chain!)).toMatch(/marks only, no usable bid\/ask/);
  });

  it('a key not entitled to REALTIME_OPTIONS is not asked again straight away (no wasted calls)', async () => {
    m.av = { REALTIME_OPTIONS: realtimeNotEntitledSample(), HISTORICAL_OPTIONS: historicalOptionsIbm() };
    expect((await load('IBM'))?.provider).toBe('HISTORICAL_OPTIONS');
    m.calls = [];
    m.av = { REALTIME_OPTIONS: realtimeNotEntitledSample(), HISTORICAL_OPTIONS: { ...historicalOptionsIbm(), data: historicalOptionsIbm().data.map((r) => ({ ...r, symbol: 'MSFT' })) } };
    expect((await load('MSFT'))?.provider).toBe('HISTORICAL_OPTIONS');
    expect(m.calls).toEqual(['HISTORICAL_OPTIONS']);
  });

  it('a rate-limit note (mentions premium plans) does NOT mark the realtime function as not entitled', async () => {
    m.av = { REALTIME_OPTIONS: new Error('AV info error: Our standard API rate limit is 25 requests per day. Please subscribe to any of the premium plans'), HISTORICAL_OPTIONS: historicalOptionsIbm() };
    await load('IBM');
    m.calls = [];
    m.av = { REALTIME_OPTIONS: realtimeOptionsIbm() };
    clearSharedOptionsChainCache();
    expect((await load('IBM'))?.provider).toBe('REALTIME_OPTIONS');
  });
});

describe('GET /api/options-chain (Options Terminal)', () => {
  const call = () => chainGET(new NextRequest('http://localhost/api/options-chain?symbol=IBM'));

  it('live quotes: contracts carry bid/ask/IV and the response says realtime', async () => {
    m.av = { REALTIME_OPTIONS: realtimeOptionsIbm(), GLOBAL_QUOTE: { 'Global Quote': { '05. price': '229.10' } } };
    const body = await (await call()).json();
    expect(body).toMatchObject({ success: true, provider: 'REALTIME_OPTIONS', quoteBasis: 'realtime', asOfDate: '2026-09-25', quoteCoveragePct: 100 });
    expect(body.contracts.every((c: any) => c.bid > 0 && c.ask >= c.bid && c.iv > 0)).toBe(true);
  });

  it('live chain without two-sided quotes → previous session close with bid/ask, as-of date and a clear label', async () => {
    m.av = { REALTIME_OPTIONS: realtimePreMarketIbm(), HISTORICAL_OPTIONS: historicalOptionsIbm(), GLOBAL_QUOTE: { 'Global Quote': { '05. price': '229.10' } } };
    const body = await (await call()).json();
    expect(body).toMatchObject({
      success: true, provider: 'HISTORICAL_OPTIONS', quoteBasis: 'previous_session', asOfDate: '2026-09-24', quoteCoveragePct: 100,
      sourceLabel: 'Alpha Vantage HISTORICAL_OPTIONS — previous session close (as of 2026-09-24)',
    });
    const atm = body.contracts.find((c: any) => c.strike === 230 && c.type === 'call');
    expect(atm).toMatchObject({ bid: 6, ask: 6.35, mark: 6.17 });
    expect(body.providerIssues.join(' ')).toMatch(/REALTIME_OPTIONS: only 13% of contracts have a two-sided bid\/ask/);
  });
});

describe('GET /api/options-flow', () => {
  it('uses the shared chain and labels previous-session flow as such', async () => {
    const hist = historicalOptionsIbm();
    // Flow needs >= 20 contracts on the chosen expiry: repeat the real rows across strikes.
    hist.data = Array.from({ length: 3 }, (_, i) => hist.data.map((r) => ({ ...r, strike: (Number(r.strike) + i * 20).toFixed(2), contractID: `${r.contractID}-${i}` }))).flat();
    m.av = { REALTIME_OPTIONS: realtimeNotEntitledSample(), HISTORICAL_OPTIONS: hist, GLOBAL_QUOTE: { 'Global Quote': { '05. price': '229.10' } } };
    const res = await flowGET(new NextRequest('http://localhost/api/options-flow?symbol=IBM'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ provider: 'HISTORICAL_OPTIONS', quoteBasis: 'previous_session', asOfDate: '2026-09-24' });
  });
});
