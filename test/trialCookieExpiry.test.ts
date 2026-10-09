import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.APP_SIGNING_SECRET = 'trial-cookie-test-secret';
  process.env.CRON_SECRET = 'trial-cookie-cron-secret';
  process.env.ADMIN_EMAILS = '';
  process.env.STRIPE_SECRET_KEY = 'sk_test_trial_cookie';
});

const mocks = vi.hoisted(() => ({
  q: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: () => mocks.cookies(),
}));

vi.mock('@/lib/db', () => ({
  q: (...args: unknown[]) => mocks.q(...args),
}));

vi.mock('@/lib/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/entitlements')>();
  return { ...actual, isFreeForAllMode: () => false };
});

import { getSessionFromCookie, signSessionToken, verifySessionToken } from '@/lib/auth';
import { middleware } from '../middleware';

const WORKSPACE_ID = 'ws-trial-user';
const secret = process.env.APP_SIGNING_SECRET!;

function futureExp(days: number) {
  return Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
}

function withSession(payload: Record<string, unknown>) {
  const token = signSessionToken({ exp: futureExp(20), ...payload });
  mocks.cookies.mockResolvedValue({
    get: (name: string) => (name === 'ms_auth' ? { name, value: token } : undefined),
  });
}

describe('getSessionFromCookie trial period', () => {
  beforeEach(() => {
    mocks.q.mockReset();
    mocks.cookies.mockReset();
  });

  it('downgrades a trial_ cookie when the period end is in the past', async () => {
    withSession({ cid: 'trial_ada@example.com', tier: 'pro', workspaceId: WORKSPACE_ID });
    mocks.q.mockResolvedValue([{ tier: 'pro', status: 'trialing', current_period_end: new Date(Date.now() - 60_000).toISOString() }]);

    const session = await getSessionFromCookie();
    expect(session?.tier).toBe('free');
    expect(String(mocks.q.mock.calls[0][0])).toContain('WHERE workspace_id = $1');
    expect(String(mocks.q.mock.calls[0][0])).toContain('LOWER(email)');
    expect(mocks.q.mock.calls[0][1]).toEqual([WORKSPACE_ID, 'ada@example.com']);
  });

  it('keeps Pro when the trial period end is still in the future', async () => {
    withSession({ cid: 'trial_ada@example.com', tier: 'pro', workspaceId: WORKSPACE_ID });
    mocks.q.mockResolvedValue([{ tier: 'pro', status: 'trialing', current_period_end: new Date(Date.now() + 86_400_000) }]);

    await expect(getSessionFromCookie()).resolves.toMatchObject({ tier: 'pro' });
  });

  it('downgrades a trial_ cookie when current_period_end is NULL', async () => {
    withSession({ cid: 'trial_ada@example.com', tier: 'pro_trader', workspaceId: WORKSPACE_ID });
    mocks.q.mockResolvedValue([{ tier: 'pro_trader', status: 'trialing', current_period_end: null }]);

    await expect(getSessionFromCookie()).resolves.toMatchObject({ tier: 'free' });
  });

  it('keeps the cookie tier when the trial read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    withSession({ cid: 'trial_ada@example.com', tier: 'pro', workspaceId: WORKSPACE_ID });
    mocks.q.mockRejectedValue(new Error('db down'));

    await expect(getSessionFromCookie()).resolves.toMatchObject({ tier: 'pro' });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('does not query for a cus_ cookie', async () => {
    withSession({ cid: 'cus_123', tier: 'pro', workspaceId: WORKSPACE_ID });

    await expect(getSessionFromCookie()).resolves.toMatchObject({ tier: 'pro', cid: 'cus_123' });
    expect(mocks.q).not.toHaveBeenCalled();
  });

  it('orders rows like chooseAccessSubscription and keeps the live Stripe duplicate', async () => {
    withSession({ cid: 'trial_ada@example.com', tier: 'pro', workspaceId: WORKSPACE_ID });
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    mocks.q.mockResolvedValue([
      {
        workspace_id: WORKSPACE_ID,
        tier: 'pro',
        status: 'trialing',
        current_period_end: past,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        updated_at: '2026-10-09T00:00:00.000Z',
        id: 2,
      },
      {
        workspace_id: 'other-workspace',
        tier: 'pro',
        status: 'active',
        current_period_end: future,
        stripe_customer_id: 'cus_Live',
        stripe_subscription_id: 'sub_Live',
        updated_at: '2026-01-01T00:00:00.000Z',
        id: 1,
      },
    ]);

    await expect(getSessionFromCookie()).resolves.toMatchObject({ tier: 'pro' });
    expect(String(mocks.q.mock.calls[0][0])).toContain(
      'ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC',
    );
  });

  it('uses the newer open trial when no row matches this workspace', async () => {
    withSession({ cid: 'trial_ada@example.com', tier: 'pro', workspaceId: WORKSPACE_ID });
    mocks.q.mockResolvedValue([
      {
        workspace_id: 'older-other',
        tier: 'pro',
        status: 'trialing',
        current_period_end: new Date(Date.now() - 86_400_000).toISOString(),
        updated_at: '2026-01-01T00:00:00.000Z',
        created_at: '2026-01-01T00:00:00.000Z',
        id: 1,
      },
      {
        workspace_id: 'newer-other',
        tier: 'pro',
        status: 'trialing',
        current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
        updated_at: '2026-10-01T00:00:00.000Z',
        created_at: '2026-10-01T00:00:00.000Z',
        id: 2,
      },
    ]);

    await expect(getSessionFromCookie()).resolves.toMatchObject({ tier: 'pro' });
  });

  it('keeps a manual grant and an active Stripe row whose period end is past', async () => {
    const staleEnd = new Date(Date.now() - 10 * 86_400_000).toISOString();
    withSession({ cid: 'trial_ada@example.com', tier: 'pro_trader', workspaceId: WORKSPACE_ID });
    mocks.q.mockResolvedValue([{
      workspace_id: WORKSPACE_ID,
      tier: 'pro_trader',
      status: 'active',
      current_period_end: staleEnd,
      stripe_customer_id: null,
      stripe_subscription_id: null,
    }]);
    await expect(getSessionFromCookie()).resolves.toMatchObject({ tier: 'pro_trader' });

    withSession({ cid: 'trial_ada@example.com', tier: 'pro', workspaceId: WORKSPACE_ID });
    mocks.q.mockResolvedValue([{
      workspace_id: WORKSPACE_ID,
      tier: 'pro',
      status: 'active',
      current_period_end: staleEnd,
      stripe_customer_id: 'cus_Live',
      stripe_subscription_id: 'sub_Live',
    }]);
    await expect(getSessionFromCookie()).resolves.toMatchObject({ tier: 'pro' });
  });

  it('reads the trial row on every call', async () => {
    withSession({ cid: 'trial_ada@example.com', tier: 'pro', workspaceId: WORKSPACE_ID });
    mocks.q.mockResolvedValue([{ tier: 'pro', status: 'trialing', current_period_end: new Date(Date.now() + 86_400_000) }]);

    await getSessionFromCookie();
    await getSessionFromCookie();
    expect(mocks.q).toHaveBeenCalledTimes(2);
  });
});

function base64url(input: string) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function signMiddlewareSession(payload: Record<string, unknown>) {
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(body).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${body}.${signature}`;
}

describe('middleware trial refresh', () => {
  beforeEach(() => {
    mocks.q.mockReset();
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      const { GET } = await import('@/app/api/internal/verify-tier/route');
      return GET(new NextRequest(String(input), { headers: init?.headers }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not reissue Pro when a trial_ cookie is inside the refresh window and the trial has ended', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      urls.push(String(input));
      const { GET } = await import('@/app/api/internal/verify-tier/route');
      return GET(new NextRequest(String(input), { headers: init?.headers }));
    });
    mocks.q.mockResolvedValue([{
      tier: 'pro',
      status: 'trialing',
      current_period_end: new Date(Date.now() - 86_400_000),
    }]);
    const token = signMiddlewareSession({
      cid: 'trial_ada@example.com',
      tier: 'pro',
      workspaceId: WORKSPACE_ID,
      exp: futureExp(3),
    });

    const response = await middleware(new NextRequest('http://localhost/scanner', {
      headers: { cookie: `ms_auth=${token}`, host: 'localhost:3000' },
    }));

    expect(urls[0]).toContain('/api/internal/verify-tier');
    expect(urls[0]).not.toContain('ada@example.com');
    const issued = (response.headers.get('set-cookie') || '').match(/ms_auth=([^;]+)/)?.[1];
    expect(issued).toBeTruthy();
    expect(verifySessionToken(issued!)).toMatchObject({ tier: 'free', cid: 'trial_ada@example.com' });
  });
});
