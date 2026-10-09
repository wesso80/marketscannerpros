/**
 * Admin authentication across layers (Codex admin audit A1): middleware admission, the route-level isOperator check
 * and the middleware token refresh must agree. A Stripe-customer (cus_*) admin keeps access after a refresh that
 * carries no is_admin claim; removing the email from ADMIN_EMAILS revokes it; non-admins stay out; header secrets do
 * not bypass the middleware; and a public session's refresh is unchanged.
 */
import { createHash, createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/entitlements', () => ({ isFreeForAllMode: () => false }));

const SECRET = 'lifecycle-test-secret';
const b64 = (s: string) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const sign = (p: Record<string, unknown>) => { const body = b64(JSON.stringify(p)); return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`; };
const decode = (token: string) => JSON.parse(Buffer.from(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
const ws = (email: string) => { const h = createHash('sha256').update(email).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
const now = () => Math.floor(Date.now() / 1000);
const cookie = (p: Record<string, unknown>) => ({ cookie: `ms_auth=${sign(p)}` });

const ADMIN = 'founder@example.com';
const cusAdmin = (extra: Record<string, unknown> = {}) => ({ cid: 'cus_ADMIN123', tier: 'pro_trader', workspaceId: ws(ADMIN), exp: now() + 3600, ...extra });
const cusUser = (extra: Record<string, unknown> = {}) => ({ cid: 'cus_USER456', tier: 'pro', workspaceId: ws('someone@example.com'), exp: now() + 3600, ...extra });

async function load() {
  vi.resetModules();
  return (await import('../middleware')).middleware;
}
const admitted = (res: Response) => res.status !== 307 && res.status !== 401 && !res.headers.get('location');

beforeEach(() => {
  process.env.APP_SIGNING_SECRET = SECRET;
  process.env.ADMIN_EMAILS = ADMIN;
  process.env.ADMIN_DISCOVERY_ONLY = 'false';
  vi.unstubAllGlobals();
});

describe('admin session lifecycle through a token refresh', () => {
  it('a cus_* admin whose refreshed token has no is_admin claim is still admitted to /admin, /operator and /api/admin', async () => {
    const middleware = await load();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ tier: 'pro_trader', status: 'active' }), { status: 200 })));
    // Near expiry on a public page: middleware refreshes the cookie.
    const refresh = await middleware(new NextRequest('http://localhost/tools/markets', { headers: cookie(cusAdmin({ is_admin: true, exp: now() + 86400 })) }));
    const refreshed = refresh.cookies.get('ms_auth')?.value;
    expect(refreshed).toBeTruthy();
    expect(decode(refreshed!).is_admin).toBeUndefined(); // the refresh payload itself is unchanged by this fix
    for (const path of ['/admin/overview', '/operator', '/api/admin/health']) {
      const res = await middleware(new NextRequest(`http://localhost${path}`, { headers: { cookie: `ms_auth=${refreshed}` } }));
      expect(admitted(res), path).toBe(true);
    }
  });

  it('removing the email from ADMIN_EMAILS revokes the same refreshed cus_* session', async () => {
    process.env.ADMIN_EMAILS = 'someone-else@example.com';
    const middleware = await load();
    const res = await middleware(new NextRequest('http://localhost/admin/overview', { headers: cookie(cusAdmin()) }));
    expect(res.status).toBe(307);
    const api = await middleware(new NextRequest('http://localhost/api/admin/health', { headers: cookie(cusAdmin()) }));
    expect(api.status).toBe(401);
  });
});

describe('middleware admission agrees with the route-level isOperator check', () => {
  const identities: Array<[string, Record<string, unknown>]> = [
    ['cus_* admin (no claim)', cusAdmin()],
    ['cus_* admin (signed claim)', cusAdmin({ is_admin: true })],
    ['passphrase admin_ cid', { cid: `admin_${ADMIN}`, tier: 'pro_trader', workspaceId: ws(`admin_${ADMIN}`), exp: now() + 3600 }],
    ['free_ cid for admin email', { cid: `free_${ADMIN}`, tier: 'free', workspaceId: ws(ADMIN), exp: now() + 3600 }],
    ['cus_* non-admin', cusUser()],
    ['free_ cid for non-admin', { cid: 'free_someone@example.com', tier: 'free', workspaceId: ws('someone@example.com'), exp: now() + 3600 }],
  ];
  it.each(identities)('%s', async (_name, session) => {
    const middleware = await load();
    const { isOperator } = await import('@/lib/quant/operatorAuth');
    const routeSays = session.is_admin === true || isOperator(String(session.cid), String(session.workspaceId));
    const res = await middleware(new NextRequest('http://localhost/admin/overview', { headers: cookie(session) }));
    expect(admitted(res)).toBe(routeSays);
  });
});

describe('refusals', () => {
  it.each(['/admin/overview', '/operator'])('a signed-in non-admin is sent to sign-in from %s', async (path) => {
    const middleware = await load();
    const res = await middleware(new NextRequest(`http://localhost${path}`, { headers: cookie(cusUser()) }));
    expect(res.status).toBe(307);
  });

  it('header secrets without a session cookie do not pass the /api/admin middleware gate', async () => {
    process.env.ADMIN_SECRET = 'header-secret';
    const middleware = await load();
    for (const headers of [{ authorization: 'Bearer header-secret' }, { 'x-admin-secret': 'header-secret' }, { 'x-cron-secret': 'header-secret' }]) {
      const res = await middleware(new NextRequest('http://localhost/api/admin/health', { headers }));
      expect(res.status).toBe(401);
    }
  });

  it('a forged token (bad signature) claiming is_admin is refused', async () => {
    const middleware = await load();
    const forged = `${b64(JSON.stringify(cusUser({ is_admin: true })))}.bad-signature`;
    const res = await middleware(new NextRequest('http://localhost/admin/overview', { headers: { cookie: `ms_auth=${forged}` } }));
    expect(res.status).toBe(307);
  });
});

describe('public sessions are unchanged', () => {
  it('a near-expiry non-admin refresh keeps exactly cid, tier, workspaceId and exp with the 30-day policy', async () => {
    const middleware = await load();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ tier: 'pro', status: 'active' }), { status: 200 })));
    const res = await middleware(new NextRequest('http://localhost/tools/markets', { headers: cookie(cusUser({ exp: now() + 86400 })) }));
    const payload = decode(res.cookies.get('ms_auth')!.value);
    expect(Object.keys(payload).sort()).toEqual(['cid', 'exp', 'tier', 'workspaceId']);
    expect(payload.cid).toBe('cus_USER456');
    expect(payload.exp - now()).toBeGreaterThan(29 * 86400);
    expect(payload.exp - now()).toBeLessThanOrEqual(30 * 86400);
  });

  it('a public page with a valid non-admin session passes through without a redirect', async () => {
    const middleware = await load();
    const res = await middleware(new NextRequest('http://localhost/tools/markets', { headers: cookie(cusUser()) }));
    expect(res.headers.get('location')).toBeNull();
    expect(res.status).toBe(200);
  });
});
