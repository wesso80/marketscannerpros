import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createAdminSessionToken,
  getAdminSessionCookieOptions,
  verifyAdminAuth,
  verifyAdminRequest,
} from '../lib/adminAuth';

const cookiesMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

vi.mock('../lib/quant/operatorAuth', () => ({
  // Only the test admin identity is on the admin list.
  isOperator: vi.fn((cid: string) => cid === 'admin_founder@example.com'),
}));

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

function cookieStore(values: Record<string, string> = {}) {
  return {
    get: vi.fn((name: string) => values[name] ? { name, value: values[name] } : undefined),
  };
}

function request(path = '/api/admin/verify', init: RequestInit = {}) {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost',
      ...(init.headers || {}),
    },
  });
}

describe('/api/admin/verify', () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    errorSpy.mockClear();
    cookiesMock.mockResolvedValue(cookieStore());
    process.env.APP_SIGNING_SECRET = 'admin-verify-test-signing-secret';
    process.env.ADMIN_SECRET = 'correct-admin-secret';
  });

  it('rejects invalid admin secrets', () => {
    expect(verifyAdminAuth(request('/api/admin/verify', {
      headers: { 'x-admin-secret': 'wrong-admin-secret' },
    }))).toBe(false);
  });

  it('accepts valid admin secrets and creates tight admin session cookie options', () => {
    const token = createAdminSessionToken();
    const cookieOptions = getAdminSessionCookieOptions(request('/api/admin/verify'));

    expect(verifyAdminAuth(request('/api/admin/verify', {
      headers: { 'x-admin-secret': 'correct-admin-secret' },
    }))).toBe(true);
    expect(token).toContain('.');
    expect(cookieOptions).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('does not accept absent or invalid admin session cookies as admin auth', async () => {
    cookiesMock.mockResolvedValue(cookieStore({ ms_admin: 'not.a.valid.session' }));
    await expect(verifyAdminRequest(request())).resolves.toEqual({ ok: false });

    cookiesMock.mockResolvedValue(cookieStore());
    await expect(verifyAdminRequest(request())).resolves.toEqual({ ok: false });
  });

  it('legacy secret login is retired: POST returns 410 and mints no admin cookie', async () => {
    const { POST } = await import('../app/api/admin/verify/route');
    const res = await POST();
    expect(res.status).toBe(410);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('GET refuses a valid admin secret header without a session, and mints no cookie', async () => {
    const { GET } = await import('../app/api/admin/verify/route');
    for (const headers of [{ 'x-admin-secret': 'correct-admin-secret' }, { authorization: 'Bearer correct-admin-secret' }]) {
      const res = await GET(request('/api/admin/verify', { headers }) as any);
      expect(res.status).toBe(401);
      expect(res.headers.get('set-cookie')).toBeNull();
    }
  });

  it('GET accepts a valid admin session cookie', async () => {
    cookiesMock.mockResolvedValue(cookieStore({ ms_admin: createAdminSessionToken('admin_founder@example.com') }));
    const { GET } = await import('../app/api/admin/verify/route');
    const res = await GET(request() as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, source: 'admin_session' });
  });

  it('DELETE (admin logout) clears both the admin cookie and the admin app session', async () => {
    const { DELETE } = await import('../app/api/admin/verify/route');
    const res = await DELETE(request('/api/admin/verify', { method: 'DELETE' }) as any);
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const all = cookies.join('\n');
    expect(all).toContain('ms_admin=;');
    expect(all).toContain('ms_auth=;');
  });

  it('an ms_admin cookie for an identity no longer on the admin list is refused', async () => {
    cookiesMock.mockResolvedValue(cookieStore({ ms_admin: createAdminSessionToken('admin_removed@example.com') }));
    await expect(verifyAdminRequest(request())).resolves.toEqual({ ok: false });
    cookiesMock.mockResolvedValue(cookieStore({ ms_admin: createAdminSessionToken() })); // retired secret-login cookie
    await expect(verifyAdminRequest(request())).resolves.toEqual({ ok: false });
  });

  it('the admin layout has no secret form and points signed-out admins at /admin/login', () => {
    const layout = readFileSync(join(process.cwd(), 'app/admin/admin-client-layout.tsx'), 'utf8');
    expect(layout).not.toContain('Enter admin secret');
    expect(layout).not.toContain('Authorization: `Bearer ${key}`');
    expect(layout).toContain('href="/admin/login"');
  });

});