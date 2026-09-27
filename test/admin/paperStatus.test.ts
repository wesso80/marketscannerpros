import { beforeEach, describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), tx: vi.fn() }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: m.auth }));
vi.mock('@/lib/db', () => ({ tx: m.tx }));
import { POST } from '@/app/api/admin/portfolio-lab/status/route';
const req = (status = 'ACTIVE') => new NextRequest('https://marketscannerpros.app/api/admin/portfolio-lab/status', { method: 'POST', headers: { origin: 'https://marketscannerpros.app', 'content-type': 'application/json' }, body: JSON.stringify({ portfolioId: 'paper', status }) });
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ ok: true, workspaceId: 'owner' }); m.tx.mockImplementation(fn => fn({ query: m.query })); });
describe('paper status', () => {
  it('resumes only the scoped simulated account and records review in the transaction', async () => {
    m.query.mockResolvedValueOnce({ rows: [{ id: 'paper', status: 'PAUSED' }] }).mockResolvedValue({ rows: [] });
    expect((await POST(req())).status).toBe(200);
    expect(m.query.mock.calls[0][0]).toContain("mode='SIMULATED'");
    expect(m.query.mock.calls[0][1]).toEqual(['paper', 'owner', 'ARCA Internal Fund']);
    expect(m.query.mock.calls[1][1]).toEqual(['ACTIVE', 'paper', 'owner']);
    expect(m.query.mock.calls[2][0]).toContain('arca_trade_journal');
  });
  it('does not revive an archived or other workspace account', async () => { m.query.mockResolvedValue({ rows: [] }); expect((await POST(req())).status).toBe(409); expect(m.query).toHaveBeenCalledTimes(1); });
  it('is idempotent', async () => { m.query.mockResolvedValue({ rows: [{ id: 'paper', status: 'ACTIVE' }] }); expect((await POST(req())).status).toBe(200); expect(m.query).toHaveBeenCalledTimes(1); });
  it('rejects unauthenticated and invalid state requests', async () => { expect((await POST(req('ARCHIVED'))).status).toBe(400); m.auth.mockResolvedValue({ ok: false }); expect((await POST(req())).status).toBe(403); expect(m.tx).not.toHaveBeenCalled(); });
});
