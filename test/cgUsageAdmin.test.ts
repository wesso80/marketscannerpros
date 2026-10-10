import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const admin = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const credits = vi.hoisted(() => ({ cgBudgetStatus: vi.fn() }));

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: admin.requireAdmin }));
vi.mock('@/lib/admin/cgCredits', () => ({ cgBudgetStatus: credits.cgBudgetStatus }));
vi.mock('@/lib/coingecko', () => ({ getApiUsage: vi.fn() }));

import { GET } from '@/app/api/admin/cg-usage/route';

const readout = {
  plan: 'Analyst',
  quota: 500_000,
  used: 1_000,
  remaining: 499_000,
  targetPct: 80,
  targetCredits: 400_000,
  todayCap: 12_903,
  callsToday: 10,
  refusedToday: 1,
  capMode: 'paced',
  source: 'coingecko /key',
  checkedAt: '2026-10-31T12:00:00.000Z',
  globalReserved: 12,
  fallbackByRole: { web: 2, worker: 0, jarvis: 0 },
  timeouts: 3,
  callsByCaller: { 'arca-cycle:history': { 'market_chart/range': 40 } },
};

beforeEach(() => {
  admin.requireAdmin.mockReset();
  credits.cgBudgetStatus.mockReset();
});

describe('GET /api/admin/cg-usage', () => {
  it('is admin-only', async () => {
    admin.requireAdmin.mockResolvedValue({ ok: false });
    const denied = await GET(new NextRequest('http://localhost/api/admin/cg-usage'));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: 'Unauthorized' });
    expect(credits.cgBudgetStatus).not.toHaveBeenCalled();

    admin.requireAdmin.mockResolvedValue({ ok: true, workspaceId: 'ws' });
    credits.cgBudgetStatus.mockResolvedValue(readout);
    const allowed = await GET(new NextRequest('http://localhost/api/admin/cg-usage'));
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({
      todayCap: 12_903,
      globalReserved: 12,
      fallbackByRole: { web: 2, worker: 0, jarvis: 0 },
      timeouts: 3,
      callsByCaller: { 'arca-cycle:history': { 'market_chart/range': 40 } },
    });
  });
});
