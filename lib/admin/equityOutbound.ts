/**
 * Outbound equity-desk switches. Unset is off.
 * Only the literal values "true" and "1" turn a switch on ("yes" and "on" do not).
 * Unpausing equities restarts the shared scan and packet persist. It does not send email,
 * post the radar Discord alert, or call Jev.
 */

function flagOn(name: string): boolean {
  const value = (process.env[name] ?? "").trim().toLowerCase();
  return value === "true" || value === "1";
}

/** Morning brief, best-opportunities, daily review, evening summary, and edge failure emails. */
export function adminEquityEmailsEnabled(): boolean {
  return flagOn("ADMIN_EQUITY_EMAILS_ENABLED");
}

/** Shared-scan Discord post when new radar names appear. */
export function adminRadarDiscordEnabled(): boolean {
  return flagOn("ADMIN_RADAR_DISCORD_ENABLED");
}

/** Evening-packet news Jev, and the arca-cycle fallback while that cron is discovery-skipped. */
export function adminEquityAiEnabled(): boolean {
  return flagOn("ADMIN_EQUITY_AI_ENABLED");
}

export const ADMIN_EQUITY_EMAILS_DISABLED_REASON = "admin_equity_emails_disabled";
export const ADMIN_EQUITY_AI_DISABLED_REASON = "admin_equity_ai_disabled";

/**
 * Arca-cycle equity news step. The evening cron owns it. This fallback runs only while
 * that cron is discovery-skipped and ADMIN_EQUITY_AI_ENABLED is true or 1.
 */
export async function equityNewsJevFallback<R, T>(
  redis: R | null | undefined,
  eveningDiscoverySkipped: boolean,
  run: (redis: R) => Promise<T>,
): Promise<T | { ok: true; skipped: true; reason: string }> {
  if (!redis || !eveningDiscoverySkipped) {
    return { ok: true, skipped: true, reason: "Evening cron handles it" };
  }
  if (!adminEquityAiEnabled()) {
    return { ok: true, skipped: true, reason: ADMIN_EQUITY_AI_DISABLED_REASON };
  }
  return run(redis);
}
