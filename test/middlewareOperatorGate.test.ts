import { createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/entitlements', () => ({
  isFreeForAllMode: () => false,
}));

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function signSession(payload: Record<string, unknown>, secret: string) {
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(body).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${body}.${signature}`;
}

describe('middleware operator route gate', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.APP_SIGNING_SECRET = 'middleware-test-secret';
    process.env.ADMIN_EMAILS = 'founder@example.com';
  });

  it('redirects unauthenticated operator page requests to auth with noindex headers', async () => {
    const { middleware } = await import('../middleware');
    const response = await middleware(new NextRequest('http://localhost/operator'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/auth?next=%2Foperator');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive, nosnippet');
  });

  it('allows configured operator sessions while keeping noindex headers', async () => {
    const token = signSession({
      cid: 'admin_founder@example.com',
      tier: 'pro_trader',
      workspaceId: 'workspace-1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, process.env.APP_SIGNING_SECRET!);
    const { middleware } = await import('../middleware');

    const response = await middleware(new NextRequest('http://localhost/operator/engine', {
      headers: { cookie: `ms_auth=${token}` },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive, nosnippet');
  });
});
