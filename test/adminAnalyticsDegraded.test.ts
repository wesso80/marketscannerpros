import { beforeEach, describe, expect, it, vi } from 'vitest';
import { q } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { GET as getAdminStats } from '../app/api/admin/stats/route';
import { GET as getUsageAnalytics } from '../app/api/admin/usage-analytics/route';

vi.mock('@/lib/db', () => ({
  q: vi.fn(),
}));

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: vi.fn(),
}));

const qMock = vi.mocked(q);
const requireAdminMock = vi.mocked(requireAdmin);
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

function adminRequest(path: string) {
  return new Request(`http://localhost${path}`);
}

describe('admin analytics degraded metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy.mockClear();
    requireAdminMock.mockResolvedValue({ ok: true } as any);
  });

  it('reports failed admin stats queries instead of silently returning zeros', async () => {
    qMock.mockRejectedValue(new Error('stats table missing'));

    const response = await getAdminStats(adminRequest('/api/admin/stats') as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.meta.degraded).toBe(true);
    expect(payload.meta.failedQueries).toContain('total_workspaces');
    expect(payload.meta.failedQueries).toContain('stripe_paid_subscriptions');
    // Admin audit A5: the warning names the failed query and a log reference, never the raw exception text.
    expect(payload.meta.warnings.some((warning: string) => /unavailable: Request failed \(ref [0-9a-f]{8}\)/.test(warning))).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('stats table missing');
    expect(payload.overview.totalWorkspaces).toBe(0);
    expect(payload.overview.financials.monthlyCosts).toBeCloseTo(1365.08, 2);
    expect(payload.overview.financials.yearlyCosts).toBeCloseTo(1365.08 * 12, 2);
  });

  it('reports failed usage analytics queries instead of silently returning empty analytics', async () => {
    qMock.mockRejectedValue(new Error('usage table missing'));

    const response = await getUsageAnalytics(adminRequest('/api/admin/usage-analytics') as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.meta.degraded).toBe(true);
    expect(payload.meta.failedQueries).toContain('active_users');
    expect(payload.meta.failedQueries).toContain('feature_adoption_journal');
    expect(payload.meta.failedQueries).toContain('top_active_workspaces');
    // Admin audit A5: the warning names the failed query and a log reference, never the raw exception text.
    expect(payload.meta.warnings.some((warning: string) => /unavailable: Request failed \(ref [0-9a-f]{8}\)/.test(warning))).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('usage table missing');
    expect(payload.activeUsers).toEqual({ dau: 0, wau: 0, mau: 0, online_now: 0 });
  });
});
