/**
 * Centralised admin notifier.
 *
 * Single dispatcher used by every cron, every data-degradation event,
 * and every kill-switch trip. Fans out to:
 *   - Resend email (ADMIN_NOTIFY_EMAIL, default wesso@marketscannerpros.app)
 *   - Discord webhook (ADMIN_DISCORD_WEBHOOK_URL) if configured
 *
 * Never throws — notification failure must never break the originating job.
 */

import { sendAlertEmail } from "@/lib/email";

export type AdminNotifySeverity = "info" | "warn" | "error" | "critical";

export interface AdminNotifyInput {
  /** Short subject line — used as email subject + Discord title. */
  subject: string;
  /** Plain-text body. Will be wrapped in a simple HTML shell for email. */
  body: string;
  /** Severity controls subject prefix + Discord color. */
  severity?: AdminNotifySeverity;
  /** Optional deep link surfaced as a CTA button. */
  link?: { label: string; url: string };
  /** Free-form context shown as a key/value table. */
  context?: Record<string, string | number | boolean | null>;
  /** Optional channel restriction. Default: all configured channels. */
  channels?: Array<"email" | "discord">;
}

export interface AdminNotifyResult {
  emailSent: boolean;
  discordSent: boolean;
  errors: string[];
}

const SEVERITY_COLOR: Record<AdminNotifySeverity, number> = {
  info: 0x3B82F6,
  warn: 0xF59E0B,
  error: 0xEF4444,
  critical: 0x7F1D1D,
};

const SEVERITY_PREFIX: Record<AdminNotifySeverity, string> = {
  info: "[MSP]",
  warn: "[MSP WARN]",
  error: "[MSP ERROR]",
  critical: "[MSP CRITICAL]",
};

export async function notifyAdmin(input: AdminNotifyInput): Promise<AdminNotifyResult> {
  const severity = input.severity ?? "info";
  const channels = input.channels ?? ["email", "discord"];
  const errors: string[] = [];
  let emailSent = false;
  let discordSent = false;

  if (channels.includes("email")) {
    try {
      const to = (process.env.ADMIN_NOTIFY_EMAIL || "wesso@marketscannerpros.app").trim();
      if (!to) {
        errors.push("email: ADMIN_NOTIFY_EMAIL empty");
      } else if (!process.env.RESEND_API_KEY) {
        errors.push("email: RESEND_API_KEY not set");
      } else {
        const html = buildEmailHtml(input, severity);
        await sendAlertEmail({
          to,
          subject: `${SEVERITY_PREFIX[severity]} ${input.subject}`,
          html,
        });
        emailSent = true;
      }
    } catch (e) {
      errors.push(`email: ${e instanceof Error ? e.message : "send_failed"}`);
    }
  }

  if (channels.includes("discord")) {
    try {
      const url = (process.env.ADMIN_DISCORD_WEBHOOK_URL || "").trim();
      if (!url) {
        // Silent skip — Discord is optional.
      } else {
        const payload = buildDiscordPayload(input, severity);
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) {
          errors.push(`discord: HTTP ${r.status}`);
        } else {
          discordSent = true;
        }
      }
    } catch (e) {
      errors.push(`discord: ${e instanceof Error ? e.message : "send_failed"}`);
    }
  }

  if (errors.length) {
    console.warn("[notifyAdmin] partial dispatch:", { subject: input.subject, errors });
  }

  return { emailSent, discordSent, errors };
}

function buildEmailHtml(input: AdminNotifyInput, severity: AdminNotifySeverity): string {
  const color = `#${SEVERITY_COLOR[severity].toString(16).padStart(6, "0")}`;
  const ctxRows = input.context
    ? Object.entries(input.context)
        .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#94a3b8;font-size:12px">${escapeHtml(k)}</td><td style="padding:4px 0;color:#f1f5f9;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(String(v ?? "—"))}</td></tr>`)
        .join("")
    : "";
  const cta = input.link
    ? `<div style="text-align:center;margin-top:24px"><a href="${escapeHtml(input.link.url)}" style="display:inline-block;background:${color};color:#0f172a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(input.link.label)}</a></div>`
    : "";
  const bodyHtml = escapeHtml(input.body).replace(/\n/g, "<br>");
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:20px;margin:0">
<div style="max-width:640px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px;border-left:4px solid ${color}">
  <div style="font-size:11px;letter-spacing:1px;color:${color};text-transform:uppercase;margin-bottom:8px">${SEVERITY_PREFIX[severity]}</div>
  <h1 style="margin:0 0 16px 0;font-size:20px;color:#f1f5f9">${escapeHtml(input.subject)}</h1>
  <div style="font-size:14px;color:#cbd5e1;line-height:1.6">${bodyHtml}</div>
  ${ctxRows ? `<table style="margin-top:20px;width:100%;border-collapse:collapse;background:#0f172a;border-radius:8px;padding:12px"><tbody>${ctxRows}</tbody></table>` : ""}
  ${cta}
  <p style="color:#64748b;font-size:11px;text-align:center;margin-top:24px">MSP Operator Notifications · ${new Date().toISOString()}</p>
</div></body></html>`;
}

function buildDiscordPayload(input: AdminNotifyInput, severity: AdminNotifySeverity) {
  const fields = input.context
    ? Object.entries(input.context).slice(0, 25).map(([k, v]) => ({
        name: k.slice(0, 256),
        value: String(v ?? "—").slice(0, 1024),
        inline: true,
      }))
    : [];
  return {
    username: "MSP Operator",
    embeds: [
      {
        title: `${SEVERITY_PREFIX[severity]} ${input.subject}`.slice(0, 256),
        description: input.body.slice(0, 4000),
        color: SEVERITY_COLOR[severity],
        fields,
        url: input.link?.url,
        footer: { text: "MSP Operator Notifications" },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
