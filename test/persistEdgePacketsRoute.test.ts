import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ read: vi.fn(), start: vi.fn(), q: vi.fn(), project: vi.fn(), filter: vi.fn(), persist: vi.fn(), notify: vi.fn(async () => undefined) }));
vi.mock('@/lib/db', () => ({ q: m.q }));
vi.mock('@/lib/admin/sharedScan', () => ({ readSavedScan: m.read, startSharedScan: m.start, detachRun: vi.fn(), isRankable: () => true, withFreshQuote: (p: unknown) => p }));
vi.mock('@/lib/admin/sharedScanLogic', () => ({ sharedScanUniverse: () => ['BTC'] }));
vi.mock('@/lib/admin/getAdminResearchPacket', () => ({ whatChangedForWorkspace: vi.fn() }));
vi.mock('@/lib/admin/edgePacket', () => ({ projectEdgePacket: m.project }));
vi.mock('@/lib/admin/researchPacketHistory', () => ({ loadPriorPacketSnapshots: vi.fn(async () => new Map()), packetHistoryKey: () => 'BTC' }));
vi.mock('@/lib/admin/edgePacketSnapshots', () => ({ filterNewEdgePackets: m.filter, persistEdgePackets: m.persist }));
vi.mock('@/lib/admin/notifyAdmin', () => ({ notifyAdmin: m.notify }));
import { POST } from '@/app/api/cron/persist-edge-packets/route';
const savedDiscovery = process.env.ADMIN_DISCOVERY_ONLY;
const savedEquities = process.env.ADMIN_EQUITIES_PAUSED;
const req = (body: unknown = { market: 'CRYPTO' }) => new NextRequest('http://localhost/api/cron/persist-edge-packets', { method: 'POST', headers: { 'x-cron-secret': 'test', 'content-type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); process.env.CRON_SECRET = 'test'; process.env.ADMIN_DISCOVERY_ONLY = 'false'; delete process.env.ADMIN_EQUITIES_PAUSED; m.read.mockResolvedValue({ available: true, packets: [], ageLabel: 'now' }); m.start.mockResolvedValue({ started: false, reason: 'already_running', message: 'running' }); m.q.mockResolvedValue([]); });
afterEach(() => { if (savedDiscovery === undefined) delete process.env.ADMIN_DISCOVERY_ONLY; else process.env.ADMIN_DISCOVERY_ONLY = savedDiscovery; if (savedEquities === undefined) delete process.env.ADMIN_EQUITIES_PAUSED; else process.env.ADMIN_EQUITIES_PAUSED = savedEquities; });
it('equity persist runs under discovery-only', async () => { delete process.env.ADMIN_DISCOVERY_ONLY; const r = await POST(req({ market: 'EQUITIES', timeframe: '15m' })); expect(r.status).toBe(200); expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ market: 'EQUITIES', trigger: 'edge' })); });
it('asset=equity is the equity branch', async () => { delete process.env.ADMIN_DISCOVERY_ONLY; const r = await POST(req({ asset: 'equity' })); expect(r.status).toBe(200); expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ market: 'EQUITIES' })); });
it('crypto persist stays a discovery-only no-op', async () => { delete process.env.ADMIN_DISCOVERY_ONLY; const r = await POST(req({ market: 'CRYPTO' })); expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ skipped: true, reason: 'admin_discovery_only', started: false }); expect(m.read).not.toHaveBeenCalled(); expect(m.start).not.toHaveBeenCalled(); });
it('asset=crypto stays a discovery-only no-op', async () => { delete process.env.ADMIN_DISCOVERY_ONLY; const r = await POST(req({ asset: 'crypto' })); expect(await r.json()).toMatchObject({ skipped: true, reason: 'admin_discovery_only' }); expect(m.start).not.toHaveBeenCalled(); });
it('ADMIN_EQUITIES_PAUSED still skips the equity branch', async () => { delete process.env.ADMIN_DISCOVERY_ONLY; process.env.ADMIN_EQUITIES_PAUSED = 'true'; const r = await POST(req({ market: 'EQUITIES' })); expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ skipped: true, reason: 'admin_equities_paused', started: false }); expect(m.start).not.toHaveBeenCalled(); });
it('returns a retryable failure when the saved scan cannot be read', async () => { m.read.mockResolvedValue({ available: false, message: 'connection timeout' }); const r = await POST(req()); expect(r.status).toBe(503); expect(await r.json()).toMatchObject({ ok: false, reason: 'saved_scan_unavailable' }); expect(m.start).not.toHaveBeenCalled(); });
it('does not disguise failure to start the refresh as success', async () => { m.start.mockResolvedValue({ started: false, reason: 'error', message: 'connection timeout' }); const r = await POST(req()); expect(r.status).toBe(503); expect(await r.json()).toMatchObject({ ok: false, reason: 'scan_start_failed' }); });
it('keeps a healthy already-running scan and empty workspace a normal no-op', async () => { const r = await POST(req()); expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ ok: true, reason: 'no_active_workspaces' }); });
it('returns a retryable failure when portfolio lookup fails', async () => { m.q.mockRejectedValueOnce(new Error('database offline')); const r = await POST(req()); expect(r.status).toBe(503); expect(await r.json()).toMatchObject({ ok: false, reason: 'portfolio_lookup_failed' }); });
it('still emails the admin when a workspace persist fails with equity emails off', async () => {
  delete process.env.ADMIN_EQUITY_EMAILS_ENABLED;
  m.read.mockResolvedValue({ available: true, packets: [{ packetId: 'p' }], ageLabel: 'now' });
  m.start.mockResolvedValue({ started: false, reason: 'already_running', message: 'running' });
  m.q.mockResolvedValue([{ workspace_id: 'w' }]);
  m.project.mockReturnValue({ adminState: 'WATCH', opportunityRankScore: 1 });
  m.filter.mockImplementation((_w: unknown, packets: unknown) => packets);
  m.persist.mockRejectedValue(new Error('insert failed'));
  const r = await POST(req({ market: 'EQUITIES' }));
  expect(r.status).toBe(503);
  expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ subject: 'persist-edge-packets workspace failed', severity: 'warn' }));
});

it('publishes the completed scan instead of the snapshot read before refresh', async () => {
  m.read.mockResolvedValueOnce({ available: true, packets: [{ packetId: 'old' }], ageLabel: 'old' })
    .mockResolvedValueOnce({ available: true, packets: [{ packetId: 'new', createdAt: '2026-09-28T00:00:00Z' }], ageLabel: 'now' });
  m.start.mockResolvedValue({ started: true, runId: 'run', done: Promise.resolve({ status: 'done' }) });
  m.q.mockResolvedValue([{ workspace_id: 'w' }]);
  m.project.mockImplementation(p => ({ ...p, adminState: 'WATCH', opportunityRankScore: 50 }));
  m.filter.mockImplementation((_w, packets) => packets); m.persist.mockResolvedValue(1);
  const response = await POST(req());
  expect(response.status).toBe(200);
  expect(m.start).toHaveBeenCalledOnce(); // no extra scan or provider budget
  expect(m.read).toHaveBeenCalledTimes(2);
  expect(m.project).toHaveBeenCalledWith(expect.objectContaining({ packetId: 'new', createdAt: '2026-09-28T00:00:00Z' }));
  expect(m.persist).toHaveBeenCalledWith(expect.objectContaining({ packets: [expect.objectContaining({ packetId: 'new' })] }));
  expect(await response.json()).toMatchObject({ savedScan: { scanCompleted: true } });
});
it('does not publish stale pre-refresh results when the scan fails', async () => {
  m.start.mockResolvedValue({ started: true, runId: 'run', done: Promise.resolve({ status: 'failed', error: 'provider failed' }) });
  const response = await POST(req());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ reason: 'shared_scan_failed' });
  expect(m.project).not.toHaveBeenCalled(); expect(m.persist).not.toHaveBeenCalled();
});
it('reports failed post-scan reads instead of falling back to the previous view', async () => {
  m.read.mockResolvedValueOnce({ available: true, packets: [], ageLabel: 'old' })
    .mockResolvedValueOnce({ available: false, message: 'database unavailable' });
  m.start.mockResolvedValue({ started: true, runId: 'run', done: Promise.resolve({ status: 'done' }) });
  const response = await POST(req());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ reason: 'completed_scan_unavailable' });
  expect(m.persist).not.toHaveBeenCalled();
});
it('bounds scan waiting and leaves an overlong scan running under its existing lock', async () => {
  vi.useFakeTimers();
  try {
    m.start.mockResolvedValue({ started: true, runId: 'run', done: new Promise(() => {}) });
    const pending = POST(req());
    await vi.advanceTimersByTimeAsync(480001);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ reason: 'shared_scan_still_running' });
    expect(m.start).toHaveBeenCalledOnce(); expect(m.persist).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
