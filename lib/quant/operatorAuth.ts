/**
 * Shared operator authentication for quant API routes.
 * @internal — NEVER import into user-facing components.
 */

import { hashWorkspaceId } from '@/lib/auth';

const OPERATOR_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const ADMIN_PREFIXES = ['admin_', 'free_', 'trial_'];

export function isOperator(cid: string, workspaceId?: string): boolean {
  const lower = cid.toLowerCase();
  const cidMatch = OPERATOR_EMAILS.some(email =>
    lower === email || lower.endsWith(`_${email}`) ||
    ADMIN_PREFIXES.some(p => lower === `${p}${email}`),
  );
  if (cidMatch) return true;

  // Stripe customer IDs (cus_xxx) won't match above — check workspace hash
  if (workspaceId) {
    return OPERATOR_EMAILS.some(email => hashWorkspaceId(email) === workspaceId);
  }
  return false;
}
