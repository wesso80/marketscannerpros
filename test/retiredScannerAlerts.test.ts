import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import {
  RETIRED_SCANNER_CONDITION_TYPES,
  SCANNER_CONDITIONS_ALERT_LABEL,
  alertConditionLabel,
  alertHistoryLabel,
} from '@/lib/alertPresentation';

delete process.env.CRON_SECRET;

const mocks = vi.hoisted(() => ({
  q: vi.fn(),
  email: vi.fn(async () => ({ action: 'sent' as const, reason: 'each', providerId: 'email-1' })),
  push: vi.fn(async () => undefined),
}));

vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'ws-1', tier: 'pro' }) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => true }));
vi.mock('@/lib/alerts/emailControls', () => ({ deliverUserAlertEmail: mocks.email }));
vi.mock('@/lib/pushServer', () => ({ sendPushToUser: mocks.push, PushTemplates: {} }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));

import { POST as createAlert } from '@/app/api/alerts/route';
import { GET as signalCheck } from '@/app/api/alerts/signal-check/route';

const SCAN = {
  symbol: 'AAPL',
  score: 81,
  rsi: 22.4,
  changePercent: 1.25,
  volume: 1_500_000,
  direction: 'bullish' as const,
  signals: { bullish: 4, bearish: 1, neutral: 0 },
  price: 210.25,
};

function alertRow(conditionType: string, conditionValue: number, direction: 'bullish' | 'bearish' = 'bullish') {
  return {
    id: 'sig-1',
    workspace_id: 'ws-1',
    symbol: 'AAPL',
    condition_type: conditionType,
    condition_value: conditionValue,
    is_recurring: true,
    notify_email: true,
    notify_push: true,
    name: 'stored composite name 81',
    cooldown_minutes: 60,
    triggered_at: null,
    last_derivative_value: null,
    smart_alert_context: null,
    direction,
  };
}

function withScan(row: ReturnType<typeof alertRow>, scan: Record<string, unknown>) {
  mocks.q.mockImplementation(async (sql: string) => {
    if (String(sql).includes('FROM alerts')) return [row];
    if (String(sql).includes('user_subscriptions')) return [{ email: 'ada@example.com' }];
    return [];
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ results: [{ ...SCAN, ...scan, direction: row.direction === 'bearish' ? 'bearish' : scan.direction ?? SCAN.direction }] }),
  })));
}

describe('existing scanner condition rows keep composite evaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  it('fires on the composite when RSI would not, and stays quiet when only RSI matches', async () => {
    withScan(alertRow('scanner_buy_signal', 65), { score: 81, rsi: 22.4, direction: 'bullish' });
    const fired = await (await signalCheck(new NextRequest('https://example.test/api/alerts/signal-check'))).json();
    expect(fired.triggeredIds).toEqual(['sig-1']);

    withScan(alertRow('scanner_buy_signal', 65), { score: 40, rsi: 90, direction: 'bullish' });
    const quiet = await (await signalCheck(new NextRequest('https://example.test/api/alerts/signal-check'))).json();
    expect(quiet.triggeredIds).toEqual([]);

    withScan(alertRow('scanner_score_above', 70), { score: 70, rsi: undefined, direction: 'neutral' });
    const above = await (await signalCheck(new NextRequest('https://example.test/api/alerts/signal-check'))).json();
    expect(above.triggeredIds).toEqual(['sig-1']);

    withScan(alertRow('scanner_score_below', 30, 'bearish'), { score: 30, rsi: 80, direction: 'bearish' });
    const below = await (await signalCheck(new NextRequest('https://example.test/api/alerts/signal-check'))).json();
    expect(below.triggeredIds).toEqual(['sig-1']);

    withScan(alertRow('scanner_sell_signal', 35, 'bearish'), { score: 20, rsi: 90, direction: 'bearish' });
    const sell = await (await signalCheck(new NextRequest('https://example.test/api/alerts/signal-check'))).json();
    expect(sell.triggeredIds).toEqual(['sig-1']);

    withScan(alertRow('scanner_sell_signal', 35, 'bearish'), { score: 90, rsi: 10, direction: 'bearish' });
    const sellQuiet = await (await signalCheck(new NextRequest('https://example.test/api/alerts/signal-check'))).json();
    expect(sellQuiet.triggeredIds).toEqual([]);
  });

  it('emails and push use the scanner conditions name and measurements, not the composite', async () => {
    withScan(alertRow('scanner_score_above', 65), { score: 81, rsi: 22.4, changePercent: 1.25, volume: 1_500_000 });
    const body = await (await signalCheck(new NextRequest('https://example.test/api/alerts/signal-check'))).json();
    expect(body.triggeredIds).toEqual(['sig-1']);
    const mailed = mocks.email.mock.calls[0][0] as { subject: string; html: string; line: string };
    const pushed = mocks.push.mock.calls[0][1] as { title: string; body: string };
    const blob = `${mailed.subject}\n${mailed.html}\n${mailed.line}\n${pushed.title}\n${pushed.body}`;
    expect(blob).toContain(SCANNER_CONDITIONS_ALERT_LABEL);
    expect(blob).toContain('RSI 22.4');
    expect(blob).toContain('+1.25%');
    expect(blob).toContain('volume 1,500,000');
    expect(blob).toContain('5 indicators');
    expect(blob).not.toMatch(/\b81\b/);
    expect(blob).not.toMatch(/\b65\b/);
    expect(blob).not.toContain('/100');
    expect(blob).not.toContain('Current:');
    expect(alertConditionLabel('scanner_score_above', 81)).toBe(SCANNER_CONDITIONS_ALERT_LABEL);
    expect(alertConditionLabel('scanner_buy_signal', 65)).not.toMatch(/\d/);
    expect(alertHistoryLabel('scanner_sell_signal')).toBe(SCANNER_CONDITIONS_ALERT_LABEL);
  });
});

describe('new scanner condition alerts are rejected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.q.mockImplementation(async (sql: string) => {
      if (String(sql).includes('COUNT(*)')) return [{ count: '0' }];
      if (String(sql).includes('INSERT INTO alerts')) return [{ id: 'new-alert' }];
      return [];
    });
  });

  it('the create API rejects the four retired types and still accepts an RSI alert', async () => {
    for (const conditionType of RETIRED_SCANNER_CONDITION_TYPES) {
      const res = await createAlert(new NextRequest('https://example.test/api/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol: 'AAPL', assetType: 'equity', conditionType, conditionValue: 70, isSmartAlert: true }),
      }));
      expect(res.status, conditionType).toBe(400);
      expect((await res.json()).error).toMatch(/cannot be created/i);
    }
    expect(mocks.q.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO alerts'))).toBe(false);

    const rsi = await createAlert(new NextRequest('https://example.test/api/alerts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: 'AAPL', assetType: 'equity', conditionType: 'rsi_above', conditionValue: 70 }),
    }));
    expect(rsi.status).toBe(200);
  });

  it('the create picker no longer offers the four retired types', () => {
    const src = readFileSync('components/AlertsWidget.tsx', 'utf8');
    for (const conditionType of RETIRED_SCANNER_CONDITION_TYPES) {
      expect(src).not.toContain(`<option value="${conditionType}"`);
      expect(src).not.toContain(`conditionType: '${conditionType}'`);
    }
    expect(src).toContain('SCANNER_CONDITIONS_ALERT_LABEL');
    expect(src).toContain('value="scanner_bullish_flip"');
  });
});
