import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ auth: vi.fn(), build: vi.fn(), latest: vi.fn(), rebuild: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: m.auth }));
vi.mock('@/lib/admin', () => ({ wrapTruth: vi.fn() }));
vi.mock('@/lib/admin/morning-brief', () => ({ buildMorningBrief: m.build, loadLatestMorningBrief: m.latest, requestMorningBriefRebuild: m.rebuild, saveMorningBriefSnapshot: m.save }));
import { GET, POST } from '@/app/api/admin/morning-brief/route';
const brief = { briefId: 'today', generatedAt: '2026-09-27T06:00:00Z', risk: { workspaceId: 'workspace-a' } };
beforeEach(() => { vi.resetAllMocks(); m.auth.mockResolvedValue({ ok: true, workspaceId: 'workspace-a' }); });
describe('Morning Brief authenticated workspace', () => {
  it('reads only this workspace saved brief', async () => {
    m.latest.mockResolvedValue({ brief, source: 'admin', ageSec: 0, ageLabel: 'just now', generatedAt: brief.generatedAt });
    expect((await GET(new NextRequest('https://example.test/api/admin/morning-brief'))).status).toBe(200);
    expect(m.latest).toHaveBeenCalledWith('EQUITIES', '15m', expect.any(Number), 'workspace-a');
    expect(m.build).not.toHaveBeenCalled();
  });
  it('bootstraps the authenticated account when no matching saved brief exists', async () => {
    m.latest.mockResolvedValue(null); m.build.mockResolvedValue(brief); m.save.mockResolvedValue(brief);
    const response = await GET(new NextRequest('https://example.test/api/admin/morning-brief'));
    expect(response.status).toBe(200);
    expect(m.build).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-a' }));
  });
  it('does not accept a workspace override from the request body', async () => {
    m.rebuild.mockResolvedValue({ ok: true, saved: { brief, source: 'admin', ageSec: 0, ageLabel: 'just now', generatedAt: brief.generatedAt } });
    await POST(new NextRequest('https://example.test/api/admin/morning-brief', { method: 'POST', body: JSON.stringify({ workspaceId: 'workspace-b' }) }));
    expect(m.rebuild).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-a' }));
  });
  it.each(['GET', 'POST'])('rejects %s without a resolved workspace', async method => {
    m.auth.mockResolvedValue({ ok: true });
    const response = await (method === 'GET' ? GET : POST)(new NextRequest('https://example.test/api/admin/morning-brief', { method }));
    expect(response.status).toBe(403);
    expect(m.latest).not.toHaveBeenCalled(); expect(m.rebuild).not.toHaveBeenCalled();
  });
});
