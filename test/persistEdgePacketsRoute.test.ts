import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ read: vi.fn(), start: vi.fn(), q: vi.fn(), project: vi.fn(), filter: vi.fn(), persist: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: m.q }));
vi.mock('@/lib/admin/sharedScan', () => ({ readSavedScan: m.read, startSharedScan: m.start, detachRun: vi.fn(), isRankable: () => true, withFreshQuote: (p: unknown) => p }));
vi.mock('@/lib/admin/sharedScanLogic', () => ({ sharedScanUniverse: () => ['BTC'] }));
vi.mock('@/lib/admin/getAdminResearchPacket', () => ({ whatChangedForWorkspace: vi.fn() }));
vi.mock('@/lib/admin/edgePacket', () => ({ projectEdgePacket: m.project }));
vi.mock('@/lib/admin/researchPacketHistory', () => ({ loadPriorPacketSnapshots: vi.fn(async () => new Map()), packetHistoryKey: () => 'BTC' }));
vi.mock('@/lib/admin/edgePacketSnapshots', () => ({ filterNewEdgePackets: m.filter, persistEdgePackets: m.persist }));
vi.mock('@/lib/admin/notifyAdmin', () => ({ notifyAdmin: vi.fn(async () => undefined) }));
import { POST } from '@/app/api/cron/persist-edge-packets/route';
const req = () => new NextRequest('http://localhost/api/cron/persist-edge-packets', { method: 'POST', headers: { 'x-cron-secret': 'test' }, body: JSON.stringify({ market: 'CRYPTO' }) });
beforeEach(() => { vi.clearAllMocks(); process.env.CRON_SECRET = 'test'; m.read.mockResolvedValue({ available: true, packets: [], ageLabel: 'now' }); m.start.mockResolvedValue({ started: false, reason: 'already_running', message: 'running' }); m.q.mockResolvedValue([]); });
it('returns a retryable failure when the saved scan cannot be read', async () => { m.read.mockResolvedValue({ available: false, message: 'connection timeout' }); const r = await POST(req()); expect(r.status).toBe(503); expect(await r.json()).toMatchObject({ ok: false, reason: 'saved_scan_unavailable' }); expect(m.start).not.toHaveBeenCalled(); });
it('does not disguise failure to start the refresh as success', async () => { m.start.mockResolvedValue({ started: false, reason: 'error', message: 'connection timeout' }); const r = await POST(req()); expect(r.status).toBe(503); expect(await r.json()).toMatchObject({ ok: false, reason: 'scan_start_failed' }); });
it('keeps a healthy already-running scan and empty workspace a normal no-op', async () => { const r = await POST(req()); expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ ok: true, reason: 'no_active_workspaces' }); });
it('returns a retryable failure when portfolio lookup fails', async () => { m.q.mockRejectedValueOnce(new Error('database offline')); const r = await POST(req()); expect(r.status).toBe(503); expect(await r.json()).toMatchObject({ ok: false, reason: 'portfolio_lookup_failed' }); });

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
