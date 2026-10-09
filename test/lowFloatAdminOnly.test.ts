/**
 * /api/scanner/low-float returns the private opportunity / evidence-quality scores, so it is admin only. A Pro or
 * Free session gets 403 with private headers before any database read; signed out gets 401; an admin reaches the
 * handler.
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ session: null as any, admin: false, q: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => h.session) }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => ({ ok: h.admin })) }));
vi.mock('@/lib/db', () => ({ q: h.q }));

import { GET } from '@/app/api/scanner/low-float/route';
const req = () => new NextRequest('https://msp.test/api/scanner/low-float', { headers: { 'x-forwarded-for': '10.9.9.9' } });

beforeEach(() => { h.q.mockReset(); h.q.mockResolvedValue([]); h.admin = false; });

it.each([['pro', { workspaceId: 'ws-p', cid: 'cus_p', tier: 'pro' }], ['free', { workspaceId: 'ws-f', cid: 'cus_f', tier: 'free' }]])(
  'a %s session gets 403 with private headers and no database read', async (_t, session) => {
    h.session = session;
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.json()).toEqual({ error: 'Admin access required' });
    expect(h.q).not.toHaveBeenCalled();
  });

it('signed out gets 401 with no database read', async () => {
  h.session = null;
  const res = await GET(req());
  expect(res.status).toBe(401);
  expect(h.q).not.toHaveBeenCalled();
});

it('an admin reaches the handler', async () => {
  h.session = { workspaceId: 'ws-a', cid: 'admin_founder@example.com', tier: 'pro_trader' };
  h.admin = true;
  const res = await GET(req());
  expect(res.status).toBe(200);
  expect(h.q).toHaveBeenCalled();
});
