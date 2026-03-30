import crypto from 'crypto';

/**
 * Timing-safe comparison for admin secrets / cron tokens.
 * Avoids timing attacks by using constant-time comparison.
 */
export function isValidAdminSecret(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, 'utf8'),
      Buffer.from(expected, 'utf8'),
    );
  } catch {
    // Length mismatch
    return false;
  }
}

/**
 * Verify cron authorization header against CRON_SECRET env var.
 * Used by all /api/jobs/* routes.
 */
export function verifyCronAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[verifyCronAuth] CRON_SECRET env var is not set');
    return false;
  }

  // Read x-cron-secret directly first (what cron curl sends), fall back to authorization
  const cronHeader = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');
  const token = cronHeader || authHeader || '';
  const stripped = token.replace(/^Bearer\s+/i, '');

  if (!stripped) {
    console.error(`[verifyCronAuth] No auth token found. x-cron-secret present: ${!!cronHeader}, authorization present: ${!!authHeader}`);
    return false;
  }

  const valid = isValidAdminSecret(stripped, cronSecret);
  if (!valid) {
    console.error(`[verifyCronAuth] Token mismatch. token length: ${stripped.length}, expected length: ${cronSecret.length}`);
  }
  return valid;
}

/**
 * Verify admin secret header.
 */
export function verifyAdminAuth(request: Request): boolean {
  const adminSecret = process.env.ADMIN_SECRET ?? process.env.CRON_SECRET;
  if (!adminSecret) return false;

  const header = request.headers.get('x-admin-secret') ?? '';
  return isValidAdminSecret(header, adminSecret);
}
