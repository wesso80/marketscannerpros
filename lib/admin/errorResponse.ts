import { randomBytes } from 'crypto';

/**
 * Admin routes must not send internal exception text (SQL, provider responses, stack fragments) to the browser.
 * Logs the full error server-side under a short reference and returns a generic message carrying that reference,
 * so an operator can match what they saw with the server log.
 */
export function adminErrorText(err: unknown, scope: string): string {
  const ref = randomBytes(4).toString('hex');
  console.error(`[admin-error ${ref}] ${scope}`, err);
  return `Request failed (ref ${ref})`;
}
