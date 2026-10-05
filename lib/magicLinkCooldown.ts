const COOLDOWN_MS = 60_000;

const untilByEmail = new Map<string, number>();

export function normalizeSignInEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * One sign-in email per address per 60 seconds.
 * The slot is reserved immediately so a retry burst cannot send twice.
 */
export function claimMagicLinkEmailCooldown(
  email: string,
  now = Date.now(),
): { allowed: boolean; retryAfterSec: number } {
  const key = normalizeSignInEmail(email);
  const until = untilByEmail.get(key) ?? 0;
  if (until > now) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((until - now) / 1000)) };
  }
  untilByEmail.set(key, now + COOLDOWN_MS);
  return { allowed: true, retryAfterSec: 0 };
}

export function releaseMagicLinkEmailCooldown(email: string): void {
  untilByEmail.delete(normalizeSignInEmail(email));
}

export function resetMagicLinkEmailCooldown(): void {
  untilByEmail.clear();
}
