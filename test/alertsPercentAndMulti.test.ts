import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { checkPriceAlertCondition, describeConditionMet, parseGlobalQuote } from '@/lib/alerts/priceConditions';

const mocks = vi.hoisted(() => ({
  q: vi.fn(),
  crypto: vi.fn(),
  push: vi.fn(),
  email: vi.fn(),
  discord: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/coingecko', () => ({ getPriceBySymbol: mocks.crypto }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));
vi.mock('@/lib/email', () => ({ sendAlertEmail: mocks.email }));
vi.mock('@/lib/pushServer', () => ({ sendPushToUser: mocks.push, PushTemplates: {} }));
vi.mock('@/lib/discord-bridge', () => ({ postToDiscord: mocks.discord, buildAlertEmbed: (x: unknown) => x }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'ws-1', tier: 'pro' }) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => true }));

import { GET as runCheck } from '@/app/api/alerts/check/route';
import { POST as createAlert } from '@/app/api/alerts/route';

describe('percent change condition (pure)', () => {
  it('fires up at +threshold and down at -threshold, mirror images', () => {
    expect(checkPriceAlertCondition('percent_change_up', 2, { price: 102, changePercent: 2 })).toBe(true);
    expect(checkPriceAlertCondition('percent_change_up', 2, { price: 101.9, changePercent: 1.9 })).toBe(false);
    expect(checkPriceAlertCondition('percent_change_down', 2, { price: 98, changePercent: -2 })).toBe(true);
    expect(checkPriceAlertCondition('percent_change_down', 2, { price: 98.1, changePercent: -1.9 })).toBe(false);
    // An up alert never fires on a drop and vice versa.
    expect(checkPriceAlertCondition('percent_change_up', 2, { price: 90, changePercent: -10 })).toBe(false);
    expect(checkPriceAlertCondition('percent_change_down', 2, { price: 110, changePercent: 10 })).toBe(false);
  });

  it('is symmetric for every magnitude, and treats a stored negative threshold as its magnitude', () => {
    for (const t of [0.5, 1.5, 2, 5]) {
      for (const move of [0.2, 1, 1.5, 2, 3, 7]) {
        expect(checkPriceAlertCondition('percent_change_up', t, { price: 1, changePercent: move }))
          .toBe(checkPriceAlertCondition('percent_change_down', t, { price: 1, changePercent: -move }));
      }
    }
    expect(checkPriceAlertCondition('percent_change_down', -2, { price: 1, changePercent: -2.5 })).toBe(true);
  });

  it('never fires without a % change, with a zero threshold, or for unknown types', () => {
    expect(checkPriceAlertCondition('percent_change_up', 2, { price: 1, changePercent: null })).toBe(false);
    expect(checkPriceAlertCondition('percent_change_down', 0, { price: 1, changePercent: -5 })).toBe(false);
    expect(checkPriceAlertCondition('multi', 0, { price: 1, changePercent: 5 })).toBe(false);
  });

  it('keeps price alerts unchanged (string DECIMAL values from Postgres included)', () => {
    expect(checkPriceAlertCondition('price_above', '100', { price: 100, changePercent: null })).toBe(true);
    expect(checkPriceAlertCondition('price_above', 100, { price: 99.99, changePercent: null })).toBe(false);
    expect(checkPriceAlertCondition('price_below', '100.5', { price: 100, changePercent: null })).toBe(true);
  });

  it('parses Alpha Vantage quotes: change vs previous close, delayed key, and missing fields', () => {
    expect(parseGlobalQuote({ 'Global Quote': { '05. price': '490.00', '08. previous close': '500.00' } }))
      .toEqual({ price: 490, changePercent: -2, asOfDate: null });
    expect(parseGlobalQuote({ 'Global Quote - DATA DELAYED BY 15 MINUTES': { '05. price': '10', '10. change percent': '1.5000%' } }))
      .toEqual({ price: 10, changePercent: 1.5, asOfDate: null });
    expect(parseGlobalQuote({ 'Global Quote': { '05. price': '10' } })).toEqual({ price: 10, changePercent: null, asOfDate: null });
    expect(parseGlobalQuote({ 'Global Quote': {} })).toBeNull();
    expect(parseGlobalQuote({ Note: 'rate limited' })).toBeNull();
  });

  it('describes what fired, including the basis of the move', () => {
    expect(describeConditionMet('SPY', 'percent_change_down', 2, { price: 490, changePercent: -2 }, 'equity'))
      .toBe('SPY -2.00% vs previous close (alert: -2%, now $490.00)');
    expect(describeConditionMet('BTC', 'percent_change_up', 3, { price: 100000, changePercent: 3.25 }, 'crypto'))
      .toBe('BTC +3.25% in 24h (alert: +3%, now $100000.00)');
  });
});

describe('alert checker route: % change alerts are evaluated', () => {
  const alerts = [
    { id: 'spy-drop', workspace_id: 'ws-1', symbol: 'SPY', asset_type: 'equity', condition_type: 'percent_change_down', condition_value: '2', is_recurring: false, notify_email: false, notify_push: true, name: 'SPY 2% drop' },
    { id: 'spy-rally', workspace_id: 'ws-1', symbol: 'SPY', asset_type: 'equity', condition_type: 'percent_change_up', condition_value: '1.5', is_recurring: false, notify_email: false, notify_push: true, name: 'SPY rally day' },
    { id: 'btc-up', workspace_id: 'ws-1', symbol: 'BTC', asset_type: 'crypto', condition_type: 'percent_change_up', condition_value: '3', is_recurring: false, notify_email: false, notify_push: true, name: 'BTC +3%' },
    { id: 'btc-down', workspace_id: 'ws-1', symbol: 'BTC', asset_type: 'crypto', condition_type: 'percent_change_down', condition_value: '3', is_recurring: false, notify_email: false, notify_push: true, name: 'BTC -3%' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
    mocks.q.mockImplementation(async (sql: string) => (sql.includes('FROM alerts') ? alerts : []));
    mocks.discord.mockResolvedValue(undefined);
    mocks.push.mockResolvedValue(undefined);
  });

  it('triggers the SPY 2% drop preset on a -2.4% day and leaves the rally alert armed; crypto uses the 24h change', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      'Global Quote': { '05. price': '488.00', '08. previous close': '500.00' },
    }))));
    mocks.crypto.mockResolvedValue({ price: 100000, change24h: 3.4 });

    const res = await runCheck(new NextRequest('https://example.test/api/alerts/check'));
    const body = await res.json();
    vi.unstubAllGlobals();

    expect(body.checked).toBe(4);
    expect(body.triggeredIds.sort()).toEqual(['btc-up', 'spy-drop']);
    const pushBodies = mocks.push.mock.calls.map((c) => c[1].body);
    expect(pushBodies).toContain('SPY -2.40% vs previous close (alert: -2%, now $488.00)');
    expect(pushBodies).toContain('BTC +3.40% in 24h (alert: +3%, now $100000.00)');
  });

  it('mirrors the result for the opposite move', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      'Global Quote': { '05. price': '508.00', '08. previous close': '500.00' },
    }))));
    mocks.crypto.mockResolvedValue({ price: 100000, change24h: -3.4 });

    const body = await (await runCheck(new NextRequest('https://example.test/api/alerts/check'))).json();
    vi.unstubAllGlobals();
    expect(body.triggeredIds.sort()).toEqual(['btc-down', 'spy-rally']);
  });
});

describe('creating multi-condition alerts is refused (no checker evaluates them)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.q.mockResolvedValue([]);
  });

  it('returns 400 and writes nothing', async () => {
    const res = await createAlert(new NextRequest('https://example.test/api/alerts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        symbol: 'BTC', assetType: 'crypto', conditionType: 'multi', conditionValue: 0,
        isMultiCondition: true, conditionLogic: 'AND',
        conditions: [{ conditionType: 'price_above', conditionValue: 50000 }, { conditionType: 'rsi_below', conditionValue: 30 }],
      }),
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not available/i);
    expect(mocks.q).not.toHaveBeenCalled();
  });

  it('still creates single % change alerts', async () => {
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return [{ count: '0' }];
      if (sql.includes('INSERT INTO alerts')) return [{ id: 'new-alert' }];
      return [];
    });
    const res = await createAlert(new NextRequest('https://example.test/api/alerts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: 'SPY', assetType: 'equity', conditionType: 'percent_change_down', conditionValue: 2 }),
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});
