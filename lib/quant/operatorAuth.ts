/**
 * Shared operator authentication for quant API routes.
 * @internal — NEVER import into user-facing components.
 */

const OPERATOR_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const ADMIN_PREFIXES = ['admin_', 'free_', 'trial_'];

export function isOperator(cid: string): boolean {
  const lower = cid.toLowerCase();
  return OPERATOR_EMAILS.some(email =>
    lower === email || lower.endsWith(`_${email}`) ||
    ADMIN_PREFIXES.some(p => lower === `${p}${email}`),
  );
}
