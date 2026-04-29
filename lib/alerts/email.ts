/**
 * Phase 5 — Admin Research Alert: Email dispatcher
 *
 * Lightweight email payload builder. Sending is delegated to whatever
 * SMTP / transactional provider is wired via env (we only build + log here;
 * actual send is best-effort and pluggable).
 *
 * Payload subject line ALWAYS begins with the boundary header so an
 * inbox skim can never mistake it for an execution instruction.
 */

import type { AdminResearchAlert } from "../admin/adminTypes";
import { ADMIN_RESEARCH_ALERT_HEADER } from "./discord";

export interface EmailResearchPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function buildEmailPayload(
  alert: AdminResearchAlert,
  to: string,
): EmailResearchPayload {
  const subject = `[${ADMIN_RESEARCH_ALERT_HEADER}] ${alert.symbol} · ${alert.timeframe} · ${alert.setup}`;
  const text =
    `${ADMIN_RESEARCH_ALERT_HEADER}\n\n` +
    `Internal research signal only. No broker execution, no order routing,\n` +
    `no client-facing position sizing.\n\n` +
    `Symbol:        ${alert.symbol}\n` +
    `Market:        ${alert.market}\n` +
    `Timeframe:     ${alert.timeframe}\n` +
    `Setup:         ${alert.setup}\n` +
    `Bias:          ${alert.bias}\n` +
    `Score:         ${alert.score.toFixed(0)} / 100\n` +
    `Data Trust:    ${alert.dataTrustScore.toFixed(0)} / 100\n` +
    `Classification:${alert.classification}\n` +
    `Created:       ${alert.createdAt}\n` +
    `Alert ID:      ${alert.alertId}\n`;
  const html =
    `<div style="font-family:system-ui,sans-serif;color:#0f172a">` +
    `<h2 style="margin:0 0 8px 0;color:#b91c1c">${ADMIN_RESEARCH_ALERT_HEADER}</h2>` +
    `<p style="margin:0 0 12px 0;color:#475569">Internal research signal only. ` +
    `No broker execution, no order routing, no client-facing position sizing.</p>` +
    `<table cellpadding="6" style="border-collapse:collapse;font-size:14px">` +
    `<tr><td><b>Symbol</b></td><td>${alert.symbol}</td></tr>` +
    `<tr><td><b>Market</b></td><td>${alert.market}</td></tr>` +
    `<tr><td><b>Timeframe</b></td><td>${alert.timeframe}</td></tr>` +
    `<tr><td><b>Setup</b></td><td>${alert.setup}</td></tr>` +
    `<tr><td><b>Bias</b></td><td>${alert.bias}</td></tr>` +
    `<tr><td><b>Score</b></td><td>${alert.score.toFixed(0)} / 100</td></tr>` +
    `<tr><td><b>Data Trust</b></td><td>${alert.dataTrustScore.toFixed(0)} / 100</td></tr>` +
    `<tr><td><b>Classification</b></td><td>${alert.classification}</td></tr>` +
    `<tr><td><b>Alert ID</b></td><td>${alert.alertId}</td></tr>` +
    `</table></div>`;
  return { to, subject, text, html };
}

export interface EmailDispatchResult {
  ok: boolean;
  skipped?: "NO_RECIPIENT_CONFIGURED";
  error?: string;
}

/**
 * Best-effort email dispatch. If no transactional backend is wired,
 * logs the payload and returns ok=true (the payload is recorded in the
 * alerts table either way by the engine).
 */
export async function dispatchEmailResearchAlert(
  alert: AdminResearchAlert,
  to?: string,
): Promise<EmailDispatchResult> {
  const recipient = (to ?? process.env.ADMIN_RESEARCH_ALERT_EMAIL ?? "").trim();
  if (!recipient) return { ok: false, skipped: "NO_RECIPIENT_CONFIGURED" };
  const payload = buildEmailPayload(alert, recipient);
  // Pluggable: when a transactional backend is wired (e.g. Resend, SES),
  // call it here. Until then we log so ops can see the payload.
  // eslint-disable-next-line no-console
  console.log("[admin-research-alert][email]", payload.subject);
  return { ok: true };
}
