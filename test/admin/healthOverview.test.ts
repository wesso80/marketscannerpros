import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ auth: vi.fn(), q: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: m.auth }));
vi.mock('@/lib/db', () => ({ q: m.q }));
vi.mock('@/lib/redis', () => ({ getRedis: () => ({ get: m.get }) }));
import { GET } from '../../app/api/admin/health/route';
import { recordedJob, readHealthOperations } from '../../lib/admin/healthOverview';
const request = () => new NextRequest('http://localhost/api/admin/health');
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ ok: true, workspaceId: 'workspace-one' });
  m.q.mockResolvedValue([]);
  m.get.mockResolvedValue(null);
});
describe('admin Health read-only overview', () => {
  it('denies before reading anything and disables caching on denials', async () => {
    m.auth.mockResolvedValue({ ok: false });
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(m.q).not.toHaveBeenCalled(); expect(m.get).not.toHaveBeenCalled();
  });
  it('fails closed when authentication throws', async () => {
    m.auth.mockRejectedValue(new Error('secret'));
    expect((await GET(request())).status).toBe(403);
    expect(m.q).not.toHaveBeenCalled();
  });
  it('uses only SELECTs and scopes paper accounts to the verified workspace', async () => {
    const response = await GET(request());
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    for (const [sql] of m.q.mock.calls) expect(sql.trim()).toMatch(/^SELECT /);
    const paper = m.q.mock.calls.find(([sql]) => sql.includes('arca_portfolios'));
    expect(paper?.[0]).toContain('workspace_id = $1');
    expect(paper?.[1]).toEqual(['workspace-one']);
    expect((await response.json()).operations.paper.reconciliation).toMatch(/Not checked/);
  });
  it('does not request unscoped paper data when no workspace is bound', async () => {
    await readHealthOperations();
    expect(m.q).not.toHaveBeenCalled();
  });
  it('keeps unavailable data distinct from empty and never exposes exception details', async () => {
    m.q.mockRejectedValue(new Error('postgres://secret:password@host'));
    m.get.mockRejectedValue(new Error('redis-secret'));
    const body = await (await GET(request())).json();
    expect(body.operations.paper.state).toBe('unavailable');
    expect(body.operations.jobs[0].telemetry).toBe('unavailable');
    expect(JSON.stringify(body)).not.toMatch(/password|redis-secret/);
  });
  it('displays a skipped successful HTTP response as skipped, not executed', () => {
    expect(recordedJob({ startedAt: '2026-10-09T00:00:00Z', ok: true, skipped: true }, Date.parse('2026-10-09T01:00:00Z'))).toMatchObject({ outcome: 'skipped', ageMinutes: 60 });
  });
  it('keeps missing, malformed and future timestamps unknown', () => {
    for (const startedAt of [undefined, 'bad', '2099-01-01']) expect(recordedJob({ startedAt, ok: true }).outcome).toBe('unknown');
    expect(recordedJob(null).ageMinutes).toBeNull();
  });
  it('projects a failed job without returning its raw errors or payload', () => {
    const result = recordedJob({ startedAt: '2026-10-09T00:00:00Z', ok: false, ms: 0, error: 'secret' });
    expect(result.outcome).toBe('failed'); expect(result.durationMs).toBe(0);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
