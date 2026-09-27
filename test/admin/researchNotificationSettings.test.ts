import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), q: vi.fn(), paused: new Map<string, boolean>() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: mocks.auth }));
import { GET, PATCH } from '@/app/api/admin/research-alerts/settings/route';

beforeEach(() => {
  vi.clearAllMocks(); mocks.paused.clear();
  mocks.auth.mockResolvedValue({ ok: true, workspaceId: 'workspace-a' });
  mocks.q.mockImplementation(async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith('INSERT')) mocks.paused.set(String(values[0]), Boolean(values[1]));
    if (sql.startsWith('SELECT')) return mocks.paused.has(String(values[0])) ? [{ paused: mocks.paused.get(String(values[0])), updated_at: 'now' }] : [];
    return [];
  });
});
const request = (body: unknown, origin = 'https://example.com') => new NextRequest('https://example.com/api/admin/research-alerts/settings', { method: 'PATCH', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('workspace notification controls', () => {
  it('persists pause/resume only for the authenticated workspace and ignores a supplied workspace', async () => {
    expect((await PATCH(request({ paused: true, workspaceId: 'workspace-b' }))).status).toBe(200);
    expect(mocks.paused.get('workspace-a')).toBe(true);
    expect(mocks.paused.has('workspace-b')).toBe(false);
    const state = await (await GET(new NextRequest('https://example.com/api/admin/research-alerts/settings'))).json();
    expect(state.paused).toBe(true);
    expect(state.channels.email.available).toBe(false);
    expect(JSON.stringify(state)).not.toContain('webhooks/');
    await PATCH(request({ paused: false }));
    expect(mocks.paused.get('workspace-a')).toBe(false);
  });
  it('rejects unauthorized requests before database access', async () => {
    mocks.auth.mockResolvedValue({ ok: false });
    expect((await PATCH(request({ paused: true }))).status).toBe(403);
    expect((await GET(new NextRequest('https://example.com/api/admin/research-alerts/settings'))).status).toBe(403);
    expect(mocks.q).not.toHaveBeenCalled();
  });
  it('rejects nonboolean settings and cross-origin writes', async () => {
    expect((await PATCH(request({ paused: 'false' }))).status).toBe(400);
    expect((await PATCH(request({ paused: true }, 'https://other.example'))).status).toBe(403);
    expect(mocks.q).not.toHaveBeenCalled();
  });
  it('returns unavailable if settings cannot be read, never a false enabled state', async () => {
    mocks.q.mockRejectedValue(new Error('offline'));
    expect((await GET(new NextRequest('https://example.com/api/admin/research-alerts/settings'))).status).toBe(503);
  });
});
