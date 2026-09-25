/**
 * Send a triggered alert to the user's own Discord webhook, when they have turned
 * on "Discord Webhook Alerts" in Account Settings (TR-26).
 *
 * Only the user's own webhook is used; alerts are never posted to the shared
 * site channel (TR-19 / PR #72). Best-effort: it never throws, so a Discord
 * problem can't block email or push delivery, or the alert's status update.
 */
import { q } from '../db';
import { normalizeDiscordWebhookUrl, sendDiscordWebhook, type DiscordSendResult } from '../notifications/discordWebhook';

export const ALERTS_PAGE_URL = 'https://marketscannerpros.app/tools/workspace?tab=alerts';

interface DiscordPrefsRow {
  discord_enabled: boolean | null;
  discord_webhook_url: string | null;
}

export async function loadUserDiscordWebhook(workspaceId: string): Promise<string | null> {
  const rows = await q<DiscordPrefsRow>(
    `SELECT discord_enabled, discord_webhook_url FROM notification_prefs WHERE workspace_id = $1 LIMIT 1`,
    [workspaceId],
  );
  const row = rows[0];
  if (!row?.discord_enabled) return null;
  return normalizeDiscordWebhookUrl(row.discord_webhook_url);
}

/** "🔔 **BTC alert: My level**\nBTC crossed above $70,000 …\n<link>" */
export function formatAlertDiscordMessage(args: { title: string; detail: string; url?: string }): string {
  return `🔔 **${args.title}**\n${args.detail}\n<${args.url ?? ALERTS_PAGE_URL}>`;
}

export type UserDiscordOutcome = DiscordSendResult & { skipped?: 'not_configured' };

export async function deliverAlertToUserDiscord(
  workspaceId: string,
  message: { title: string; detail: string; url?: string },
  deps: { loadWebhook?: typeof loadUserDiscordWebhook; fetchImpl?: typeof fetch } = {},
): Promise<UserDiscordOutcome> {
  try {
    const webhook = await (deps.loadWebhook ?? loadUserDiscordWebhook)(workspaceId);
    if (!webhook) return { ok: false, skipped: 'not_configured' };
    const result = await sendDiscordWebhook(webhook, formatAlertDiscordMessage(message), { fetchImpl: deps.fetchImpl });
    if (!result.ok) console.error(`[Alert] Discord webhook delivery failed (non-fatal) for workspace ${workspaceId}: ${result.error}`);
    return result;
  } catch (error) {
    console.error('[Alert] Discord webhook lookup failed (non-fatal):', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Discord delivery failed' };
  }
}
