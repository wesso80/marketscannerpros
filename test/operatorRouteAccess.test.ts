/**
 * Operator-only API routes outside the /api/admin middleware gate: a signed-in session that is neither admin nor
 * operator gets 403 with private headers before any database read, write or action. Signed-out gets 401. An admin
 * session passes the gate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ session: null as any, q: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => h.session) }));
vi.mock('@/lib/db', () => ({ q: h.q }));
vi.mock('@/lib/quant/operatorAuth', () => ({ isOperator: (cid: string) => cid === 'operator-cid' }));

import { operatorAccessDenied } from '@/lib/operator/privateAccess';

const ROUTES: Array<[string, string, () => Promise<(req: NextRequest) => Promise<Response>>]> = [
  ['/api/operator/attention', 'POST', async () => (await import('@/app/api/operator/attention/route')).POST],
  ['/api/operator/focus/pin', 'POST', async () => (await import('@/app/api/operator/focus/pin/route')).POST],
  ['/api/operator/focus/snooze', 'POST', async () => (await import('@/app/api/operator/focus/snooze/route')).POST],
  ['/api/operator/risk-governor', 'GET', async () => (await import('@/app/api/operator/risk-governor/route')).GET],
  ['/api/operator/proposals', 'GET', async () => (await import('@/app/api/operator/proposals/route')).GET],
  ['/api/actions/execute', 'POST', async () => (await import('@/app/api/actions/execute/route')).POST],
];

const req = (path: string, method: string) => new NextRequest(`https://msp.test${path}`, {
  method, ...(method === 'POST' ? { body: '{}', headers: { 'content-type': 'application/json' } } : {}),
});

beforeEach(() => { h.q.mockReset(); h.q.mockResolvedValue([]); });

describe('operator-only routes refuse non-operators before any work', () => {
  it.each(ROUTES)('%s refuses a signed-in Pro user with 403 and runs no SQL', async (path, method, load) => {
    h.session = { workspaceId: 'ws-pro', cid: 'cus_pro', tier: 'pro' };
    const res = await (await load())(req(path, method));
    expect(res.status).toBe(403);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.json()).toEqual({ error: 'Operator access required' });
    expect(h.q).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('%s refuses a signed-out caller with 401 and runs no SQL', async (path, method, load) => {
    h.session = null;
    const res = await (await load())(req(path, method));
    expect(res.status).toBe(401);
    expect(h.q).not.toHaveBeenCalled();
  });
});

describe('operatorAccessDenied', () => {
  it('lets admin and operator sessions through', () => {
    expect(operatorAccessDenied({ workspaceId: 'ws', cid: 'x', is_admin: true })).toBeNull();
    expect(operatorAccessDenied({ workspaceId: 'ws', cid: 'operator-cid' })).toBeNull();
  });
  it('refuses free, pro and cid-less sessions', () => {
    expect(operatorAccessDenied({ workspaceId: 'ws', cid: 'cus_free' })?.status).toBe(403);
    expect(operatorAccessDenied({ workspaceId: 'ws', cid: null })?.status).toBe(403);
    expect(operatorAccessDenied(null)?.status).toBe(401);
  });
});
