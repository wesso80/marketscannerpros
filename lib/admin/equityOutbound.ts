/**
 * Outbound switches.
 * Existing equity desk email and Jev keep today's behaviour. ADMIN_EQUITY_EMAILS_DISABLED
 * is an opt-out: unset means those emails still send. Only "true" or "1" turns it on.
 * ADMIN_RADAR_DISCORD_ENABLED defaults off. Unpausing equities would newly post the
 * shared-scan "new names" Discord alert, so that post stays silent until the flag is true or 1.
 */

function flagOn(name: string): boolean {
  const value = (process.env[name] ?? "").trim().toLowerCase();
  return value === "true" || value === "1";
}

/** Opt-out for the equity desk emails that already send today. Unset is off, so mail still goes out. */
export function adminEquityEmailsDisabled(): boolean {
  return flagOn("ADMIN_EQUITY_EMAILS_DISABLED");
}

/** Shared-scan Discord post when new radar names appear. Unset is off. */
export function adminRadarDiscordEnabled(): boolean {
  return flagOn("ADMIN_RADAR_DISCORD_ENABLED");
}

export const ADMIN_EQUITY_EMAILS_DISABLED_REASON = "admin_equity_emails_disabled";

/**
 * Arca-cycle equity news step. The evening cron owns it. This fallback runs only while
 * that cron is discovery-skipped, the same as before the outbound flags.
 */
export async function equityNewsJevFallback<R, T>(
  redis: R | null | undefined,
  eveningDiscoverySkipped: boolean,
  run: (redis: R) => Promise<T>,
): Promise<T | { ok: true; skipped: true; reason: string }> {
  if (!redis || !eveningDiscoverySkipped) {
    return { ok: true, skipped: true, reason: "Evening cron handles it" };
  }
  return run(redis);
}
