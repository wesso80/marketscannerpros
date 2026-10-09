import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const h = vi.hoisted(() => ({ cookies: {} as Record<string, string>, effect: vi.fn(), read: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key: string) => h.cookies[key] ? { value: h.cookies[key] } : undefined }) }));
vi.mock('@/lib/quant/operatorAuth', () => ({ isOperator: (cid: string) => cid === 'admin_fixture' }));
vi.mock('@/lib/admin/cryptoAutomation', () => ({ setCryptoAutomation: h.effect, cryptoAutomationState: h.read }));
vi.mock('@/lib/admin/cryptoPaper', () => ({ cryptoPaperState: h.read, setCryptoPaperActive: h.effect, runCryptoPaperCycle: h.effect, cryptoPaperTradeLog: h.read }));
vi.mock('@/lib/admin/cryptoPaperBase', () => ({ cryptoBaseSleeveState: h.read, ensureBaseSleeve: h.effect, runCryptoBaseSleeveCycle: h.effect }));
vi.mock('@/lib/db', () => ({ q: h.effect }));
vi.mock('stripe', () => ({ default: class { customers = { createBalanceTransaction: h.effect }; } }));
vi.mock('@/lib/admin', () => ({ wrapTruth: vi.fn() }));
vi.mock('@/lib/admin/researchEventTape', () => ({ appendResearchEvent: h.effect, listResearchEvents: h.read }));
vi.mock('@/lib/admin/researchScheduler', () => ({ listSchedulerRuns: h.read, runResearchScheduler: h.effect }));
vi.mock('@/lib/admin/sharedScanStore', () => ({ loadRunStatus: h.read }));
import { createAdminSessionToken, requireAdmin, verifyAdminAuth, verifyCronAuth } from '@/lib/adminAuth';
import { signSessionToken } from '@/lib/auth';
import { POST as paper } from '@/app/api/admin/crypto-markets/paper/route';
import { DELETE as logout } from '@/app/api/admin/verify/route';
const url = 'http://localhost:10000/api/admin/crypto-markets/paper';
function request(method = 'POST', origin: string | null = 'https://marketscannerpros.app', target = url, headers: Record<string, string> = {}) {
  return new NextRequest(target, { method, headers: { ...(origin === null ? {} : { origin }), ...headers }, ...(method === 'GET' ? {} : { body: JSON.stringify({ action: 'auto_enable' }) }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_SIGNING_SECRET = 'origin-test-signing-secret';
  process.env.ADMIN_SECRET = 'origin-test-admin-secret';
  process.env.CRON_SECRET = 'origin-test-cron-secret';
  h.cookies = { ms_admin: createAdminSessionToken('fixture') };
  h.read.mockResolvedValue({});
});
describe.each(['ms_admin', 'ms_auth'])('%s authenticated mutations', (cookie) => {
  beforeEach(() => {
    if (cookie === 'ms_auth') h.cookies = { ms_auth: signSessionToken({ cid: 'admin_fixture', tier: 'admin', workspaceId: 'fixture-workspace', exp: Math.floor(Date.now() / 1000) + 600 }) };
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s requires a trusted origin', async (method) => {
    for (const origin of ['https://foreign.example', 'https://marketscannerpros.app.evil.example', 'http://marketscannerpros.app', 'null', null]) {
      expect(await requireAdmin(request(method, origin))).toEqual({ ok: false });
    }
    expect((await requireAdmin(request(method))).ok).toBe(true);
    expect((await requireAdmin(request(method, 'http://localhost:10000'))).ok).toBe(true);
  });
  it('blocks the real paper route before automation, account reads or journal/cycle effects', async () => {
    for (const origin of ['https://foreign.example', null]) expect((await paper(request('POST', origin))).status).toBe(403);
    expect(h.effect).not.toHaveBeenCalled(); expect(h.read).not.toHaveBeenCalled();
    expect((await paper(request())).status).toBe(200);
    expect(h.effect).toHaveBeenCalledWith(true);
  });
  it('does not alter GET or public/operator route authentication', async () => {
    expect((await requireAdmin(request('GET', null))).ok).toBe(true);
    expect((await requireAdmin(request('POST', 'https://foreign.example', 'https://marketscannerpros.app/api/ai/copilot'))).ok).toBe(true);
  });
});
it('genuine header-only clients retain missing-origin compatibility, but not foreign-origin bypass', async () => {
  h.cookies = {};
  for (const headers of [{ 'x-admin-secret': 'origin-test-admin-secret' }, { authorization: 'Bearer origin-test-admin-secret' }]) {
    expect(await requireAdmin(request('POST', null, url, headers))).toMatchObject({ ok: true, source: 'admin_secret' });
    expect(await requireAdmin(request('POST', 'https://foreign.example', url, headers))).toEqual({ ok: false });
    expect(verifyAdminAuth(request('POST', 'https://foreign.example', url, headers))).toBe(false);
  }
  expect(await requireAdmin(request('POST', null, url, { 'x-admin-secret': 'wrong' }))).toEqual({ ok: false });
});
it('a header does not bypass the origin rule on an authenticated cookie identity', async () => {
  expect(await requireAdmin(request('POST', null, url, { 'x-admin-secret': 'origin-test-admin-secret' }))).toEqual({ ok: false });
});
it('preserves genuine cron authorization outside admin routes', () => {
  expect(verifyCronAuth(request('POST', null, 'https://marketscannerpros.app/api/jobs/fixture', { 'x-cron-secret': 'origin-test-cron-secret' }))).toBe(true);
});
it('logout denies foreign/missing origins without clearing cookies and permits trusted origin', async () => {
  for (const origin of ['https://foreign.example', null]) {
    const response = await logout(request('DELETE', origin, 'https://marketscannerpros.app/api/admin/verify'));
    expect(response.status).toBe(403); expect(response.headers.get('set-cookie')).toBeNull();
  }
  const response = await logout(request('DELETE', 'https://marketscannerpros.app', 'https://marketscannerpros.app/api/admin/verify'));
  expect(response.status).toBe(200); expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
});
it('every explicit admin write handler remains behind the shared gate, except guarded/retired session handlers', () => {
  function walk(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name === 'route.ts' ? [join(dir, entry.name)] : []); }
  let methods = 0;
  for (const file of walk('app/api/admin')) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/export async function (POST|PUT|PATCH|DELETE)\([^]*?(?=export (?:async )?function |$)/g)) {
      methods++;
      if (file.replaceAll('\\', '/').endsWith('/verify/route.ts')) continue;
      if (match[0].includes('await authorize(req)')) {
        const wrapper = source.slice(source.indexOf('async function authorize'), source.indexOf('export async function'));
        expect(wrapper, file).toContain('requireAdmin(req)');
        if (wrapper.includes('getSessionFromCookie')) expect(wrapper, file).toContain('validAdminWriteOrigin(req, "cookie")');
      } else expect(match[0], file).toMatch(/(?:requireAdmin|verifyAdminRequest)\(/);
      expect(match[0], file).toMatch(/!(?:\w+|\(await requireAdmin\(req\)\))\.ok/);
    }
  }
  expect(methods).toBeGreaterThanOrEqual(89);
  expect(readFileSync('app/api/admin/claude/growth/route.ts', 'utf8')).toContain('growth/generate/route');
});

it.each(['contest', 'research-events', 'research-scheduler'])('%s cannot re-authorize a cookie through its fallback after origin rejection', async (name) => {
  h.cookies = { ms_auth: signSessionToken({ cid: 'admin_fixture', tier: 'admin', workspaceId: 'fixture-workspace', exp: Math.floor(Date.now() / 1000) + 600 }) };
  const routes = {
    contest: () => import('@/app/api/admin/contest/route'),
    'research-events': () => import('@/app/api/admin/research-events/route'),
    'research-scheduler': () => import('@/app/api/admin/research-scheduler/route'),
  };
  const route = await routes[name as keyof typeof routes]();
  for (const origin of ['https://foreign.example', null]) expect((await route.POST(request('POST', origin, 'http://localhost:10000/api/admin/' + name))).status).toBe(403);
  expect(h.effect).not.toHaveBeenCalled(); expect(h.read).not.toHaveBeenCalled();
});
