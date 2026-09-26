/**
 * MV-5: Golden Egg → Fundamentals ownership context from Alpha Vantage INSIDER_TRANSACTIONS, CONGRESS_TRADES and
 * INSTITUTIONAL_HOLDINGS. Fixtures are trimmed copies of the documentation demo responses (IBM / AAPL).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  clearOwnershipCache, getOwnershipContext, summarizeCongressTrades, summarizeInsiderTransactions,
  summarizeInstitutionalHoldings, unavailableReason,
} from '@/lib/ownership/avOwnership';
import { congressHeadline, insiderHeadline, institutionalHeadline } from '@/lib/ownership/ownershipText';

const fx = (name: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures/av-ownership', name), 'utf8'));
const INSIDER = fx('insider_IBM.json');
const CONGRESS = fx('congress_AAPL.json');
const INSTITUTIONAL = fx('institutional_IBM.json');
const NOW = Date.UTC(2026, 8, 26, 9); // Sat 26 Sep 2026 19:00 AEST

describe('insider transactions summary (last 90 days)', () => {
  it('counts priced common-stock buys and sells; grants, RSU/phantom and fee-share rows are kept apart', () => {
    const s = summarizeInsiderTransactions(INSIDER, NOW);
    expect(s.status).toBe('ok');
    if (s.status !== 'ok') return;
    expect(s.from).toBe('2026-06-28');
    expect(s.buys).toEqual({ count: 0, shares: 0, value: 0 });
    expect(s.sells).toEqual({ count: 3, shares: 29035, value: 6915023 });
    expect(s.awards).toEqual({ count: 2, shares: 7295 });
    expect(s.otherCount).toBe(15); // 1 phantom stock, 2 RSU rows, 12 director fee-share rows
    expect(s.netShares).toBe(-29035);
    expect(s.lastTransactionDate).toBe('2026-08-27');
    expect(s.notable[0]).toMatchObject({ date: '2026-08-26', name: 'THOMAS, ROBERT DAVID', side: 'sell', shares: 25000, price: 230.32, value: 5758088 });
    expect(insiderHeadline(s)).toBe('Last 90 days: 0 buys (0 sh, $0) vs 3 sells (29K sh, $6.9M), net selling of $6.9M.');
  });

  it('reports open-market buys and the net direction', () => {
    const s = summarizeInsiderTransactions({ data: [
      { transaction_date: '2026-09-10', executive: 'DOE, JANE', executive_title: 'CFO', security_type: 'Common Stock', acquisition_or_disposal: 'A', shares: '10000', share_price: '50' },
      { transaction_date: '2026-09-01', executive: 'ROE, RICK', executive_title: 'Director', security_type: 'Class A Common Stock', acquisition_or_disposal: 'D', shares: '2000', share_price: '55' },
      { transaction_date: '2026-01-01', executive: 'OLD, ROW', executive_title: 'CEO', security_type: 'Common Stock', acquisition_or_disposal: 'D', shares: '999999', share_price: '10' },
    ] }, NOW);
    if (s.status !== 'ok') throw new Error('expected ok');
    expect(s.buys).toEqual({ count: 1, shares: 10000, value: 500000 });
    expect(s.sells).toEqual({ count: 1, shares: 2000, value: 110000 });
    expect(s.netValue).toBe(390000);
    expect(s.notable.map((t) => t.side)).toEqual(['buy', 'sell']);
    expect(insiderHeadline(s)).toContain('net buying of $390K');
  });

  it('says so when there is nothing priced in the window', () => {
    const s = summarizeInsiderTransactions({ data: [] }, NOW);
    if (s.status !== 'ok') throw new Error('expected ok');
    expect(insiderHeadline(s)).toBe('No priced insider buys or sells reported in the last 90 days.');
    expect(summarizeInsiderTransactions({}, NOW)).toMatchObject({ status: 'unavailable' });
  });
});

describe('congress trades summary', () => {
  it('lists the most recent disclosed trades and counts the last 12 months', () => {
    const s = summarizeCongressTrades(CONGRESS, NOW);
    if (s.status !== 'ok') throw new Error('expected ok');
    expect(s.totalTrades).toBe(12);
    expect(s.last12m).toEqual({ buys: 2, sells: 8, other: 0 });
    expect(s.lastTradeDate).toBe('2026-09-22');
    expect(s.recent[0]).toMatchObject({ date: '2026-09-22', politician: 'Pete Sessions', party: 'R', state: 'TX', type: 'SELL', amountMin: 100001, amountMax: 250000 });
    expect(s.recent).toHaveLength(8);
    expect(congressHeadline(s)).toBe('Last 12 months: 10 disclosed trades (2 buy, 8 sell).');
    expect(congressHeadline({ ...s, totalTrades: 0, recent: [] })).toBe('No congressional trades disclosed for this symbol.');
  });
});

describe('institutional holdings summary', () => {
  it('reads ownership %, holder counts, the quarter-over-quarter net change and top holders', () => {
    const s = summarizeInstitutionalHoldings(INSTITUTIONAL);
    if (s.status !== 'ok') throw new Error('expected ok');
    expect(s).toMatchObject({ ownershipPct: 76, holders: 3936, totalShares: 714367306, holdersIncreased: 2032, holdersDecreased: 1460, holdersUnchanged: 444, netSharesChanged: 14323034, netSharesChangedPct: 2.05, reportPeriod: '2026-06-30' });
    expect(s.topHolders).toHaveLength(5);
    expect(s.topHolders[0]).toEqual({ name: 'VANGUARD GROUP INC', shares: 97216131, changeShares: 1439824, changePct: 1.5, changeType: 'increased', lastReported: '2025-12-31' });
    expect(institutionalHeadline(s)).toBe('76% institutional ownership · 3,936 holders · net +14.3M sh (+2.0%) vs prior quarter — filings as of 2026-06-30.');
  });
});

describe('unavailable reasons', () => {
  it('turns AV Information/Note errors into a short reason and never echoes an API key', () => {
    expect(unavailableReason(new Error('AV info error: This is a premium endpoint. Please subscribe.'), 'SECRETKEY1')).toBe('Alpha Vantage: This is a premium endpoint. Please subscribe.');
    expect(unavailableReason(new Error('AV quota exceeded: We have detected your API key as ABCD1234 and our standard API rate limit is 25 requests per day.'), 'XYZ')).toBe('Alpha Vantage rate limit: We have detected your API key as [key] and our standard API rate limit is 25 requests per day.');
    expect(unavailableReason(new Error('failed https://x/query?apikey=SECRETKEY1&symbol=A'), 'SECRETKEY1')).not.toContain('SECRETKEY1');
  });
});

describe('getOwnershipContext (through the shared AV governor, cached)', () => {
  const OLD_KEY = process.env.ALPHA_VANTAGE_API_KEY;
  beforeEach(() => { clearOwnershipCache(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (OLD_KEY === undefined) delete process.env.ALPHA_VANTAGE_API_KEY; else process.env.ALPHA_VANTAGE_API_KEY = OLD_KEY;
  });

  it('returns all three sections, sends the 90-day from= filter, and caches for hours', async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'TESTKEY';
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('function=INSIDER_TRANSACTIONS')) return new Response(JSON.stringify(INSIDER));
      if (url.includes('function=CONGRESS_TRADES')) return new Response(JSON.stringify(CONGRESS));
      if (url.includes('function=INSTITUTIONAL_HOLDINGS')) return new Response(JSON.stringify(INSTITUTIONAL));
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const ctx = await getOwnershipContext('ibm', { now: NOW });
    expect(ctx.symbol).toBe('IBM');
    expect([ctx.insider.status, ctx.congress.status, ctx.institutional.status]).toEqual(['ok', 'ok', 'ok']);
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls.find((u) => u.includes('INSIDER_TRANSACTIONS'))).toContain('symbol=IBM&from=2026-06-28&apikey=TESTKEY');
    await getOwnershipContext('IBM', { now: NOW + 3 * 60 * 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('shows "unavailable" with Alpha Vantage\'s reason per section, and retries a failure after 15 minutes', async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'TESTKEY';
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('function=CONGRESS_TRADES')) return new Response(JSON.stringify({ Information: 'This is a premium endpoint. You may subscribe to any of the premium plans.' }));
      if (url.includes('function=INSTITUTIONAL_HOLDINGS')) return new Response(JSON.stringify({ 'Error Message': 'Invalid API call.' }));
      return new Response(JSON.stringify(INSIDER));
    });
    vi.stubGlobal('fetch', fetchMock);
    const ctx = await getOwnershipContext('IBM', { now: NOW });
    expect(ctx.insider.status).toBe('ok');
    expect(ctx.congress).toEqual({ status: 'unavailable', reason: 'Alpha Vantage: This is a premium endpoint. You may subscribe to any of the premium plans.' });
    expect(ctx.institutional).toEqual({ status: 'unavailable', reason: 'Alpha Vantage has no data for this symbol' });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[ownership] CONGRESS_TRADES IBM unavailable: Alpha Vantage: This is a premium endpoint'));
    await getOwnershipContext('IBM', { now: NOW + 5 * 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await getOwnershipContext('IBM', { now: NOW + 16 * 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(5); // congress + institutional retried; insider still cached
  });

  it('makes no calls without an Alpha Vantage key', async () => {
    delete process.env.ALPHA_VANTAGE_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const ctx = await getOwnershipContext('IBM', { now: NOW });
    expect(ctx.insider).toEqual({ status: 'unavailable', reason: 'Alpha Vantage is not configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
