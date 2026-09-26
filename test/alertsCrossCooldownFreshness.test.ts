import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { decideAlert, isStaleStockQuote, latestOpenedTradingDay } from '@/lib/alerts/alertTiming';

const mocks = vi.hoisted(() => ({ q: vi.fn(), crypto: vi.fn(), push: vi.fn(), email: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/coingecko', () => ({ getPriceBySymbol: mocks.crypto }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));
vi.mock('@/lib/email', () => ({ sendAlertEmail: mocks.email }));
vi.mock('@/lib/pushServer', () => ({ sendPushToUser: mocks.push, PushTemplates: {} }));

import { GET as runCheck } from '@/app/api/alerts/check/route';

// Thu 24 Sep 2026, 11:00 ET (15:00 UTC): US session open.
const NOW = Date.parse('2026-09-24T15:00:00Z');
const above = { condition_type: 'price_above', condition_value: '100', asset_type: 'stock', is_recurring: true };

describe('TR-17: price alerts fire on a cross, not whenever price is beyond the level', () => {
  it('fires only when the previous check was on the other side', () => {
    expect(decideAlert({ ...above, last_price: '99' }, { price: 101, changePercent: 1 }, NOW)).toEqual({ fire: true });
    expect(decideAlert({ ...above, last_price: '102' }, { price: 101, changePercent: 1 }, NOW)).toEqual({ fire: false, reason: 'no_cross' });
    expect(decideAlert({ ...above, last_price: '99' }, { price: 98, changePercent: 1 }, NOW)).toEqual({ fire: false, reason: 'not_met' });
    const below = { ...above, condition_type: 'price_below' };
    expect(decideAlert({ ...below, last_price: '101' }, { price: 99, changePercent: -1 }, NOW)).toEqual({ fire: true });
    expect(decideAlert({ ...below, last_price: '98' }, { price: 99, changePercent: -1 }, NOW)).toEqual({ fire: false, reason: 'no_cross' });
  });

  it('an alert set on the wrong side does not fire on its first check (it only records the price)', () => {
    expect(decideAlert({ ...above, last_price: null }, { price: 150, changePercent: 1 }, NOW)).toEqual({ fire: false, reason: 'arming' });
  });

  it('a recurring price alert does not re-fire every run while price stays beyond the level', () => {
    // After a trigger the checker stores last_price = trigger price (beyond the level), so the next run is not a cross.
    expect(decideAlert({ ...above, last_price: '101', triggered_at: new Date(NOW - 5 * 60_000).toISOString() }, { price: 101.5, changePercent: 1 }, NOW))
      .toEqual({ fire: false, reason: 'no_cross' });
  });

  it('respects the alert cooldown', () => {
    const recent = new Date(NOW - 10 * 60_000).toISOString();
    expect(decideAlert({ ...above, last_price: '99', triggered_at: recent, cooldown_minutes: 60 }, { price: 101, changePercent: 1 }, NOW)).toEqual({ fire: false, reason: 'cooldown' });
    expect(decideAlert({ ...above, last_price: '99', triggered_at: recent, cooldown_minutes: 5 }, { price: 101, changePercent: 1 }, NOW)).toEqual({ fire: true });
  });
});

describe('TR-17: recurring % change alerts fire once per move period', () => {
  const drop = { condition_type: 'percent_change_down', condition_value: '2', is_recurring: true };
  it('stocks: once per trading day', () => {
    const q = { price: 97, changePercent: -3, asOfDate: '2026-09-24' };
    expect(decideAlert({ ...drop, asset_type: 'stock', triggered_at: '2026-09-24T14:00:00Z' }, q, NOW)).toEqual({ fire: false, reason: 'already_fired_this_period' });
    expect(decideAlert({ ...drop, asset_type: 'stock', triggered_at: '2026-09-23T19:00:00Z' }, q, NOW)).toEqual({ fire: true });
    expect(decideAlert({ ...drop, asset_type: 'stock', triggered_at: null }, q, NOW)).toEqual({ fire: true });
  });
  it('crypto: once per 24 hours', () => {
    const q = { price: 97, changePercent: -3 };
    expect(decideAlert({ ...drop, asset_type: 'crypto', triggered_at: new Date(NOW - 3 * 3600_000).toISOString() }, q, NOW)).toEqual({ fire: false, reason: 'already_fired_this_period' });
    expect(decideAlert({ ...drop, asset_type: 'crypto', triggered_at: new Date(NOW - 25 * 3600_000).toISOString() }, q, NOW)).toEqual({ fire: true });
  });
  it('one-time % alerts are unaffected', () => {
    expect(decideAlert({ ...drop, is_recurring: false, asset_type: 'stock' }, { price: 97, changePercent: -3, asOfDate: '2026-09-24' }, NOW)).toEqual({ fire: true });
  });
});

describe('TR-17: stale stock quotes', () => {
  it('knows the latest session that has opened (weekends, holidays, pre-market)', () => {
    expect(latestOpenedTradingDay(NOW)).toBe('2026-09-24'); // Thu 11:00 ET
    expect(latestOpenedTradingDay(Date.parse('2026-09-24T12:00:00Z'))).toBe('2026-09-23'); // Thu 08:00 ET, pre-market
    expect(latestOpenedTradingDay(Date.parse('2026-09-26T16:00:00Z'))).toBe('2026-09-25'); // Saturday
    expect(latestOpenedTradingDay(Date.parse('2026-11-26T16:00:00Z'))).toBe('2026-11-25'); // Thanksgiving
  });
  it('flags quotes from before that session', () => {
    expect(isStaleStockQuote({ price: 1, changePercent: 0, asOfDate: '2026-09-24' }, NOW)).toBe(false);
    expect(isStaleStockQuote({ price: 1, changePercent: 0, asOfDate: '2026-09-22' }, NOW)).toBe(true);
    expect(isStaleStockQuote({ price: 1, changePercent: 0, asOfDate: null }, NOW)).toBe(false);
  });
});

describe('TR-17: the checker route applies the rules', () => {
  let alerts: any[];
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mocks.q.mockImplementation(async (sql: string) => (sql.includes('FROM alerts') ? alerts : []));
    mocks.push.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const quote = (price: string, day: string) => vi.fn(async () => new Response(JSON.stringify({ 'Global Quote': { '05. price': price, '08. previous close': '100', '07. latest trading day': day } })));
  const run = async () => (await runCheck(new NextRequest('https://example.test/api/alerts/check'))).json();
  const base = { workspace_id: 'ws', symbol: 'SPY', asset_type: 'stock', notify_email: false, notify_push: true, name: 'x', cooldown_minutes: null, triggered_at: null };

  it('fires on a cross, records the price otherwise', async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'test';
    alerts = [
      { ...base, id: 'cross', condition_type: 'price_above', condition_value: '101', is_recurring: false, last_price: '100.5' },
      { ...base, id: 'wrong-side', condition_type: 'price_above', condition_value: '90', is_recurring: false, last_price: null },
    ];
    vi.stubGlobal('fetch', quote('102', '2026-09-24'));
    const body = await run();
    expect(body.triggeredIds).toEqual(['cross']);
    expect(mocks.q).toHaveBeenCalledWith(expect.stringContaining('SET last_price = $1'), [102, 'wrong-side']);
  });

  it('skips a stale stock quote entirely', async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'test';
    alerts = [{ ...base, id: 'cross', condition_type: 'price_above', condition_value: '101', is_recurring: false, last_price: '100.5' }];
    vi.stubGlobal('fetch', quote('102', '2026-09-21'));
    const body = await run();
    expect(body.triggeredIds).toEqual([]);
    expect(body.skippedStale).toEqual(['SPY (quote from 2026-09-21)']);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
