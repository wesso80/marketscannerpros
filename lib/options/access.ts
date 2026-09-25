/**
 * Server-side access rule for the options tools (Options Terminal chain, Options Flow, Options Scanner).
 *
 * Same source of truth as /api/me and MSP Radar: admin → allowed; otherwise session cookie →
 * getEffectiveTier (DB subscription, admin email, free-for-all) → paid tier allowed.
 *
 * Previously these routes read the tier baked into the login cookie and required the literal
 * legacy `pro_trader` tier. That locked out (a) current Pro subscribers — Pro is the only paid
 * plan sold since the 2026 pricing change — and (b) admins/owners whose login cookie carries
 * `free` because they have no Stripe subscription, even though /api/me (and so the UI) shows
 * them as unlocked.
 */
import { getSessionFromCookie } from '@/lib/auth';
import { requireAdmin } from '@/lib/adminAuth';
import { getEffectiveTier } from '@/lib/entitlements';
import { hasProTraderAccess } from '@/lib/proTraderAccess';
import { q } from '@/lib/db';

export type OptionsAccess =
  | { ok: true; via: 'paid' | 'admin'; tier: string; workspaceId: string }
  | { ok: false; status: 401 | 403; reason: 'unauthenticated' | 'paid_required' };

export async function checkOptionsAccess(req: Request): Promise<OptionsAccess> {
  const session = await getSessionFromCookie();
  const admin = await requireAdmin(req);
  if (admin.ok) {
    const workspaceId = session?.workspaceId || admin.workspaceId;
    if (workspaceId) return { ok: true, via: 'admin', tier: 'admin', workspaceId };
  }
  if (!session?.workspaceId) return { ok: false, status: 401, reason: 'unauthenticated' };
  const tier = await getEffectiveTier(session.workspaceId, session.tier, session.cid, q);
  // hasProTraderAccess: pro + legacy pro_trader (+ the time-boxed operator bypass, if configured).
  if (hasProTraderAccess(tier)) return { ok: true, via: 'paid', tier, workspaceId: session.workspaceId };
  return { ok: false, status: 403, reason: 'paid_required' };
}
