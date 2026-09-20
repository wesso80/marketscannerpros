/**
 * Server-side access rule for MSP Radar (customer-facing name of the persisted daily report).
 * Same source of truth as /api/me: session cookie → getEffectiveTier → hasProAccess. Admins pass via requireAdmin.
 */
import { getSessionFromCookie } from '@/lib/auth';
import { requireAdmin } from '@/lib/adminAuth';
import { getEffectiveTier, hasProAccess } from '@/lib/entitlements';
import { q } from '@/lib/db';

export type RadarAccess =
  | { ok: true; via: 'paid' | 'admin'; tier: string }
  | { ok: false; status: 401 | 403; reason: 'unauthenticated' | 'paid_required' };

export async function checkRadarAccess(req: Request): Promise<RadarAccess> {
  const admin = await requireAdmin(req);
  if (admin.ok) return { ok: true, via: 'admin', tier: 'admin' };
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return { ok: false, status: 401, reason: 'unauthenticated' };
  const tier = await getEffectiveTier(session.workspaceId, session.tier, session.cid, q);
  if (hasProAccess(tier)) return { ok: true, via: 'paid', tier };
  return { ok: false, status: 403, reason: 'paid_required' };
}

export const RADAR_DENIED_BODY = {
  401: { error: 'Sign in to view MSP Radar.', code: 'unauthenticated' },
  403: { error: 'MSP Radar is available with a paid MarketScannerPros plan.', code: 'paid_required', upgradeUrl: '/pricing' },
} as const;
