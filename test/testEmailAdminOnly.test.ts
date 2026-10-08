/**
 * /api/test-email sends a branded email to any address: admin only, checked before anything is sent. Auth and the
 * email sender are fakes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ admin: { ok: false } as any, sent: [] as any[] }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => h.admin) }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'ws-a', email: 'user@example.com' })) }));
vi.mock('@/lib/email', () => ({ sendAlertEmail: vi.fn(async (m: any) => { h.sent.push(m); return 'id-1'; }) }));
import { GET, POST } from '@/app/api/test-email/route';

beforeEach(() => { h.admin = { ok: false }; h.sent = []; });

describe('/api/test-email', () => {
  it('refuses non-admins on POST and GET without sending anything', async () => {
    const post = await POST(new NextRequest('https://msp.test/api/test-email', { method: 'POST', body: JSON.stringify({ email: 'victim@example.org' }) }));
    const get = await GET(new NextRequest('https://msp.test/api/test-email?email=victim@example.org'));
    expect(post.status).toBe(401);
    expect(get.status).toBe(401);
    expect(h.sent).toEqual([]);
  });
  it('still works for an admin', async () => {
    h.admin = { ok: true };
    const r = await POST(new NextRequest('https://msp.test/api/test-email', { method: 'POST', body: JSON.stringify({ email: 'ops@example.com' }) }));
    expect(r.status).toBe(200);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].to).toBe('ops@example.com');
    const g = await GET(new NextRequest('https://msp.test/api/test-email?email=ops2@example.com', { headers: { 'x-admin-secret': 's' } }));
    expect(g.status).toBe(200);
    expect(h.sent[1].to).toBe('ops2@example.com');
  });
});
