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

/** What Postgres returns for a reader that COALESCE's the two price columns. */
function priceFromReaderSql(sql: string, stored: { trigger_price: number | null; triggered_price: number | null }) {
  const coalesced = stored.trigger_price ?? stored.triggered_price;
  const row: Record<string, unknown> = {
    id: 'h1',
    alert_id: 'a1',
    symbol: 'QNT',
    condition_met: 'QNT crossed above $80',
    condition: 'price_above',
    target_price: 80,
    condition_type: 'price_above',
    condition_value: 80,
    triggered_at: '2026-10-06T00:00:00.000Z',
    notification_sent: false,
    notification_channel: 'push',
    acknowledged_at: null,
    user_action: null,
    alert_name: 'QNT level',
    alert_active: false,
  };
  if (/COALESCE\(\s*(?:h\.)?trigger_price\s*,\s*(?:h\.)?triggered_price\s*\)\s+AS\s+trigger_price/i.test(sql)) row.trigger_price = coalesced;
  if (/COALESCE\(\s*(?:h\.)?trigger_price\s*,\s*(?:h\.)?triggered_price\s*\)\s+AS\s+triggered_price/i.test(sql)) row.triggered_price = coalesced;
  return row;
}

function historyInsert(calls: unknown[][]) {
  return calls.find(([sql]) => String(sql).includes('INSERT INTO alert_history')) as [string, unknown[]] | undefined;
}

describe('alert_history price columns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.email.mockResolvedValue({ action: 'sent', reason: 'each', providerId: 'email-1' });
  });

  it('builds one insert placeholder and a coalesce select', () => {
    expect(historyPriceInsert('$6')).toEqual({
      columns: 'trigger_price, triggered_price',
      values: '$6, $6',
    });
    expect(historyPriceSelect('h', 'trigger_price')).toBe('COALESCE(h.trigger_price, h.triggered_price) AS trigger_price');
    expect(historyPriceSelect('', 'trigger_price')).toBe('COALESCE(trigger_price, triggered_price) AS trigger_price');
    expect(historyPriceSelect('h', 'triggered_price')).toBe('COALESCE(h.trigger_price, h.triggered_price) AS triggered_price');
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
      expect(body.log.join('\n')).toContain('History insert failed');
      expect(body.log.join('\n')).not.toMatch(/non-fatal/i);
      expect(err.mock.calls.some((call) => String(call[0]).includes('Failed to insert alert_history for AAPL (alert-test)') && call[1] === dbError)).toBe(true);
    } finally {
      err.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('smart-check writes the fired value to both price columns', async () => {
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
    expect(insert![0]).toContain('$3, $3');
    expect(insert![1][2]).toBe(90);
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
    expect(insert![0]).toContain('$6, $6');
    expect(insert![1][5]).toBe(210.25);
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
    vi.unstubAllGlobals();
  });

  it('history, recent and unread return the price when only triggered_price is stored', async () => {
    const stored = { trigger_price: null as number | null, triggered_price: 91 };
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return [{ total_triggers: '1', unacknowledged: '1', last_24h: '1', last_7d: '1' }];
      if (sql.includes('alert_history')) return [priceFromReaderSql(sql, stored)];
      return [];
    });

    const history = await (await historyGet(new NextRequest('https://example.test/api/alerts/history'))).json();
    expect(history.history[0].trigger_price).toBe(91);

    const recent = await (await recentGet(new NextRequest('https://example.test/api/alerts/recent'))).json();
    expect(recent.alerts[0].trigger_price).toBe(91);
    expect(recent.alerts[0].triggered_price).toBe(91);

    const unread = await (await unreadGet(new NextRequest('https://example.test/api/alerts/unread'))).json();
    expect(unread.alerts[0].trigger_price).toBe(91);
  });
});
