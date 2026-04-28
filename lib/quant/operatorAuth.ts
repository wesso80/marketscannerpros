/**
 * Shared operator authentication for quant API routes.
 * @internal — NEVER import into user-facing components.
 */

import crypto from 'crypto';
import { hashWorkspaceId } from '../auth';

const OPERATOR_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const ADMIN_PREFIXES = ['admin_', 'free_', 'trial_'];

/**
 * Check if a request has a valid admin secret in the Authorization header.
 */
export function isAdminSecret(authHeader: string | null): boolean {
  if (!authHeader) return false;
  const secret = authHeader.replace('Bearer ', '');
  const adminSecret = process.env.ADMIN_SECRET || '';
  if (!secret || !adminSecret || secret.length !== adminSecret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(adminSecret));
  } catch {
    return false;
  }
}

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
