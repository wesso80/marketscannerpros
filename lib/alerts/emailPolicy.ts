import { createHmac, timingSafeEqual } from "crypto";

export const DEFAULT_ALERTS_FROM_EMAIL = "MarketScannerPros Alerts <alerts@marketscannerpros.app>";
export const ALERT_UNSUBSCRIBE_LIST = "alerts";
export const ALERT_UNSUBSCRIBE_MAILTO = "mailto:unsubscribe@marketscannerpros.app?subject=unsubscribe";
export const ALERT_UNSUBSCRIBE_ORIGIN = "https://marketscannerpros.app";
export const DEFAULT_ALERT_EMAIL_DAILY_CAP = 3;

export type AlertEmailMode = "digest" | "each" | "off";

export function resolveAlertsFromEmail(env: NodeJS.ProcessEnv = process.env): string {
  const dedicated = (env.ALERTS_FROM_EMAIL || "").trim();
  return dedicated || DEFAULT_ALERTS_FROM_EMAIL;
}

export function alertEmailDailyCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.ALERT_EMAIL_DAILY_CAP || "").trim();
  if (!raw) return DEFAULT_ALERT_EMAIL_DAILY_CAP;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_ALERT_EMAIL_DAILY_CAP;
  return Math.floor(parsed);
}

/** Calendar day in Australia/Sydney, YYYY-MM-DD. */
export function sydneyCalendarDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function normalizeAlertEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** No stored preference means the daily summary. */
export function resolveAlertEmailMode(stored: string | null | undefined): AlertEmailMode {
  if (stored === "each" || stored === "off" || stored === "digest") return stored;
  return "digest";
}

export function planUserAlertEmail(input: {
  mode: AlertEmailMode;
  suppressed: boolean;
  sentToday: number;
  cap: number;
}): { action: "send" | "queue" | "skip"; reason: "suppressed" | "off" | "digest" | "cap" | "each" } {
  if (input.suppressed) return { action: "skip", reason: "suppressed" };
  if (input.mode === "off") return { action: "skip", reason: "off" };
  if (input.mode === "digest") return { action: "queue", reason: "digest" };
  if (input.sentToday >= input.cap) return { action: "queue", reason: "cap" };
  return { action: "send", reason: "each" };
}

const DEV_SIGNING_FALLBACK = "msp-local-dev-signing-secret-do-not-use-in-production";

export function alertSigningSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = (env.APP_SIGNING_SECRET || "").trim();
  if (secret) return secret;
  if (env.NODE_ENV === "production" || env.RENDER === "true") {
    throw new Error("APP_SIGNING_SECRET is not set");
  }
  return DEV_SIGNING_FALLBACK;
}

/** HMAC of user id + list `alerts`, signed with APP_SIGNING_SECRET. */
export function signAlertUnsubscribeToken(userId: string, secret?: string): string {
  const key = secret ?? alertSigningSecret();
  const uid = userId.trim();
  if (!uid) throw new Error("Missing user id");
  const payload = Buffer.from(JSON.stringify({ uid, list: ALERT_UNSUBSCRIBE_LIST }), "utf8").toString("base64url");
  const sig = createHmac("sha256", key).update(`${uid}|${ALERT_UNSUBSCRIBE_LIST}`).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyAlertUnsubscribeToken(token: string, secret?: string): { userId: string } | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let parsed: { uid?: unknown; list?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (parsed.list !== ALERT_UNSUBSCRIBE_LIST || typeof parsed.uid !== "string" || !parsed.uid.trim()) return null;
  let key: string;
  try {
    key = secret ?? alertSigningSecret();
  } catch {
    return null;
  }
  const expected = createHmac("sha256", key).update(`${parsed.uid.trim()}|${ALERT_UNSUBSCRIBE_LIST}`).digest("base64url");
  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) return null;
  return { userId: parsed.uid.trim() };
}

export function alertUnsubscribeUrl(token: string): string {
  return `${ALERT_UNSUBSCRIBE_ORIGIN}/api/email/unsubscribe?t=${encodeURIComponent(token)}`;
}

export function listUnsubscribeHeaders(token: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${alertUnsubscribeUrl(token)}>, <${ALERT_UNSUBSCRIBE_MAILTO}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function isProviderSuppressedMessage(message: string): boolean {
  return /suppress/i.test(message);
}

/** Hard bounce only. Temporary / soft bounces stay off the suppression list. */
export function isHardBounceEvent(data: Record<string, unknown>): boolean {
  const bounce = data.bounce;
  if (!bounce || typeof bounce !== "object") return false;
  const record = bounce as { type?: unknown; subType?: unknown };
  const type = typeof record.type === "string" ? record.type.trim().toLowerCase() : "";
  const sub = typeof record.subType === "string" ? record.subType.trim().toLowerCase() : "";
  if (/tempor|transient|soft/.test(type) || /tempor|transient|soft/.test(sub)) return false;
  return type === "permanent" || type === "hard" || type === "hardbounce" || /permanent|hard/.test(sub);
}

export function webhookRecipient(data: Record<string, unknown>): string | null {
  const toRaw = Array.isArray(data.to) ? data.to[0] : data.to;
  if (typeof toRaw !== "string") return null;
  const email = normalizeAlertEmail(toRaw);
  return /^\S+@\S+\.\S+$/.test(email) ? email : null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function appendUnsubscribeNotice(html: string, text: string | undefined, url: string): { html: string; text: string } {
  const safeUrl = escapeHtml(url);
  const link = `<p style="margin-top:24px;font-size:12px;line-height:1.5;color:#4b5563;">You get these alert emails because you have an alert on MarketScannerPros. <a href="${safeUrl}">Unsubscribe from alert emails</a>. Sign-in emails are not affected.</p>`;
  const nextHtml = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${link}</body>`) : `${html}${link}`;
  const base = text && text.trim() ? text.replace(/\s+$/, "") : "MarketScannerPros alert.";
  const nextText = `${base}\n\nUnsubscribe from alert emails: ${url}\nSign-in emails are not affected.\n`;
  return { html: nextHtml, text: nextText };
}

export type DigestLine = { sydneyDay: string; line: string };

export function renderAlertDigestEmail(input: {
  lines: DigestLine[];
  unsubscribeUrl: string;
}): { subject: string; html: string; text: string } {
  const days = [...new Set(input.lines.map((row) => row.sydneyDay))].sort();
  const dayLabel = days.length === 1 ? formatSydneyDay(days[0]) : "recent days";
  const subject = `Your alert summary for ${dayLabel}`;
  const textItems = input.lines.map((row) => `- ${row.line}`).join("\n");
  const safeUrl = escapeHtml(input.unsubscribeUrl);
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#1f2937;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;">
  <h1 style="font-size:20px;margin:0 0 12px;">Your alert summary</h1>
  <p style="margin:0 0 16px;">These alerts triggered on ${escapeHtml(dayLabel)} (Sydney time). They are also in the app. This is research information, not a trade instruction.</p>
  <ul style="margin:0 0 16px;padding-left:20px;">${input.lines.map((row) => `<li style="margin:0 0 8px;">${escapeHtml(row.line)}</li>`).join("")}</ul>
  <p style="margin:0 0 16px;"><a href="https://marketscannerpros.app/tools/workspace?tab=alerts">View alerts in the app</a></p>
  <p style="margin:0;font-size:12px;color:#4b5563;">You get one daily summary by default. <a href="${safeUrl}">Unsubscribe from alert emails</a>. Sign-in emails are not affected.</p>
</body>
</html>`;
  const text = [
    `Your alert summary for ${dayLabel} (Sydney time).`,
    "These alerts also stay in the app. Research information, not a trade instruction.",
    "",
    textItems,
    "",
    "View alerts: https://marketscannerpros.app/tools/workspace?tab=alerts",
    "",
    `Unsubscribe from alert emails: ${input.unsubscribeUrl}`,
    "Sign-in emails are not affected.",
  ].join("\n");
  return { subject, html, text };
}

function formatSydneyDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const utc = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(utc);
}

/** Stable id for the single crypto-setup recipient, which has no member workspace. */
export function cryptoSetupAlertUserId(email: string): string {
  return `crypto-setup:${normalizeAlertEmail(email)}`;
}

export function isMissingSchemaCode(error: unknown): boolean {
  return schemaCode(error) === "42P01" || schemaCode(error) === "42703";
}

function schemaCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const record = error as { code?: unknown; cause?: unknown };
  if (typeof record.code === "string") return record.code;
  return schemaCode(record.cause);
}
