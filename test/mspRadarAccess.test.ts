/**
 * MSP Radar access rule — the paid gate for /tools/msp-radar and /api/msp-radar/*.
 * Admin → allowed (via 'admin'); paid tier → allowed (via 'paid'); free → 403; no session → 401.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: null as null | { cid: string; tier: string; workspaceId: string; exp: number },
  admin: false,
  effectiveTier: 'free',
}));

vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => mocks.session) }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => (mocks.admin ? { ok: true, source: 'app_session', cid: 'a', workspaceId: 'w' } : { ok: false })) }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async () => []) }));
vi.mock('@/lib/entitlements', async (orig) => {
  const real = await orig<typeof import('@/lib/entitlements')>();
  return { ...real, getEffectiveTier: vi.fn(async () => mocks.effectiveTier) };
});

import { checkRadarAccess, RADAR_DENIED_BODY } from '@/lib/mspRadar/access';

const req = new Request('http://localhost/api/msp-radar/daily');

describe('checkRadarAccess', () => {
  beforeEach(() => { mocks.session = null; mocks.admin = false; mocks.effectiveTier = 'free'; });

  it('logged out → 401', async () => {
    expect(await checkRadarAccess(req)).toEqual({ ok: false, status: 401, reason: 'unauthenticated' });
    expect(RADAR_DENIED_BODY[401].code).toBe('unauthenticated');
  });

  it('free user → 403 with upgrade path, even if cookie claims a paid tier', async () => {
    mocks.session = { cid: 'free_x@example.com', tier: 'pro', workspaceId: 'w1', exp: 0 };
    mocks.effectiveTier = 'free';
    expect(await checkRadarAccess(req)).toEqual({ ok: false, status: 403, reason: 'paid_required' });
    expect(RADAR_DENIED_BODY[403].upgradeUrl).toBe('/pricing');
  });

  it.each(['pro', 'pro_trader'])('paid tier %s → allowed via paid', async (tier) => {
    mocks.session = { cid: 'cus_1', tier, workspaceId: 'w1', exp: 0 };
    mocks.effectiveTier = tier;
    expect(await checkRadarAccess(req)).toEqual({ ok: true, via: 'paid', tier });
  });

  it('admin → allowed via admin regardless of tier', async () => {
    mocks.admin = true;
    expect(await checkRadarAccess(req)).toEqual({ ok: true, via: 'admin', tier: 'admin' });
  });
});
