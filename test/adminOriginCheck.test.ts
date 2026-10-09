/**
 * Admin/operator mutations must come from this site (Codex admin mutation audit, origin checks). Cross-site browser
 * POST/PUT/PATCH/DELETE to /api/admin, /api/operator and /api/actions/execute get 403 before any auth or handler
 * work; same-site browsers, server-to-server callers (no Origin / Sec-Fetch headers), reads and public routes are
 * unaffected.
 */
import { createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/entitlements', () => ({ isFreeForAllMode: () => false }));

const SECRET = 'origin-test-secret';
const b64 = (s: string) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const sign = (p: Record<string, unknown>) => { const body = b64(JSON.stringify(p)); return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`; };
const adminCookie = () => `ms_auth=${sign({ cid: 'admin_founder@example.com', tier: 'pro_trader', workspaceId: 'w1', exp: Math.floor(Date.now() / 1000) + 3600 })}`;

async function mw() { vi.resetModules(); return (await import('../middleware')).middleware; }
const req = (url: string, method: string, headers: Record<string, string> = {}) =>
  new NextRequest(url, { method, headers: { host: new URL(url).host, cookie: adminCookie(), ...headers } });
const refused = async (res: Response) => res.status === 403 && (await res.clone().json().catch(() => ({}))).error === 'Cross-site request refused';

beforeEach(() => {
  process.env.APP_SIGNING_SECRET = SECRET;
  process.env.ADMIN_EMAILS = 'founder@example.com';
  process.env.ADMIN_DISCOVERY_ONLY = 'false';
});

describe('cross-site browser mutations are refused', () => {
  it.each([
    ['POST', '/api/admin/kill-switch'], ['DELETE', '/api/admin/verify'], ['PUT', '/api/admin/universe'], ['PATCH', '/api/admin/delete-requests'],
    ['POST', '/api/operator/attention'], ['POST', '/api/operator/engine/auto-scan'], ['POST', '/api/actions/execute'],
  ])('%s %s with a foreign Origin', async (method, path) => {
    const res = await (await mw())(req(`https://marketscannerpros.app${path}`, method, { origin: 'https://evil.example' }));
    expect(await refused(res)).toBe(true);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('a "null" Origin (sandboxed frame / data URL) is refused', async () => {
    expect(await refused(await (await mw())(req('https://marketscannerpros.app/api/admin/kill-switch', 'POST', { origin: 'null' })))).toBe(true);
  });

  it('no Origin but Sec-Fetch-Site: cross-site is refused', async () => {
    expect(await refused(await (await mw())(req('https://marketscannerpros.app/api/admin/kill-switch', 'POST', { 'sec-fetch-site': 'cross-site' })))).toBe(true);
  });

  it('an arbitrary subdomain of the site is refused (no wildcard trust)', async () => {
    expect(await refused(await (await mw())(req('https://marketscannerpros.app/api/admin/kill-switch', 'POST', { origin: 'https://staging.marketscannerpros.app' })))).toBe(true);
  });

  it('a spoofed x-forwarded-host does not widen trust', async () => {
    expect(await refused(await (await mw())(req('https://marketscannerpros.app/api/admin/kill-switch', 'POST', { origin: 'https://evil.example', 'x-forwarded-host': 'evil.example' })))).toBe(true);
  });

  it('a look-alike domain is refused', async () => {
    expect(await refused(await (await mw())(req('https://marketscannerpros.app/api/admin/kill-switch', 'POST', { origin: 'https://marketscannerpros.app.evil.example' })))).toBe(true);
    expect(await refused(await (await mw())(req('https://marketscannerpros.app/api/admin/kill-switch', 'POST', { origin: 'https://evilmarketscannerpros.app' })))).toBe(true);
  });
});

describe('legitimate callers are unaffected', () => {
  it.each([
    ['same host', 'https://marketscannerpros.app', {}],
    ['www subdomain', 'https://www.marketscannerpros.app', {}],
    ['localhost dev', 'http://localhost:3000', {}],
  ])('same-site browser (%s) passes the origin check', async (_n, origin) => {
    const host = new URL(origin).host;
    const res = await (await mw())(req(`${host.startsWith('localhost') ? 'http' : 'https'}://${host === 'www.marketscannerpros.app' ? 'marketscannerpros.app' : host}/api/admin/kill-switch`, 'POST', { origin, 'sec-fetch-site': 'same-origin' }));
    expect(await refused(res)).toBe(false);
  });

  it('a host-matching Render preview origin passes', async () => {
    const res = await (await mw())(req('https://msp-preview.onrender.com/api/admin/kill-switch', 'POST', { origin: 'https://msp-preview.onrender.com' }));
    expect(await refused(res)).toBe(false);
  });

  it('server-to-server POST with no Origin or Sec-Fetch headers (worker auto-scan) passes the origin check', async () => {
    const res = await (await mw())(new NextRequest('https://marketscannerpros.app/api/operator/engine/auto-scan', { method: 'POST', headers: { host: 'marketscannerpros.app', 'x-cron-secret': 'x' } }));
    expect(await refused(res)).toBe(false);
  });

  it('reads (GET) are not origin-checked', async () => {
    const res = await (await mw())(req('https://marketscannerpros.app/api/admin/health', 'GET', { origin: 'https://evil.example' }));
    expect(await refused(res)).toBe(false);
  });

  it.each([['/api/journal/add-trade'], ['/api/alerts'], ['/api/operator-like/thing'], ['/api/actions/other']])('public route %s is not origin-checked here', async (path) => {
    const res = await (await mw())(req(`https://marketscannerpros.app${path}`, 'POST', { origin: 'https://evil.example' }));
    expect(await refused(res)).toBe(false);
  });
});
