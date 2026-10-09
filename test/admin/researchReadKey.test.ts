/**
 * Read-only research key for agents: GET/HEAD on allowlisted admin read paths only, acting as the configured admin's
 * /admin/login workspace. Never writes, never other paths, revoked by removing the email or the key.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { RESEARCH_READ_PATHS, parseResearchKeys, researchReadGrant, researchReadRequestAllowed } from '@/lib/admin/researchReadKey';

const cookiesMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({ cookies: cookiesMock }));
vi.mock('@/lib/entitlements', () => ({ isFreeForAllMode: () => false }));

const ADMIN = 'founder@example.com';
const CLAUDE_KEY = 'c'.repeat(40);
const CODEX_KEY = 'x'.repeat(40);
const KEYS = `claude:${CLAUDE_KEY},codex:${CODEX_KEY}`;
const ws = (s: string) => { const h = createHash('sha256').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
const emptyCookies = { get: () => undefined };

const grant = (over: Partial<Parameters<typeof researchReadGrant>[0]> = {}) => researchReadGrant({
  pathname: '/api/admin/signals/stats', method: 'GET', headerValue: CLAUDE_KEY,
  keysRaw: KEYS, email: ADMIN, adminEmails: [ADMIN], ...over,
});

beforeEach(() => {
  process.env.APP_SIGNING_SECRET = 'research-key-test-secret';
  process.env.ADMIN_EMAILS = ADMIN;
  process.env.ADMIN_RESEARCH_READ_KEYS = KEYS;
  process.env.ADMIN_RESEARCH_READ_EMAIL = ADMIN;
  process.env.ADMIN_DISCOVERY_ONLY = 'false';
  cookiesMock.mockReset();
  cookiesMock.mockResolvedValue(emptyCookies);
});

describe('research key rules', () => {
  it('allows only GET/HEAD on listed read paths and single-symbol pages', () => {
    expect(researchReadRequestAllowed('/api/admin/portfolio-lab/positions', 'GET')).toBe(true);
    expect(researchReadRequestAllowed('/api/admin/health/', 'HEAD')).toBe(true);
    expect(researchReadRequestAllowed('/api/admin/symbol/AAPL', 'GET')).toBe(true);
    expect(researchReadRequestAllowed('/api/admin/portfolio-lab/positions', 'POST')).toBe(false);
    expect(researchReadRequestAllowed('/api/admin/kill-switch', 'GET')).toBe(false);
    expect(researchReadRequestAllowed('/api/admin/verify', 'GET')).toBe(false);
    expect(researchReadRequestAllowed('/api/admin/opportunities', 'GET')).toBe(false); // persists on GET
    expect(researchReadRequestAllowed('/api/admin/symbol/AAPL/extra', 'GET')).toBe(false);
    expect(researchReadRequestAllowed('/api/scanner/low-float', 'GET')).toBe(false);
  });

  it('refuses refresh / force parameters that re-run work', () => {
    expect(researchReadRequestAllowed('/api/admin/scanner-data-audit', 'GET', new URLSearchParams('refresh=1'))).toBe(false);
    expect(researchReadRequestAllowed('/api/admin/scanner-data-audit', 'GET', new URLSearchParams('force=true'))).toBe(false);
    expect(researchReadRequestAllowed('/api/admin/scanner-data-audit', 'GET', new URLSearchParams('limit=5'))).toBe(true);
  });

  it('every allowlisted path is an admin API route whose handler re-checks access with requireAdmin', () => {
    for (const p of [...RESEARCH_READ_PATHS, '/api/admin/symbol/[symbol]']) {
      expect(p.startsWith('/api/admin/')).toBe(true);
      const src = readFileSync(`app${p}/route.ts`, 'utf8');
      expect(src, p).toMatch(/requireAdmin\(/);
    }
  });

  it('parses labelled keys and drops short or malformed entries', () => {
    expect(parseResearchKeys(`${KEYS},short:abc,nolabel${CLAUDE_KEY},:${CLAUDE_KEY}`).map((e) => e.label)).toEqual(['claude', 'codex']);
    expect(parseResearchKeys(undefined)).toEqual([]);
  });

  it('grants per key label as the configured admin', () => {
    expect(grant()).toEqual({ label: 'claude', email: ADMIN, cid: `admin_${ADMIN}` });
    expect(grant({ headerValue: CODEX_KEY })?.label).toBe('codex');
  });

  it('refuses wrong, missing or prefix keys, unset keys, and an email no longer on ADMIN_EMAILS', () => {
    expect(grant({ headerValue: 'z'.repeat(40) })).toBeNull();
    expect(grant({ headerValue: CLAUDE_KEY.slice(0, 39) })).toBeNull();
    expect(grant({ headerValue: null })).toBeNull();
    expect(grant({ keysRaw: undefined })).toBeNull();
    expect(grant({ email: undefined })).toBeNull();
    expect(grant({ adminEmails: ['someone@example.com'] })).toBeNull();
    expect(grant({ method: 'POST' })).toBeNull();
  });
});

describe('verifyAdminRequest with the research key', () => {
  const req = (path: string, method = 'GET', key: string | null = CLAUDE_KEY) =>
    new Request(`https://marketscannerpros.app${path}`, { method, headers: key ? { 'x-admin-research-key': key } : {} });
  const load = async () => { vi.resetModules(); return import('@/lib/adminAuth'); };

  it('admits an allowlisted GET as the admin login workspace', async () => {
    const { verifyAdminRequest } = await load();
    expect(await verifyAdminRequest(req('/api/admin/portfolio-lab/summary'))).toEqual({
      ok: true, source: 'research_key', cid: `admin_${ADMIN}`, workspaceId: ws(`admin_${ADMIN}`),
    });
  });

  it('refuses writes, unlisted paths, wrong keys and a revoked email', async () => {
    let { verifyAdminRequest } = await load();
    expect((await verifyAdminRequest(req('/api/admin/portfolio-lab/summary', 'POST'))).ok).toBe(false);
    expect((await verifyAdminRequest(req('/api/admin/kill-switch'))).ok).toBe(false);
    expect((await verifyAdminRequest(req('/api/admin/signals', 'GET', 'z'.repeat(40)))).ok).toBe(false);
    expect((await verifyAdminRequest(req('/api/admin/signals', 'GET', null))).ok).toBe(false);
    process.env.ADMIN_EMAILS = 'someone-else@example.com';
    ({ verifyAdminRequest } = await load());
    expect((await verifyAdminRequest(req('/api/admin/signals'))).ok).toBe(false);
  });
});

describe('middleware with the research key', () => {
  const load = async () => { vi.resetModules(); return (await import('../../middleware')).middleware; };
  const mreq = (path: string, method = 'GET', key: string | null = CLAUDE_KEY) =>
    new NextRequest(`https://marketscannerpros.app${path}`, { method, headers: key ? { 'x-admin-research-key': key } : {} });

  it('lets an allowlisted GET through to the handler and logs the key label', async () => {
    const middleware = await load();
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const res = await middleware(mreq('/api/admin/signals/stats'));
    expect(res.status).not.toBe(401);
    expect(log).toHaveBeenCalledWith('[admin-research-read] key=claude GET /api/admin/signals/stats');
    log.mockRestore();
  });

  it('still returns 401 for writes, unlisted paths, refresh and missing keys', async () => {
    const middleware = await load();
    expect((await middleware(mreq('/api/admin/portfolio-lab/summary', 'POST'))).status).toBe(401);
    expect((await middleware(mreq('/api/admin/kill-switch'))).status).toBe(401);
    expect((await middleware(mreq('/api/admin/scanner-data-audit?refresh=1'))).status).toBe(401);
    expect((await middleware(mreq('/api/admin/signals', 'GET', null))).status).toBe(401);
  });

  it('does not open admin pages', async () => {
    const middleware = await load();
    const res = await middleware(mreq('/admin/portfolio-lab'));
    expect(res.status === 307 || res.status === 401 || Boolean(res.headers.get('location'))).toBe(true);
  });
});
