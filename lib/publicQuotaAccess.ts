import { createHash } from 'node:crypto';
import type { SessionPayload } from '@/lib/auth';
import { q } from '@/lib/db';
import { isOperator } from '@/lib/quant/operatorAuth';
import { effectiveTierFromSubscription } from '@/lib/entitlements';
import { createPublicDailyQuota } from './publicDailyQuota';
import { COINGECKO_ID_MAP } from '@/lib/coingecko';
import { symbolQuotaKey } from './publicPlans';
export const publicQuotaEnabled = () => process.env.PUBLIC_DAILY_QUOTAS_ENABLED === 'true';
export const publicQuota = createPublicDailyQuota();
export async function resolvePublicQuotaAccess(session: SessionPayload) {
  if (!session.workspaceId) throw Error('Authenticated workspace required');
  if (session.is_admin === true || isOperator(session.cid,session.workspaceId)) return { bypass: true as const };
  // A stale cookie or a subscription lookup failure must not grant paid access.
  const rows = await q<{tier: string; status: string; current_period_end: Date | null}>(
    'SELECT tier,status,current_period_end FROM user_subscriptions WHERE workspace_id=$1 LIMIT 1',[session.workspaceId]);
  const tier = rows[0] ? effectiveTierFromSubscription(rows[0]) : 'free';
  return { bypass: false as const, subject: `account:${session.workspaceId}`, plan: tier === 'pro' || tier === 'pro_trader' ? 'pro' as const : 'free' as const };
}
export function publicInstrumentKey(symbol: string, asset: string) {
  if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) throw Error('Invalid symbol');
  if (asset === 'equity') return symbolQuotaKey('equity',symbol);
  if (asset === 'crypto' && Object.prototype.hasOwnProperty.call(COINGECKO_ID_MAP,symbol)) return symbolQuotaKey('crypto',COINGECKO_ID_MAP[symbol]);
  throw Error('A mapped equity or crypto identity is required');
}
export const publicRequestFingerprint = (input: string) => createHash('sha256').update(input).digest('hex');
