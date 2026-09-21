import crypto from 'crypto';
import type { NextRequest } from 'next/server';

/**
 * Authorize trusted server-to-server requests with the same secret used by
 * scheduled jobs. This never falls open: when CRON_SECRET is absent, internal
 * service authorization is disabled and normal user/session auth still applies.
 */
export function hasValidInternalServiceSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const supplied = req.headers.get('x-cron-secret') || '';
  if (!supplied) return false;

  const actualBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
