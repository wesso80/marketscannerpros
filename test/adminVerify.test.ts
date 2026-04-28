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
  isOperator: vi.fn(() => false),
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

  it('wires the route to require admin secret before minting ms_admin', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/admin/verify/route.ts'), 'utf8');

    expect(route).toContain('if (!verifyAdminAuth(req))');
    expect(route).toContain('return NextResponse.json({ error: "Unauthorized" }, { status: 401 })');
    expect(route).toContain('res.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(), getAdminSessionCookieOptions(req))');
  });
});