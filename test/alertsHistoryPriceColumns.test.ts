import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

delete process.env.CRON_SECRET;

const mocks = vi.hoisted(() => ({
  q: vi.fn(),
  email: vi.fn(async () => ({ action: 'sent' as const, reason: 'each', providerId: 'email-1' })),
  push: vi.fn(async () => undefined),
}));

vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'ws-1', tier: 'pro' }) }));
vi.mock('@/lib/alerts/emailControls', () => ({ deliverUserAlertEmail: mocks.email }));
vi.mock('@/lib/pushServer', () => ({ sendPushToUser: mocks.push, PushTemplates: {} }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));
vi.mock('@/lib/email', () => ({
  buildTriggeredAlertContent: () => ({ subject: 'test', html: '<p>test</p>' }),
}));

import { historyPriceInsert, historyPriceSelect } from '@/lib/alerts/historyPrice';
import { GET as testTrigger } from '@/app/api/alerts/test-trigger/route';
import { GET as smartCheck } from '@/app/api/alerts/smart-check/route';
import { GET as signalCheck } from '@/app/api/alerts/signal-check/route';
import { GET as strategyCheck } from '@/app/api/alerts/strategy-check/route';
import { GET as historyGet } from '@/app/api/alerts/history/route';
import { GET as recentGet } from '@/app/api/alerts/recent/route';
import { GET as unreadGet } from '@/app/api/alerts/unread/route';

const PRICE_TYPES = ['price_above', 'price_below', 'percent_change_up', 'percent_change_down'];

/** What Postgres returns for historyPriceSelect: price types fall back, other types do not, and 0 is null. */
function displayedPrice(conditionType: string, stored: { trigger_price: number | null; triggered_price: number | null }) {
  if (PRICE_TYPES.includes(conditionType)) {
    if (stored.trigger_price != null) return stored.trigger_price;
    if (stored.triggered_price == null || stored.triggered_price === 0) return null;
    return stored.triggered_price;
  }
  return stored.trigger_price;
}

function priceFromReaderSql(sql: string, stored: { trigger_price: number | null; triggered_price: number | null; condition_type: string }) {
  const shown = displayedPrice(stored.condition_type, stored);
  const row: Record<string, unknown> = {
    id: 'h1',
    alert_id: 'a1',
    symbol: 'QNT',
    condition_met: 'QNT crossed above $80',
    condition: stored.condition_type,
    target_price: 80,
    condition_type: stored.condition_type,
    condition_value: 80,
    triggered_at: '2026-10-06T00:00:00.000Z',
    notification_sent: false,
    notification_channel: 'push',
    acknowledged_at: null,
    user_action: null,
    alert_name: 'QNT level',
    alert_active: false,
  };
  const cast = String.raw`::float8 AS`;
  if (new RegExp(String.raw`CASE WHEN (?:h\.)?condition_type IN \([^)]*\) THEN COALESCE\(\s*(?:h\.)?trigger_price\s*,\s*NULLIF\(\s*(?:h\.)?triggered_price\s*,\s*0\s*\)\s*\) ELSE (?:h\.)?trigger_price END\)${cast} trigger_price`, 'i').test(sql)) {
    row.trigger_price = shown;
  }
  if (new RegExp(String.raw`CASE WHEN (?:h\.)?condition_type IN \([^)]*\) THEN COALESCE\(\s*(?:h\.)?trigger_price\s*,\s*NULLIF\(\s*(?:h\.)?triggered_price\s*,\s*0\s*\)\s*\) ELSE (?:h\.)?trigger_price END\)${cast} triggered_price`, 'i').test(sql)) {
    row.triggered_price = shown;
  }
  row.target_price = targetPriceFromSql(sql, stored.condition_type, 80);
  return row;
}

/** Recent toasts: price conditions keep condition_value; every other type is null. */
function targetPriceFromSql(sql: string, conditionType: string, conditionValue: number): number | null {
  const compact = sql.replace(/\s+/g, ' ');
  const match = compact.match(/CASE WHEN (?:\w+\.)?condition_type IN \(([^)]+)\) THEN (?:\w+\.)?condition_value ELSE NULL END\s*\)?\s+AS target_price/i);
  if (!match) return conditionValue;
  const types = [...match[1].matchAll(/'([^']+)'/g)].map((found) => found[1]);
  return types.includes(conditionType) ? conditionValue : null;
}

function historyInsert(calls: unknown[][]) {
  return calls.find(([sql]) => String(sql).includes('INSERT INTO alert_history')) as [string, unknown[]] | undefined;
}

describe('alert_history price columns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.email.mockResolvedValue({ action: 'sent', reason: 'each', providerId: 'email-1' });
  });

  it('builds insert placeholders and a price-type select cast to float8', () => {
    expect(historyPriceInsert('$6')).toEqual({
      columns: 'trigger_price, triggered_price',
      values: '$6, $6',
    });
    expect(historyPriceInsert('NULL', '$3')).toEqual({
      columns: 'trigger_price, triggered_price',
      values: 'NULL, $3',
    });
    expect(historyPriceInsert('NULLIF($6, 0)', '$6')).toEqual({
      columns: 'trigger_price, triggered_price',
      values: 'NULLIF($6, 0), $6',
    });
    const aliased = historyPriceSelect('h', 'trigger_price');
    expect(aliased).toBe("(CASE WHEN h.condition_type IN ('price_above', 'price_below', 'percent_change_up', 'percent_change_down') THEN COALESCE(h.trigger_price, NULLIF(h.triggered_price, 0)) ELSE h.trigger_price END)::float8 AS trigger_price");
    expect(historyPriceSelect('', 'trigger_price')).toBe("(CASE WHEN condition_type IN ('price_above', 'price_below', 'percent_change_up', 'percent_change_down') THEN COALESCE(trigger_price, NULLIF(triggered_price, 0)) ELSE trigger_price END)::float8 AS trigger_price");
    expect(historyPriceSelect('h', 'triggered_price')).toContain('::float8 AS triggered_price');
  });

  it('test-trigger writes the quote to both price columns', async () => {
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM user_subscriptions')) return [{ email: 'ada@example.com' }];
      if (sql.includes('INSERT INTO alerts')) return [{ id: 'alert-test' }];
      if (sql.includes('FROM alerts')) return [];
      return [];
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ 'Global Quote': { '05. price': '188.50' } }),
    })));

    const res = await testTrigger(new NextRequest('https://example.test/api/alerts/test-trigger'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const insert = historyInsert(mocks.q.mock.calls);
    expect(insert).toBeTruthy();
    const sql = insert![0].replace(/\s+/g, ' ');
    expect(sql).toContain('trigger_price, triggered_price, condition_met');
    expect(sql).toContain('NOW(), $3, $3, $4');
    expect(insert![1][2]).toBe(188.5);
    vi.unstubAllGlobals();
  });

  it('test-trigger logs a history insert failure with console.error', async () => {
    const dbError = new Error('null value in column "triggered_price"');
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM user_subscriptions')) return [{ email: 'ada@example.com' }];
      if (sql.includes('INSERT INTO alerts')) return [{ id: 'alert-test' }];
      if (sql.includes('INSERT INTO alert_history')) throw dbError;
      return [];
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const body = await (await testTrigger(new NextRequest('https://example.test/api/alerts/test-trigger'))).json();
      expect(body.success).toBe(false);
      expect(body.log.join('\n')).toContain('alert history was not recorded');
      expect(body.log.join('\n')).toContain('History insert failed');
      expect(body.log.join('\n')).not.toMatch(/non-fatal/i);
      expect(err.mock.calls.some((call) => String(call[0]).includes('Failed to insert alert_history for AAPL (alert-test)') && call[1] === dbError)).toBe(true);
    } finally {
      err.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('smart-check stores the metric in triggered_price and leaves trigger_price null', async () => {
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM alerts') && sql.includes('is_smart_alert')) {
        return [{
          id: 'smart-1', workspace_id: 'ws-1', symbol: 'BTC', condition_type: 'greed_extreme',
          condition_value: 80, is_recurring: true, notify_email: false, notify_push: false,
          name: 'greed', cooldown_minutes: 60, triggered_at: null,
        }];
      }
      return [];
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('fear-greed')) {
        return { ok: true, json: async () => ({ current: { value: 90, classification: 'Extreme Greed' } }) };
      }
      return { ok: true, json: async () => ({ coins: [] }) };
    }));
    const body = await (await smartCheck(new NextRequest('https://example.test/api/alerts/smart-check'))).json();
    expect(body.triggeredIds).toEqual(['smart-1']);
    const insert = historyInsert(mocks.q.mock.calls);
    expect(insert![0].replace(/\s+/g, ' ')).toContain('trigger_price, triggered_price');
    expect(insert![0]).toContain('NULL, $3');
    expect(insert![0]).not.toContain('$3, $3');
    expect(insert![1][2]).toBe(90);

    const stored = { trigger_price: null, triggered_price: 90, condition_type: 'greed_extreme' };
    mocks.q.mockImplementation(async (sql: string) => [priceFromReaderSql(sql, stored)]);
    const history = await (await historyGet(new NextRequest('https://example.test/api/alerts/history'))).json();
    expect(history.history[0].trigger_price).toBeNull();
    vi.unstubAllGlobals();
  });

  it('signal-check writes the scan price to both price columns', async () => {
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM alerts') && sql.includes('scanner_buy_signal')) {
        return [{
          id: 'sig-1', workspace_id: 'ws-1', symbol: 'AAPL', condition_type: 'scanner_buy_signal',
          condition_value: 65, is_recurring: false, notify_email: false, notify_push: false,
          name: 'buy', cooldown_minutes: 60, triggered_at: null, last_derivative_value: null,
          smart_alert_context: null,
        }];
      }
      return [];
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{ symbol: 'AAPL', score: 80, direction: 'bullish', signals: { bullish: 4, bearish: 1, neutral: 0 }, price: 210.25 }],
      }),
    })));
    const body = await (await signalCheck(new NextRequest('https://example.test/api/alerts/signal-check'))).json();
    expect(body.triggeredIds).toEqual(['sig-1']);
    const insert = historyInsert(mocks.q.mock.calls);
    expect(insert![0].replace(/\s+/g, ' ')).toContain('trigger_price, triggered_price');
    expect(insert![0]).toContain('NULLIF($6, 0), $6');
    expect(insert![1][5]).toBe(210.25);
    vi.unstubAllGlobals();
  });

  it('signal-check writes null trigger_price when the scan has no price', async () => {
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM alerts') && sql.includes('scanner_buy_signal')) {
        return [{
          id: 'sig-0', workspace_id: 'ws-1', symbol: 'AAPL', condition_type: 'scanner_buy_signal',
          condition_value: 65, is_recurring: false, notify_email: false, notify_push: false,
          name: 'buy', cooldown_minutes: 60, triggered_at: null, last_derivative_value: null,
          smart_alert_context: null,
        }];
      }
      return [];
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{ symbol: 'AAPL', score: 80, direction: 'bullish', signals: { bullish: 4, bearish: 1, neutral: 0 } }],
      }),
    })));
    const body = await (await signalCheck(new NextRequest('https://example.test/api/alerts/signal-check'))).json();
    expect(body.triggeredIds).toEqual(['sig-0']);
    const insert = historyInsert(mocks.q.mock.calls);
    expect(insert![0]).toContain('NULLIF($6, 0), $6');
    expect(insert![1][5]).toBe(0);
    vi.unstubAllGlobals();
  });

  it('strategy-check writes the fill price to both price columns', async () => {
    const today = new Date().toISOString().slice(0, 10);
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM alerts') && sql.includes('strategy_buy_signal')) {
        return [{
          id: 'st-1', workspace_id: 'ws-1', symbol: 'SPY', condition_type: 'strategy_buy_signal',
          condition_value: 0, is_recurring: false, notify_email: false, notify_push: false,
          name: 'strategy', cooldown_minutes: 60, triggered_at: null,
          smart_alert_context: { strategy: 'msp_day_trader', timeframe: 'daily' },
        }];
      }
      return [];
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        trades: [{ entryDate: `${today} 15:00:00`, entry: 123.45, exitDate: '2020-01-01', side: 'LONG', returnPercent: 1 }],
      }),
    })));
    const body = await (await strategyCheck(new NextRequest('https://example.test/api/alerts/strategy-check'))).json();
    expect(body.triggeredIds).toEqual(['st-1']);
    const insert = historyInsert(mocks.q.mock.calls);
    expect(insert![0].replace(/\s+/g, ' ')).toContain('trigger_price, triggered_price');
    expect(insert![0]).toContain('$6, $6');
    expect(insert![1][5]).toBe(123.45);
    const sqls = mocks.q.mock.calls.map(([sql]) => String(sql));
    const insertAt = sqls.findIndex((sql) => sql.includes('INSERT INTO alert_history'));
    const updateAt = sqls.findIndex((sql) => sql.includes('UPDATE alerts'));
    expect(insertAt).toBeGreaterThanOrEqual(0);
    expect(updateAt).toBeGreaterThan(insertAt);
    vi.unstubAllGlobals();
  });

  it('history, recent and unread fall back to triggered_price only for price conditions', async () => {
    const stored = { trigger_price: null as number | null, triggered_price: 91, condition_type: 'price_above' };
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return [{ total_triggers: '1', unacknowledged: '1', last_24h: '1', last_7d: '1' }];
      if (sql.includes('alert_history')) return [priceFromReaderSql(sql, stored)];
      return [];
    });

    const history = await (await historyGet(new NextRequest('https://example.test/api/alerts/history'))).json();
    expect(history.history[0].trigger_price).toBe(91);
    expect(String(mocks.q.mock.calls.find(([sql]) => String(sql).includes('FROM alert_history'))![0])).toContain('::float8');

    const recent = await (await recentGet(new NextRequest('https://example.test/api/alerts/recent'))).json();
    expect(recent.alerts[0].trigger_price).toBe(91);
    expect(recent.alerts[0].triggered_price).toBe(91);
    expect(recent.alerts[0].target_price).toBe(80);

    const unread = await (await unreadGet(new NextRequest('https://example.test/api/alerts/unread'))).json();
    expect(unread.alerts[0].trigger_price).toBe(91);
  });

  it('readers hide a stored 0 and do not show a smart metric as a price', async () => {
    const zero = { trigger_price: null as number | null, triggered_price: 0, condition_type: 'price_below' };
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return [{ total_triggers: '1', unacknowledged: '1', last_24h: '1', last_7d: '1' }];
      if (sql.includes('alert_history')) return [priceFromReaderSql(sql, zero)];
      return [];
    });
    const zeroHistory = await (await historyGet(new NextRequest('https://example.test/api/alerts/history'))).json();
    expect(zeroHistory.history[0].trigger_price).toBeNull();

    const metric = { trigger_price: null as number | null, triggered_price: 90, condition_type: 'greed_extreme' };
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('alert_history')) return [priceFromReaderSql(sql, metric)];
      return [];
    });
    const recent = await (await recentGet(new NextRequest('https://example.test/api/alerts/recent'))).json();
    expect(recent.alerts[0].trigger_price).toBeNull();
    expect(recent.alerts[0].triggered_price).toBeNull();
    expect(recent.alerts[0].target_price).toBeNull();
    const unread = await (await unreadGet(new NextRequest('https://example.test/api/alerts/unread'))).json();
    expect(unread.alerts[0].trigger_price).toBeNull();
  });

  it('recent target_price is null for a percent_change_up alert', async () => {
    const stored = { trigger_price: 80, triggered_price: 91, condition_type: 'percent_change_up' };
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('alert_history')) return [priceFromReaderSql(sql, stored)];
      return [];
    });
    const recent = await (await recentGet(new NextRequest('https://example.test/api/alerts/recent'))).json();
    expect(recent.alerts[0].condition).toBe('percent_change_up');
    expect(recent.alerts[0].target_price).toBeNull();
  });
});
