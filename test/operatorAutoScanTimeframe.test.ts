import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  cron: vi.fn(() => false),
  admin: vi.fn(async () => ({ ok: true })),
  start: vi.fn(),
  detach: vi.fn(),
  read: vi.fn(async () => ({ available: true, rows: [], running: null, lastRun: null, newestScannedAt: null, oldestScannedAt: null, ageSec: null, ageLabel: null })),
}));
vi.mock('@/lib/adminAuth', () => ({ verifyCronAuth: m.cron, requireAdmin: m.admin }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => null) }));
vi.mock('@/lib/quant/operatorAuth', () => ({ isOperator: vi.fn(() => false) }));
vi.mock('@/lib/admin/sharedScanStore', () => ({ loadRecentRadarChanges: vi.fn(async () => []) }));
vi.mock('@/lib/admin/sharedScan', () => ({
  startSharedScan: m.start,
  detachRun: m.detach,
  readSavedScan: m.read,
  savedScanStaleAfterSec: () => 3600,
}));

import { POST } from '@/app/api/operator/engine/auto-scan/route';

const req = (body: unknown) => new Request('http://x/api/operator/engine/auto-scan', { method: 'POST', body: JSON.stringify(body) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.cron.mockReturnValue(false);
  delete process.env.ADMIN_DISCOVERY_ONLY;
  delete process.env.ADMIN_EQUITIES_PAUSED;
  m.start.mockResolvedValue({ started: true, runId: 'r1', symbolsRequested: 10, done: Promise.resolve() });
});

describe('auto-scan POST: only 15m runs from the page loop', () => {
  it('a page POST for 15m starts a shared scan with trigger "page"', async () => {
    const res = await POST(req({ watchlist: 'us-mega-cap', timeframe: '15m' }));
    expect(res.status).toBe(200);
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ timeframe: '15m', trigger: 'page' }));
    expect((await res.json()).data.scanResult.started).toBe(true);
  });

  it.each(['1H', '1D', '4h', '5m'])('a page POST for %s returns saved state and starts nothing', async (tf) => {
    const res = await POST(req({ watchlist: 'us-mega-cap', timeframe: tf }));
    expect(res.status).toBe(200);
    expect(m.start).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.data.scanResult).toMatchObject({ started: false, skipped: 'timeframe_not_allowed' });
    expect(body.data.timeframe).toBe(tf);
  });

  it('cron POSTs may still start any timeframe (trigger "radar")', async () => {
    m.cron.mockReturnValue(true);
    await POST(req({ watchlist: 'us-mega-cap', timeframe: '1H' }));
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ timeframe: '1H', trigger: 'radar' }));
  });

  it('equity watchlists pass discovery-only and start the shared scan', async () => {
    const res = await POST(req({ watchlist: 'us-defensive-cashflow', timeframe: '15m' }));
    expect(res.status).toBe(200);
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ market: 'EQUITIES', trigger: 'page' }));
  });

  it('a crypto watchlist stays a discovery-only no-op', async () => {
    const res = await POST(req({ watchlist: 'crypto-majors', timeframe: '15m' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: true, reason: 'admin_discovery_only', started: false });
    expect(m.start).not.toHaveBeenCalled();
  });

  it('ADMIN_EQUITIES_PAUSED still skips an equity watchlist', async () => {
    process.env.ADMIN_EQUITIES_PAUSED = 'true';
    const res = await POST(req({ watchlist: 'us-mega-cap', timeframe: '15m' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: true, reason: 'admin_equities_paused', started: false });
    expect(m.start).not.toHaveBeenCalled();
  });
});
