/**
 * Phase 5 — Admin Research Alert: Discord dispatcher
 *
 * Builds and POSTs a Discord webhook payload for an internal research
 * alert. The payload header ALWAYS contains the exact string
 *   "PRIVATE RESEARCH ALERT — NOT BROKER EXECUTION"
 * so downstream readers can never mistake it for an execution signal.
 *
 * This module is admin-only. It does not call any client-facing webhook
 * preferences (workspace user discord webhooks live in /worker).
 */

import type { AdminResearchAlert } from "../admin/adminTypes";

export const ADMIN_RESEARCH_ALERT_HEADER =
  "PRIVATE RESEARCH ALERT — NOT BROKER EXECUTION";

export interface DiscordResearchPayload {
  content: string;
  embeds: Array<{
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    footer: { text: string };
    timestamp: string;
  }>;
}

export function buildDiscordPayload(alert: AdminResearchAlert): DiscordResearchPayload {
  const color = alert.bias === "LONG" ? 0x10b981 : alert.bias === "SHORT" ? 0xef4444 : 0x64748b;
  return {
    content: ADMIN_RESEARCH_ALERT_HEADER,
    embeds: [
      {
        title: `${alert.symbol} · ${alert.timeframe} · ${alert.setup}`,
        description:
          `**${ADMIN_RESEARCH_ALERT_HEADER}**\n` +
          `Internal research signal only. No broker execution, no order routing, no client-facing position sizing.`,
        color,
        fields: [
          { name: "Bias", value: alert.bias, inline: true },
          { name: "Score", value: `${alert.score.toFixed(0)} / 100`, inline: true },
          { name: "Data Trust", value: `${alert.dataTrustScore.toFixed(0)} / 100`, inline: true },
          { name: "Market", value: alert.market, inline: true },
          { name: "Setup", value: alert.setup, inline: true },
          { name: "Classification", value: alert.classification, inline: false },
          ...(alert.whyThis ? [{ name: "Why This", value: alert.whyThis, inline: false }] : []),
          ...(alert.whyNow ? [{ name: "Why Now", value: alert.whyNow, inline: false }] : []),
          ...(alert.whatChanged ? [{ name: "What Changed", value: alert.whatChanged, inline: false }] : []),
          ...(alert.mainRisk ? [{ name: "Main Risk", value: alert.mainRisk, inline: false }] : []),
          ...(alert.nextResearchCheck ? [{ name: "Next Research Check", value: alert.nextResearchCheck, inline: false }] : []),
          ...(alert.researchLink ? [{ name: "Research Link", value: alert.researchLink, inline: false }] : []),
        ],
        footer: { text: `alertId: ${alert.alertId}` },
        timestamp: alert.createdAt,
      },
    ],
  };
}

export interface DiscordDispatchResult {
  ok: boolean;
  status: number;
  error?: string;
  skipped?: "NO_WEBHOOK_CONFIGURED";
}

/**
 * POST the alert to the admin Discord webhook (env: ADMIN_DISCORD_WEBHOOK_URL).
 * Falls back to a no-op skip if no webhook is configured.
 */
export async function dispatchDiscordResearchAlert(
  alert: AdminResearchAlert,
  webhookUrl?: string,
): Promise<DiscordDispatchResult> {
  const url = (webhookUrl ?? process.env.ADMIN_DISCORD_WEBHOOK_URL ?? "").trim();
  if (!url) return { ok: false, status: 0, skipped: "NO_WEBHOOK_CONFIGURED" };
  if (!/^https:\/\/discord\.com\/api\/webhooks\//.test(url)) {
    return { ok: false, status: 0, error: "INVALID_WEBHOOK_URL" };
  }

  const payload = buildDiscordPayload(alert);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "DISPATCH_FAILED" };
  }
}
