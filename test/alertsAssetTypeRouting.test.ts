import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({ q: vi.fn(), crypto: vi.fn(), push: vi.fn(), email: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/coingecko', () => ({ getPriceBySymbol: mocks.crypto }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));
vi.mock('@/lib/email', () => ({ sendAlertEmail: mocks.email }));
vi.mock('@/lib/pushServer', () => ({ sendPushToUser: mocks.push, PushTemplates: {} }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'ws-1', tier: 'pro' }) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => true }));

import { POST as createAlert } from '@/app/api/alerts/route';
import { GET as runCheck } from '@/app/api/alerts/check/route';
import { parseFxAlertQuote, quoteSourceFor, validateBasicAlertAssetType } from '@/lib/alerts/assetTypes';

function post(body: Record<string, unknown>) {
  return createAlert(new NextRequest('https://example.test/api/alerts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('validateBasicAlertAssetType', () => {
  it('requires a market (no silent crypto default)', () => {
    expect(validateBasicAlertAssetType(undefined, 'price_above', 'AAPL').ok).toBe(false);
    expect(validateBasicAlertAssetType('', 'price_above', 'AAPL').ok).toBe(false);
  });
  it('accepts crypto, equity and forex price alerts', () => {
    expect(validateBasicAlertAssetType('crypto', 'price_above', 'BTC')).toEqual({ ok: true, assetType: 'crypto' });
    expect(validateBasicAlertAssetType('equity', 'percent_change_down', 'SPY')).toEqual({ ok: true, assetType: 'equity' });
    expect(validateBasicAlertAssetType('FOREX', 'price_below', 'EUR/USD')).toEqual({ ok: true, assetType: 'forex' });
  });
  it('refuses commodity alerts, forex % alerts, bad forex pairs and unknown markets', () => {
    expect(validateBasicAlertAssetType('commodity', 'price_above', 'GOLD')).toMatchObject({ ok: false, error: expect.stringMatching(/commodity/i) });
    expect(validateBasicAlertAssetType('forex', 'percent_change_up', 'EURUSD')).toMatchObject({ ok: false, error: expect.stringMatching(/forex/i) });
    expect(validateBasicAlertAssetType('forex', 'price_above', 'EURO')).toMatchObject({ ok: false, error: expect.stringMatching(/pair/i) });
    expect(validateBasicAlertAssetType('options', 'price_above', 'SPY').ok).toBe(false);
  });
});

describe('quoteSourceFor / parseFxAlertQuote', () => {
  it('routes each market to its feed; commodity has none', () => {
    expect(quoteSourceFor('crypto')).toBe('crypto');
    expect(quoteSourceFor('equity')).toBe('stock');
    expect(quoteSourceFor('forex')).toBe('forex');
    expect(quoteSourceFor('commodity')).toBe('unsupported');
    expect(quoteSourceFor('stocks')).toBe('stock'); // unknown values keep the old stock behaviour
  });
  it('parses an Alpha Vantage exchange rate into a price-only quote', () => {
    expect(parseFxAlertQuote({ 'Realtime Currency Exchange Rate': { '5. Exchange Rate': '1.08450', '6. Last Refreshed': '2026-09-25 10:00:00', '7. Time Zone': 'UTC' } }))
      .toEqual({ price: 1.0845, changePercent: null });
    expect(parseFxAlertQuote({ Note: 'rate limited' })).toBeNull();
  });
});

describe('POST /api/alerts asset type', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return [{ count: '0' }];
      if (sql.includes('INSERT INTO alerts')) return [{ id: 'new-alert' }];
      return [];
    });
  });

  it('returns 400 and writes nothing when a basic alert has no asset type', async () => {
    const res = await post({ symbol: 'AAPL', conditionType: 'price_above', conditionValue: 200 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/assetType/);
    expect(mocks.q.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO alerts'))).toBe(false);
  });

  it('returns 400 for commodity alerts', async () => {
    const res = await post({ symbol: 'GOLD', assetType: 'commodity', conditionType: 'price_above', conditionValue: 2500 });
    expect(res.status).toBe(400);
  });

  it('stores the chosen market for a forex price alert', async () => {
    const res = await post({ symbol: 'EURUSD', assetType: 'forex', conditionType: 'price_above', conditionValue: 1.1 });
    expect(res.status).toBe(200);
    const insert = mocks.q.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO alerts'))!;
    expect(insert[1][2]).toBe('forex');
  });

  it('smart alerts keep their existing default market', async () => {
    const res = await post({ symbol: 'BTC', conditionType: 'oi_surge', conditionValue: 5, isSmartAlert: true });
    expect(res.status).toBe(200);
    const insert = mocks.q.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO alerts'))!;
    expect(insert[1][2]).toBe('crypto');
  });
});

describe('price checker routes by asset type', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
    mocks.push.mockResolvedValue(undefined);
    mocks.email.mockResolvedValue(undefined);
  });

  function withAlerts(rows: Record<string, unknown>[]) {
    mocks.q.mockImplementation(async (sql: string) => (sql.includes('FROM alerts') && sql.includes('SELECT') ? rows : []));
  }

  it('prices forex alerts from the exchange-rate feed, not as a stock', async () => {
    withAlerts([{ id: 'fx1', workspace_id: 'ws-1', symbol: 'EURUSD', asset_type: 'forex', condition_type: 'price_above', condition_value: '1.1', last_price: '1.09', is_recurring: false, notify_email: false, notify_push: false, name: 'EURUSD 1.10' }]);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ 'Realtime Currency Exchange Rate': { '5. Exchange Rate': '1.1050', '7. Time Zone': 'UTC' } }) });
    const body = await (await runCheck(new NextRequest('https://example.test/api/alerts/check'))).json();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('function=CURRENCY_EXCHANGE_RATE');
    expect(url).toContain('from_currency=EUR');
    expect(url).toContain('to_currency=USD');
    expect(url).not.toContain('GLOBAL_QUOTE');
    expect(body.triggeredIds).toEqual(['fx1']);
  });

  it('does not price commodity alerts as a stock; reports them as not checked', async () => {
    withAlerts([{ id: 'c1', workspace_id: 'ws-1', symbol: 'GOLD', asset_type: 'commodity', condition_type: 'price_above', condition_value: '2500', last_price: null, is_recurring: false, notify_email: false, notify_push: false, name: 'Gold' }]);
    const body = await (await runCheck(new NextRequest('https://example.test/api/alerts/check'))).json();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.triggered).toBe(0);
    expect(JSON.stringify(body.errors)).toMatch(/commodity/);
  });

  it('still prices equity alerts with GLOBAL_QUOTE', async () => {
    withAlerts([{ id: 'e1', workspace_id: 'ws-1', symbol: 'AAPL', asset_type: 'equity', condition_type: 'price_below', condition_value: '10', last_price: '12', is_recurring: false, notify_email: false, notify_push: false, name: 'AAPL' }]);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ 'Global Quote': { '05. price': '200', '10. change percent': '1%' } }) });
    await runCheck(new NextRequest('https://example.test/api/alerts/check'));
    expect(String(fetchMock.mock.calls[0][0])).toContain('function=GLOBAL_QUOTE');
  });
});

describe('UI callers send a market', () => {
  it('the basic alert form has no crypto default and validates the market', () => {
    const src = readFileSync(resolve(__dirname, '../components/AlertsWidget.tsx'), 'utf8');
    expect(src).not.toMatch(/assetType: 'crypto' as const/);
    expect(src).toContain('validateBasicAlertAssetType(newAlert.assetType');
  });
  it('the options scanner posts camelCase fields with an equity market', () => {
    const src = readFileSync(resolve(__dirname, '../components/options/OptionsScannerPage.tsx'), 'utf8');
    expect(src).not.toMatch(/condition_type:|condition_value:|alert_name:/);
    expect(src).toMatch(/assetType: 'equity',\s*conditionType: 'price_above'/);
  });
});

describe('forex trigger text', () => {
  it('shows the rate to 5 decimals without a dollar sign', async () => {
    const { describeConditionMet } = await import('@/lib/alerts/priceConditions');
    expect(describeConditionMet('USDJPY', 'price_above', '150', { price: 150.12345, changePercent: null }, 'forex'))
      .toBe('USDJPY crossed above 150 (now 150.12345)');
    expect(describeConditionMet('AAPL', 'price_above', '200', { price: 201, changePercent: null }, 'equity'))
      .toBe('AAPL crossed above $200 (now $201.00)');
  });
});
