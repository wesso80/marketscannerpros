import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), scan: vi.fn(), risk: vi.fn(), macro: vi.fn() }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: m.auth }));
vi.mock('@/lib/admin/sharedScan', () => ({ readSavedScan: m.scan, scanStatusForResponse: (v: unknown) => v }));
vi.mock('@/lib/admin/scan-context', () => ({ buildAdminScanContext: m.risk }));
vi.mock('@/lib/admin/macroOutlook', () => ({ readStoredMacroEvidence: m.macro }));
vi.mock('@/lib/admin/decisionEvidence', () => ({ enrichStoredPositionEvidence: async (p: unknown) => p }));
import { GET } from '@/app/api/admin/decision-desk/route';
import { NextRequest } from 'next/server';
beforeEach(() => {
  vi.clearAllMocks(); m.auth.mockResolvedValue({ ok: true, workspaceId: 'workspace-a' });
  m.scan.mockResolvedValue({ packets: [], available: true });
  m.macro.mockResolvedValue({ observations: [], missing: [] });
  m.risk.mockResolvedValue({ risk: { permission: 'WAIT', sizeMultiplier: 0, dailyDrawdownKnown: false } });
});
describe('read-only Decision Desk contract', () => {
  it('requires a resolved authenticated workspace before any data read', async () => {
    m.auth.mockResolvedValue({ ok: true });
    expect((await GET(new NextRequest('https://test/api/admin/decision-desk'))).status).toBe(403);
    expect(m.scan).not.toHaveBeenCalled(); expect(m.risk).not.toHaveBeenCalled();
  });
  it('rejects unsupported strategy instead of relabelling intraday evidence', async () => {
    expect((await GET(new NextRequest('https://test/api/admin/decision-desk?strategy=CORE_TREND'))).status).toBe(400);
    expect(m.scan).not.toHaveBeenCalled();
  });
  it('uses workspace risk and stored scans only; response is private and versioned', async () => {
    const response = await GET(new NextRequest('https://test/api/admin/decision-desk'));
    const result = await response.json();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(result).toMatchObject({ schemaVersion: 'decision-desk.v2', readOnly: true, counts: { total: 0 } });
    expect(m.risk).toHaveBeenCalledWith('workspace-a');
    expect(m.scan.mock.calls).toEqual([[{ market: 'EQUITIES', timeframe: '15m' }], [{ market: 'CRYPTO', timeframe: '15m' }]]);
  });
  it('returns an explicit unavailable response when account evidence cannot be read', async () => {
    m.risk.mockRejectedValue(new Error('offline'));
    expect((await GET(new NextRequest('https://test/api/admin/decision-desk'))).status).toBe(503);
  });
});
