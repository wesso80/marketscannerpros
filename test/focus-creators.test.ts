import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionFromCookieMock, qMock } = vi.hoisted(() => ({
  getSessionFromCookieMock: vi.fn(),
  qMock: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  getSessionFromCookie: getSessionFromCookieMock,
}));

vi.mock('../lib/db', () => ({
  q: qMock,
}));

vi.mock('@/lib/auth', () => ({
  getSessionFromCookie: getSessionFromCookieMock,
}));

vi.mock('@/lib/db', () => ({
  q: qMock,
}));

import { POST as createAlertFromFocus } from '../app/api/alerts/create-from-focus/route';
import { POST as createPlanFromFocus } from '../app/api/plans/draft-from-focus/route';

describe('focus creator endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionFromCookieMock.mockResolvedValue({
      workspaceId: 'ws_test_123',
      cid: 'cus_test_123',
      tier: 'pro_trader',
    });
  });

  it('creates alert artifact and returns event ids', async () => {
    qMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM decision_packets')) {
        return [{ packet_id: 'dp_test_1', symbol: 'NVDA', status: 'candidate' }];
      }
      if (sql.includes('INSERT INTO alerts')) {
        return [{ id: 'alert_test_1' }];
      }
      return [];
    });

    const req = new Request('http://localhost/api/alerts/create-from-focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        focusId: 'focus_1',
        decisionPacketId: 'dp_test_1',
        symbol: 'NVDA',
        direction: 'bullish',
        notes: 'from test',
      }),
    });

    const res = await createAlertFromFocus(req as any);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.alertId).toBe('alert_test_1');
    expect(Array.isArray(body.eventIds)).toBe(true);
    expect(body.eventIds.length).toBe(2);

    const alertedUpdateCall = qMock.mock.calls.find(
      (call) =>
        typeof call[0] === 'string'
        && call[0].includes('UPDATE decision_packets')
        && call[0].includes("'alerted'")
    );
    expect(alertedUpdateCall).toBeTruthy();
  });

  it('uses focusId as fallback packet reference when decisionPacketId is absent', async () => {
    qMock.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO alerts')) {
        return [{ id: 'alert_test_1' }];
      }
      return [];
    });

    const req = new Request('http://localhost/api/alerts/create-from-focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        focusId: 'focus_1',
        symbol: 'NVDA',
        direction: 'bullish',
        notes: 'from test',
      }),
    });

    const res = await createAlertFromFocus(req as any);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.alertId).toBe('alert_test_1');
    expect(Array.isArray(body.eventIds)).toBe(true);
    expect(body.eventIds.length).toBe(2);

    const packetUpdateCall = qMock.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('UPDATE decision_packets')
    );
    expect(packetUpdateCall).toBeTruthy();
    expect(Array.isArray(packetUpdateCall?.[1])).toBe(true);
    expect(packetUpdateCall?.[1]?.[1]).toBe('focus_1');
  });

  it('creates plan draft artifact and returns event ids', async () => {
    qMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM decision_packets')) {
        return [{
          packet_id: 'dp_plan_1',
          symbol: 'BTCUSD',
          bias: 'bullish',
          risk_score: 55,
          entry_zone: 51200,
          invalidation: 49800,
          targets: [52200, 53600],
        }];
      }
      if (sql.includes('INSERT INTO trade_plans')) {
        return [];
      }
      return [];
    });

    const req = new Request('http://localhost/api/plans/draft-from-focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        focusId: 'focus_2',
        decisionPacketId: 'dp_plan_1',
        symbol: 'BTCUSD',
        timeframe: '4h',
        riskPct: 0.5,
        notes: 'from test',
      }),
    });

    const res = await createPlanFromFocus(req as any);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.planId).toBe('string');
    expect(body.planId.length).toBeGreaterThan(5);
    expect(Array.isArray(body.eventIds)).toBe(true);
    expect(body.eventIds.length).toBe(2);

    const plannedUpdateCall = qMock.mock.calls.find(
      (call) =>
        typeof call[0] === 'string'
        && call[0].includes('UPDATE decision_packets')
        && call[0].includes("'planned'")
    );
    expect(plannedUpdateCall).toBeTruthy();
  });
});
