import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'ws-1', tier: 'pro' }) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => true }));

import { GET as listAlerts } from '@/app/api/alerts/route';
import { avgRetriggerInterval, pushBadgeState, triggersLast24h } from '@/lib/alerts/summaryStats';

const NOW = Date.parse('2026-09-26T12:00:00Z');
const at = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString();

describe('pushBadgeState', () => {
  it('is Enabled only with permission granted and a saved subscription', () => {
    expect(pushBadgeState({ supported: true, permission: 'granted', subscribed: true })).toBe('Enabled');
    expect(pushBadgeState({ supported: true, permission: 'granted', subscribed: false })).toBe('Not set up');
    expect(pushBadgeState({ supported: true, permission: 'default', subscribed: false })).toBe('Not set up');
    expect(pushBadgeState({ supported: true, permission: 'denied', subscribed: false })).toBe('Blocked');
    expect(pushBadgeState({ supported: false, permission: 'unsupported', subscribed: false })).toBe('Unsupported');
    expect(pushBadgeState({ supported: null, permission: null, subscribed: null })).toBe('Checking');
  });
});

describe('triggersLast24h', () => {
  const rows = [{ triggered_at: at(10) }, { triggered_at: at(23 * 60) }, { triggered_at: at(25 * 60) }];
  it('uses the server rolling count when present (covers all history, not just loaded rows)', () => {
    expect(triggersLast24h(rows, 42, NOW)).toBe(42);
    expect(triggersLast24h(rows, 0, NOW)).toBe(0);
  });
  it('falls back to a rolling 24h count of loaded rows, not the browser calendar day', () => {
    expect(triggersLast24h(rows, null, NOW)).toBe(2);
    expect(triggersLast24h(rows, undefined, NOW)).toBe(2);
  });
});

describe('avgRetriggerInterval', () => {
  it('does not mix gaps between different alerts', () => {
    // Two different alerts firing 5 minutes apart: no alert has re-triggered yet.
    expect(avgRetriggerInterval([
      { alert_id: 'a', symbol: 'BTC', triggered_at: at(0) },
      { alert_id: 'b', symbol: 'ETH', triggered_at: at(5) },
    ])).toBe('N/A');
  });
  it('averages gaps between re-triggers of the same alert', () => {
    expect(avgRetriggerInterval([
      { alert_id: 'a', triggered_at: at(0) },
      { alert_id: 'b', triggered_at: at(1) },
      { alert_id: 'a', triggered_at: at(60) },
      { alert_id: 'a', triggered_at: at(180) },
      { alert_id: 'b', triggered_at: at(241) },
    ])).toBe('2.3h'); // gaps a: 60m, 120m; b: 240m -> 140m average
  });
  it('falls back to symbol + condition when rows have no alert id', () => {
    expect(avgRetriggerInterval([
      { symbol: 'SPY', condition_type: 'price_above', triggered_at: at(0) },
      { symbol: 'SPY', condition_type: 'price_above', triggered_at: at(30) },
      { symbol: 'SPY', condition_type: 'price_below', triggered_at: at(31) },
    ])).toBe('30m');
  });
});

describe('GET /api/alerts quota.triggersToday', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM alert_history')) return [{ count: '3' }];
      if (sql.includes('FROM alert_quotas')) return [{ max_alerts: 3, active_alerts: 1, total_triggers_today: 9999 }];
      return [];
    });
  });
  it('is the rolling 24h count from history, not the never-reset lifetime counter', async () => {
    const res = await listAlerts(new NextRequest('https://example.test/api/alerts'));
    const body = await res.json();
    expect(body.quota.triggersToday).toBe(3);
    const historySql = mocks.q.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes('FROM alert_history'))!;
    expect(historySql).toMatch(/INTERVAL '24 hours'/);
  });
});

describe('alerts page summary wiring', () => {
  const src = readFileSync(resolve(__dirname, '../app/tools/alerts/page.tsx'), 'utf8');
  it('push badge reflects the browser push state, not the in-app preference', () => {
    expect(src).not.toMatch(/label="Push" state=\{prefs\?\.in_app_enabled/);
    expect(src).toContain('state={pushState}');
  });
  it('uses the server rolling 24h count and labels it as such', () => {
    expect(src).toContain('historyJson?.stats?.last24h');
    expect(src).not.toMatch(/toDateString\(\) === today\.toDateString\(\)/);
    expect(src).toContain('label="Last 24h"');
  });
});
