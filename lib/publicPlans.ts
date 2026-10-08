/** New public policy; callers must resolve verified subscription/trial/admin access server-side.
 * Separate from legacy/admin tier helpers; public callers opt in through the rollout flag. */
export type PublicPlan = 'visitor' | 'free' | 'pro';
export type PublicQuotaKind = 'symbol' | 'ai';
export const PUBLIC_FREE_RECORD_LIMITS = { positions: 3, openJournalEntries: 5 } as const;
export const PUBLIC_DAILY_LIMITS = {
  visitor: { symbol: 1, ai: 0 },
  free: { symbol: 3, ai: 0 },
  pro: { symbol: null, ai: 20 },
} as const;
export function publicDailyLimit(plan: PublicPlan, kind: PublicQuotaKind): number | null {
  if (!Object.prototype.hasOwnProperty.call(PUBLIC_DAILY_LIMITS, plan) || !['symbol','ai'].includes(kind)) throw new Error('Invalid public quota policy');
  return PUBLIC_DAILY_LIMITS[plan][kind];
}
/** Pass resolved canonical identity, never a display ticker or a browser-supplied provider ID. */
export function symbolQuotaKey(asset: 'equity' | 'crypto', canonicalId: string): string {
  if (!['equity','crypto'].includes(asset) || !canonicalId.trim() || canonicalId !== canonicalId.trim() || canonicalId.length > 180) throw new Error('Canonical instrument identity required');
  return `${asset}:${canonicalId}`;
}
