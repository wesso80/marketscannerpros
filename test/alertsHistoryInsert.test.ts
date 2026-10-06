import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ q: vi.fn(), crypto: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/coingecko', () => ({ getPriceBySymbol: mocks.crypto }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));
vi.mock('@/lib/pushServer', () => ({ sendPushToUser: vi.fn(), PushTemplates: {} }));
vi.mock('@/lib/alerts/emailControls', () => ({ deliverUserAlertEmail: vi.fn() }));

import { POST as runCheck } from '@/app/api/alerts/check/route';

const alert = {
  id: 'alert-qnt',
  workspace_id: 'ws-1',
  symbol: 'QNT',
  asset_type: 'crypto',
  condition_type: 'price_above',
  condition_value: 80,
  is_recurring: false,
  notify_email: false,
  notify_push: false,
  name: 'QNT level',
  last_price: 70,
  triggered_at: null,
  cooldown_minutes: null,
};

describe('basic alert history insert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.crypto.mockResolvedValue({ price: 90, change24h: 2 });
  });

  it('writes triggered_price and trigger_price from the quote', async () => {
    mocks.q.mockImplementation(async (sql: string) => (sql.includes('FROM alerts') ? [alert] : []));
    const res = await runCheck(new NextRequest('https://example.test/api/alerts/check', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect((await res.json()).triggeredIds).toEqual(['alert-qnt']);

    const insert = mocks.q.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO alert_history'));
    expect(insert).toBeTruthy();
    const sql = String(insert![0]).replace(/\s+/g, ' ');
    expect(sql).toContain('trigger_price, triggered_price, condition_met');
    expect(sql).toContain('NOW(), $3, $3, $4');
    expect(insert![1]).toEqual([
      'alert-qnt',
      'ws-1',
      90,
      'QNT crossed above $80 (now $90.00)',
      'QNT',
      'price_above',
      80,
      false,
      'push',
    ]);
  });

  it('logs an alert_history insert failure as an error', async () => {
    const dbError = new Error('null value in column "triggered_price" of relation "alert_history" violates not-null constraint');
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM alerts')) return [alert];
      if (sql.includes('INSERT INTO alert_history')) throw dbError;
      return [];
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const body = await (await runCheck(new NextRequest('https://example.test/api/alerts/check', { method: 'POST' }))).json();
      expect(body.triggeredIds).toEqual(['alert-qnt']);
      const logged = err.mock.calls.map((call) => String(call[0]));
      expect(logged).toContain('[Alert] Failed to insert alert_history for QNT (alert-qnt). The trigger was not recorded:');
      expect(logged.some((line) => /non-fatal/i.test(line) && line.includes('alert_history'))).toBe(false);
      expect(err.mock.calls.some((call) => call[1] === dbError)).toBe(true);
    } finally {
      err.mockRestore();
    }
  });
});
