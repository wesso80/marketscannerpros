/**
 * Expired trials are Free. Active paid rows, including manual grants with a
 * NULL current_period_end, stay on their paid tier.
 *
 * The rule lives in effectiveTierFromSubscription. Every gate that reads a
 * user_subscriptions row calls it: getEffectiveTier, getVerifiedTier, /api/me,
 * and /api/internal/verify-tier (the middleware cookie refresh). Client hooks
 * read /api/me and do not re-derive the tier.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import type { SubscriptionAccessRow } from '../lib/entitlements';

const qMock = vi.hoisted(() => vi.fn());
const sessionMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({ q: qMock }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: sessionMock }));

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const NOW = Date.parse('2026-10-06T00:00:00.000Z');
const FUTURE = '2026-12-01T00:00:00.000Z';
const PAST = '2026-03-26T00:00:00.000Z';
const originalEnv = { ...process.env };

function resetEnv() {
  vi.resetModules();
  process.env = { ...originalEnv };
  delete process.env.FREE_FOR_ALL_MODE;
  delete process.env.FREE_FOR_ALL_UNTIL;
  delete process.env.ALLOW_PROD_ACCESS_BYPASS;
  delete process.env.ADMIN_EMAILS;
  delete process.env.PRO_TRADER_BYPASS_UNTIL;
  delete process.env.TEMP_PRO_TRADER_BYPASS_UNTIL;
  process.env.CRON_SECRET = 'cron-test-secret';
}

async function loadEntitlements() {
  return import('../lib/entitlements');
}

beforeEach(() => {
  resetEnv();
  qMock.mockReset();
  sessionMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe('effectiveTierFromSubscription', () => {
  async function tier(row: SubscriptionAccessRow) {
    const { effectiveTierFromSubscription } = await loadEntitlements();
    return effectiveTierFromSubscription(row, NOW);
  }

  it('keeps a trial that has not ended as Pro', async () => {
    expect(await tier({ tier: 'pro', status: 'trialing', current_period_end: FUTURE })).toBe('pro');
    expect(await tier({ tier: 'pro_trader', status: 'trialing', current_period_end: new Date(FUTURE) })).toBe('pro_trader');
  });

  it('treats the period-end instant itself as still Pro', async () => {
    expect(await tier({ tier: 'pro', status: 'trialing', current_period_end: NOW })).toBe('pro');
  });

  it('treats a trial whose period end is in the past as Free', async () => {
    expect(await tier({ tier: 'pro', status: 'trialing', current_period_end: PAST })).toBe('free');
    expect(await tier({ tier: 'pro_trader', status: 'trialing', current_period_end: new Date(PAST) })).toBe('free');
  });

  it('treats a trialing row with a NULL or unreadable period end as Free', async () => {
    // A trial is a time box. Login always writes current_period_end. A blank
    // end cannot be shown to still be open, so it is Free rather than Pro forever.
    expect(await tier({ tier: 'pro_trader', status: 'trialing', current_period_end: null })).toBe('free');
    expect(await tier({ tier: 'pro', status: 'trialing' })).toBe('free');
    expect(await tier({ tier: 'pro', status: 'trialing', current_period_end: 'not-a-date' })).toBe('free');
  });

  it('leaves an active paid subscription alone, even with a past or NULL period end', async () => {
    expect(await tier({ tier: 'pro', status: 'active', current_period_end: PAST })).toBe('pro');
    expect(await tier({ tier: 'pro', status: 'active', current_period_end: FUTURE })).toBe('pro');
    expect(await tier({ tier: 'pro', status: 'active', current_period_end: null })).toBe('pro');
    // Manual grants: pro_trader + active + NULL current_period_end stay Pro.
    expect(await tier({ tier: 'pro_trader', status: 'active', current_period_end: null })).toBe('pro_trader');
    expect(await tier({ tier: 'pro_trader', status: 'active', current_period_end: PAST })).toBe('pro_trader');
  });

  it('still downgrades cancelled, past_due and unpaid rows', async () => {
    for (const status of ['canceled', 'cancelled', 'past_due', 'unpaid', 'incomplete']) {
      expect(await tier({ tier: 'pro_trader', status, current_period_end: FUTURE })).toBe('free');
    }
  });
});

describe('getEffectiveTier uses the shared trial rule on every lookup', () => {
  const expired = {
    email: 'trial@example.com',
    tier: 'pro_trader',
    status: 'trialing',
    current_period_end: PAST,
  };
  const openTrial = { ...expired, current_period_end: FUTURE };
  const manualGrant = {
    email: 'grant@example.com',
    tier: 'pro_trader',
    status: 'active',
    current_period_end: null,
  };

  it('does not let an expired trial fall back to a Pro cookie', async () => {
    const { getEffectiveTier } = await loadEntitlements();
    const dbQuery = vi.fn(async (sql: string) => (sql.includes('workspace_id') ? [expired] : []));
    await expect(getEffectiveTier('ws-expired', 'pro_trader', 'trial_trial@example.com', dbQuery)).resolves.toBe('free');
    expect(String(dbQuery.mock.calls[0][0])).toContain('current_period_end');
  });

  it('returns Pro for an open trial and for a manual active grant', async () => {
    const { getEffectiveTier } = await loadEntitlements();
    const open = vi.fn(async () => [openTrial]);
    const grant = vi.fn(async () => [manualGrant]);
    await expect(getEffectiveTier('ws-open', 'free', 'trial_trial@example.com', open)).resolves.toBe('pro_trader');
    await expect(getEffectiveTier('ws-grant', 'free', 'cus_grant', grant)).resolves.toBe('pro_trader');
  });

  it('applies the rule on the stripe customer and email fallbacks', async () => {
    const { getEffectiveTier } = await loadEntitlements();
    const byCustomer = vi.fn(async (sql: string) => (sql.includes('stripe_customer_id') ? [expired] : []));
    await expect(getEffectiveTier('ws-miss', 'pro', 'cus_expired', byCustomer)).resolves.toBe('free');

    const byEmail = vi.fn(async (sql: string) => (sql.includes('LOWER(email)') ? [openTrial] : []));
    await expect(getEffectiveTier('ws-miss-2', 'free', 'trial_trial@example.com', byEmail)).resolves.toBe('pro_trader');
  });
});

describe('getVerifiedTier', () => {
  function session(workspaceId: string, tier = 'pro_trader') {
    return { cid: 'trial_trial@example.com', tier, workspaceId, exp: NOW / 1000 + 3600 };
  }

  it('returns Free for an expired trial and Pro for an open trial or a manual grant', async () => {
    qMock.mockImplementation(async () => [{ tier: 'pro_trader', status: 'trialing', current_period_end: PAST }]);
    const { getVerifiedTier } = await import('../lib/apiMiddleware');
    await expect(getVerifiedTier(session('ws-verified-expired'))).resolves.toBe('free');

    qMock.mockImplementation(async () => [{ tier: 'pro', status: 'trialing', current_period_end: FUTURE }]);
    await expect(getVerifiedTier(session('ws-verified-open', 'free'))).resolves.toBe('pro');

    qMock.mockImplementation(async () => [{ tier: 'pro_trader', status: 'active', current_period_end: null }]);
    await expect(getVerifiedTier(session('ws-verified-grant', 'free'))).resolves.toBe('pro_trader');

    const sql = String(qMock.mock.calls[0][0]);
    expect(sql).toContain('current_period_end');
  });
});

describe('GET /api/me', () => {
  it('reports Free for an expired trial and Pro for a manual grant', async () => {
    sessionMock.mockResolvedValue({
      cid: 'trial_trial@example.com',
      tier: 'pro_trader',
      workspaceId: 'ws-me',
      exp: NOW / 1000 + 3600,
    });
    qMock.mockResolvedValue([{ email: 'trial@example.com', tier: 'pro_trader', status: 'trialing', current_period_end: PAST }]);
    const { GET } = await import('../app/api/me/route');
    const expired = await GET();
    expect(await expired.json()).toMatchObject({ authenticated: true, tier: 'free', has_billing: false, is_manual_grant: false, trial_ends_at: '2026-03-26' });

    qMock.mockResolvedValue([{ email: 'grant@example.com', tier: 'pro_trader', status: 'active', current_period_end: null }]);
    sessionMock.mockResolvedValue({
      cid: 'free_grant@example.com',
      tier: 'free',
      workspaceId: 'ws-me-grant',
      exp: NOW / 1000 + 3600,
    });
    const granted = await GET();
    expect(await granted.json()).toMatchObject({ authenticated: true, tier: 'pro_trader', has_billing: false, is_manual_grant: true, trial_ends_at: null });
  });

  it('reports Pro for a trial that has not ended', async () => {
    sessionMock.mockResolvedValue({
      cid: 'trial_trial@example.com',
      tier: 'free',
      workspaceId: 'ws-me-open',
      exp: NOW / 1000 + 3600,
    });
    qMock.mockResolvedValue([{ email: 'trial@example.com', tier: 'pro', status: 'trialing', current_period_end: FUTURE }]);
    const { GET } = await import('../app/api/me/route');
    const res = await GET();
    expect(await res.json()).toMatchObject({ tier: 'pro', has_billing: false, is_manual_grant: false, trial_ends_at: '2026-12-01' });
  });

  it('counts a real manual grant and excludes no-card trials', async () => {
    const { GET } = await import('../app/api/me/route');
    const session = (cid: string, workspaceId: string) => ({
      cid,
      tier: 'free',
      workspaceId,
      exp: NOW / 1000 + 3600,
    });

    sessionMock.mockResolvedValue(session('free_open@example.com', 'ws-open-trial'));
    qMock.mockResolvedValue([{
      email: 'open@example.com',
      tier: 'pro',
      status: 'trialing',
      current_period_end: FUTURE,
      stripe_customer_id: null,
      stripe_subscription_id: null,
    }]);
    expect(await (await GET()).json()).toMatchObject({ tier: 'pro', has_billing: false, is_manual_grant: false });

    sessionMock.mockResolvedValue(session('free_marked@example.com', 'ws-trial-sub'));
    qMock.mockResolvedValue([{
      email: 'marked@example.com',
      tier: 'pro_trader',
      status: 'active',
      current_period_end: null,
      stripe_customer_id: null,
      stripe_subscription_id: 'trial_local',
    }]);
    expect(await (await GET()).json()).toMatchObject({ tier: 'pro_trader', has_billing: false, is_manual_grant: false });

    sessionMock.mockResolvedValue(session('trial_person@example.com', 'ws-trial-session'));
    qMock.mockResolvedValue([{
      email: 'person@example.com',
      tier: 'pro',
      status: 'active',
      current_period_end: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
    }]);
    expect(await (await GET()).json()).toMatchObject({ tier: 'pro', has_billing: false, is_manual_grant: false });

    sessionMock.mockResolvedValue(session('free_grant@example.com', 'ws-real-grant'));
    qMock.mockResolvedValue([{
      email: 'grant@example.com',
      tier: 'pro_trader',
      status: 'active',
      current_period_end: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
    }]);
    expect(await (await GET()).json()).toMatchObject({ tier: 'pro_trader', has_billing: false, is_manual_grant: true });
  });
});

describe('GET /api/internal/verify-tier (middleware cookie refresh)', () => {
  function request(wid: string) {
    return new NextRequest(`http://localhost/api/internal/verify-tier?wid=${wid}`, {
      headers: { 'x-cron-secret': 'cron-test-secret' },
    });
  }

  it('returns Free for an expired trial and keeps a manual grant Pro', async () => {
    qMock.mockResolvedValue([{ tier: 'pro_trader', status: 'trialing', current_period_end: PAST }]);
    const { GET } = await import('../app/api/internal/verify-tier/route');
    const expired = await GET(request('ws-refresh-expired'));
    expect(await expired.json()).toEqual({ tier: 'free', status: 'trialing' });

    qMock.mockResolvedValue([{ tier: 'pro_trader', status: 'active', current_period_end: null }]);
    const granted = await GET(request('ws-refresh-grant'));
    expect(await granted.json()).toEqual({ tier: 'pro_trader', status: 'active' });
  });

  it('returns Pro for a trial that has not ended', async () => {
    qMock.mockResolvedValue([{ tier: 'pro', status: 'trialing', current_period_end: FUTURE }]);
    const { GET } = await import('../app/api/internal/verify-tier/route');
    const res = await GET(request('ws-refresh-open'));
    expect(await res.json()).toEqual({ tier: 'pro', status: 'trialing' });
  });
});

describe('every subscription gate uses the same helper', () => {
  it('server readers call effectiveTierFromSubscription and select current_period_end', () => {
    for (const path of [
      'lib/entitlements.ts',
      'lib/apiMiddleware.ts',
      'app/api/me/route.ts',
      'app/api/internal/verify-tier/route.ts',
    ]) {
      const content = read(path);
      expect(content, path).toContain('effectiveTierFromSubscription');
      expect(content, path).toContain('current_period_end');
    }
  });

  it('middleware refreshes the cookie tier through verify-tier', () => {
    expect(read('middleware.ts')).toContain('/api/internal/verify-tier');
  });

  it('client tier hooks read /api/me and do not re-derive the period end', () => {
    const provider = read('lib/UserTierProvider.tsx');
    const hook = read('lib/useUserTier.ts');
    expect(provider).toContain('fetch("/api/me"');
    expect(provider).not.toContain('current_period_end');
    expect(hook).not.toContain('current_period_end');
    expect(hook).not.toContain("status === 'trialing'");
  });
});
