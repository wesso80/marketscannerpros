import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ q: vi.fn(), packets: vi.fn(), event: vi.fn(), auth: vi.fn(), status: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: m.q }));
vi.mock('@/lib/admin/getAdminResearchPacket', () => ({ getAdminResearchPacketsForSymbols: m.packets }));
vi.mock('@/lib/admin/researchEventTape', () => ({ appendResearchEvent: m.event }));
vi.mock('@/lib/admin/researchPacketHistory', () => ({ snapshotResearchPacket: vi.fn(), loadPriorPacketSnapshot: vi.fn(async () => null) }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: m.auth }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => null) }));
vi.mock('@/lib/quant/operatorAuth', () => ({ isOperator: vi.fn(() => false) }));
vi.mock('@/lib/admin', () => ({ wrapTruth: vi.fn() }));
vi.mock('@/lib/admin/sharedScanStore', () => ({ loadRunStatus: m.status }));
import { runResearchScheduler } from '@/lib/admin/researchScheduler';
import { GET } from '@/app/api/admin/research-scheduler/route';
import { NextRequest } from 'next/server';
beforeEach(() => { vi.clearAllMocks(); m.q.mockResolvedValue([]); m.event.mockResolvedValue(undefined); m.auth.mockResolvedValue({ ok: true, workspaceId: 'a' }); });
describe('scheduler reporting', () => {
  it('counts eligible packets without inventing dispatches', async () => {
    m.packets.mockResolvedValue([{ symbol: 'AAPL', market: 'EQUITIES', timeframe: '15m', alertEligibility: { eligible: true, reasons: [] }, dataTruth: { status: 'LIVE' }, lifecycle: 'READY', trustAdjustedScore: 85 }]);
    const result = await runResearchScheduler({ workspaceId: 'a', mode: 'WATCHLIST', market: 'EQUITIES', timeframe: '15m', symbols: ['AAPL'] });
    expect(result.symbolsScanned).toBe(1);
    expect(result.alertsEligible).toBe(1);
    expect(result.alertsDispatched).toBe(0);
    expect(result.alertsSuppressed).toBe(0);
    const completion = m.event.mock.calls.find(([event]) => event.eventType === 'DATA_HEALTH');
    expect(completion?.[0].payload.alertsDispatched).toBe(0);
  });
  it('reads current shared run status separately from manual history without starting scans', async () => {
    m.status.mockResolvedValue({ lastRun: { status: 'done', symbolsScanned: 20 }, running: null });
    const result = await (await GET(new NextRequest('https://example.com/api/admin/research-scheduler'))).json();
    expect(result.sharedScans).toHaveLength(2);
    expect(m.status).toHaveBeenCalledWith('EQUITIES', '15m');
    expect(m.status).toHaveBeenCalledWith('CRYPTO', '15m');
    expect(m.packets).not.toHaveBeenCalled();
    expect(result.runs).toEqual([]);
  });
  it('makes failed shared status reads explicitly unavailable', async () => {
    m.status.mockRejectedValue(new Error('offline'));
    const result = await (await GET(new NextRequest('https://example.com/api/admin/research-scheduler'))).json();
    expect(result.sharedScans.every((row: { available: boolean }) => !row.available)).toBe(true);
  });
  it('does not use a global admin workspace when identity is missing', async () => {
    m.auth.mockResolvedValue({ ok: true });
    expect((await GET(new NextRequest('https://example.com/api/admin/research-scheduler'))).status).toBe(403);
    expect(m.q).not.toHaveBeenCalled();
  });
});
