import { createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/entitlements', () => ({ isFreeForAllMode: () => false }));

const b64 = (s: string) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const sign = (p: Record<string, unknown>) => { const body = b64(JSON.stringify(p)); return `${body}.${createHmac('sha256', process.env.APP_SIGNING_SECRET!).update(body).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`; };
const adminCookie = () => `ms_auth=${sign({ cid: 'admin_founder@example.com', tier: 'pro_trader', workspaceId: 'w1', exp: Math.floor(Date.now() / 1000) + 3600 })}`;

describe('admin pause is answered only after the admin session check', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.APP_SIGNING_SECRET = 'middleware-test-secret';
    process.env.ADMIN_EMAILS = 'founder@example.com';
    delete process.env.ADMIN_DISCOVERY_ONLY; // default: discovery-only on
  });

  it.each(['/admin', '/admin/portfolio-lab', '/admin/overview'])('signed-out %s goes to sign-in, not the paused page', async (path) => {
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest(`http://localhost${path}`));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(`http://localhost/auth?next=${encodeURIComponent(path)}`);
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('signed-in admins on a paused page still see /admin/paused, with noindex', async () => {
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest('http://localhost/admin/portfolio-lab', { headers: { cookie: adminCookie() } }));
    expect(res.headers.get('x-middleware-rewrite')).toBe('http://localhost/admin/paused');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive, nosnippet');
  });

  it('signed-out admin API calls get 401 without the pause message; signed-in calls get the 503 pause', async () => {
    const { middleware } = await import('../middleware');
    const out = await middleware(new NextRequest('http://localhost/api/admin/live-scanner'));
    expect(out.status).toBe(401);
    expect(JSON.stringify(await out.json())).not.toMatch(/paused/i);
    const inn = await middleware(new NextRequest('http://localhost/api/admin/live-scanner', { headers: { cookie: adminCookie() } }));
    expect(inn.status).toBe(503);
    expect((await inn.json()).reason).toBe('admin_discovery_only');
  });

  it('cron jobs keep the early skipped answer (they authenticate with secrets, not sessions)', async () => {
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest('http://localhost/api/cron/admin-scan', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect((await res.json()).skipped).toBe(true);
  });

  it('with discovery-only off, signed-in admins reach pages normally', async () => {
    process.env.ADMIN_DISCOVERY_ONLY = 'false';
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest('http://localhost/admin/portfolio-lab', { headers: { cookie: adminCookie() } }));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.status).toBe(200);
  });
});
