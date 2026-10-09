import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const scan = vi.hoisted(() => ({ value: null as any }));

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'ws-1', cid: 'admin_a@example.com' })) }));
vi.mock('@/lib/quant/operatorAuth', () => ({ isOperator: vi.fn(() => true) }));
vi.mock('@/lib/admin/getAdminResearchPacket', () => ({ buildAdminResearchScan: vi.fn(async () => scan.value) }));

import { GET } from '@/app/api/admin/symbol/[symbol]/route';
import { symbolObservationAsOf } from '@/lib/admin/symbolObservation';

const NOW = Date.parse('2026-10-08T15:00:00Z'); // Thursday, US session open

function packetWithBars(bars: Array<{ timestamp: string }>) {
  return {
    packet: {
      packetId: 'BTC:CRYPTO:15m:1',
      createdAt: new Date(NOW).toISOString(), // built "now", every request
      snapshot: { bars },
      dataTruth: { thresholds: { liveSec: 900, staleSec: 3600 } },
      alertEligibility: { eligible: false, reasons: [] },
      internalResearchScore: {}, setup: {},
    },
    bars,
  };
}

async function call(symbol = 'BTCUSD', qs = '?market=CRYPTO&timeframe=15m') {
  const res = await GET(new NextRequest(`https://marketscannerpros.app/api/admin/symbol/${symbol}${qs}`), { params: Promise.resolve({ symbol }) });
  return res.json();
}

describe('Symbol truth stamp uses observation time, not packet build time', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('a freshly built packet over day-old bars is stale, with build time reported separately', async () => {
    scan.value = packetWithBars([{ timestamp: '2026-10-07T14:30:00Z' }, { timestamp: '2026-10-07T14:45:00Z' }]);
    const body = await call();

    expect(body.adminTruth.dataAsOf).toBe('2026-10-07T15:00:00.000Z'); // close of the newest 15m bar
    expect(body.adminTruth.freshness).toBe('stale');
    expect(body.adminTruth.confidence).toBe('low');
    expect(body.adminTruth.data.packetBuiltAt).toBe(new Date(NOW).toISOString());
    expect(body.adminTruth.dataAsOf).not.toBe(body.adminTruth.data.packetBuiltAt);
  });

  it('recent bars inside the stale window read as delayed', async () => {
    scan.value = packetWithBars([{ timestamp: '2026-10-08T14:30:00Z' }]);
    const body = await call();

    expect(body.adminTruth.dataAsOf).toBe('2026-10-08T14:45:00.000Z');
    expect(body.adminTruth.freshness).toBe('delayed');
  });

  it('no bars means unknown freshness and a missing observation time', async () => {
    scan.value = packetWithBars([]);
    const body = await call();

    expect(body.adminTruth.dataAsOf).toBeNull();
    expect(body.adminTruth.freshness).toBe('unknown');
    expect(body.adminTruth.missingFields).toContain('observation time');
  });
});

describe('symbolObservationAsOf', () => {
  it('returns null for missing or unreadable timestamps', () => {
    expect(symbolObservationAsOf(null, '15m', 'CRYPTO', NOW)).toBeNull();
    expect(symbolObservationAsOf([{ timestamp: 'not a date' }], '15m', 'CRYPTO', NOW)).toBeNull();
  });
});
