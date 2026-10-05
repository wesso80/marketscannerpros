import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ session: vi.fn(), q: vi.fn(), overlay: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: mocks.session }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/scoring/canonical/regimeOverlayData', () => ({ loadRegimeOverlayInputs: mocks.overlay }));
import { GET } from '@/app/api/regime/route';

describe('GET /api/regime missing relations', () => {
  beforeEach(() => {
    mocks.session.mockResolvedValue({ workspaceId: 'ws1' });
    mocks.q.mockResolvedValue([]);
    mocks.overlay.mockResolvedValue({ asOf: null, vix: null, spy: null, qqq: null });
  });

  it('reads operator_state and does not query a risk governor snapshot table', async () => {
    await GET(new NextRequest('http://localhost/api/regime'));
    const sql = mocks.q.mock.calls.map((call) => String(call[0]).replace(/\s+/g, ' '));
    expect(sql).toEqual([expect.stringContaining('FROM operator_state')]);
    expect(sql.some((text) => text.includes('FROM context_state'))).toBe(false);
  });
});
