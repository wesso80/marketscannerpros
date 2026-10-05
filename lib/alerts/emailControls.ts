import { q } from "@/lib/db";
import { sendAlertsMailboxEmail } from "@/lib/email";
import {
  alertEmailDailyCap,
  alertUnsubscribeUrl,
  appendUnsubscribeNotice,
  escapeHtml,
  isHardBounceEvent,
  isMissingSchemaCode,
  isProviderSuppressedMessage,
  listUnsubscribeHeaders,
  normalizeAlertEmail,
  planUserAlertEmail,
  renderAlertDigestEmail,
  resolveAlertEmailMode,
  signAlertUnsubscribeToken,
  sydneyCalendarDay,
  webhookRecipient,
  type AlertEmailMode,
} from "@/lib/alerts/emailPolicy";

export {
  cryptoSetupAlertUserId,
  renderAlertDigestEmail,
  signAlertUnsubscribeToken,
  verifyAlertUnsubscribeToken,
} from "@/lib/alerts/emailPolicy";

let schemaWarningLogged = false;

export function resetAlertEmailSchemaWarning(): void {
  schemaWarningLogged = false;
}

export function noteMissingAlertEmailSchema(scope: string): void {
  if (schemaWarningLogged) return;
  schemaWarningLogged = true;
  console.warn(`[alert-email] storage is not ready (${scope}). Per-alert emails stay off until the migration is applied.`);
}

function dbConfigured(): boolean {
  return Boolean((process.env.DATABASE_URL || "").trim());
}

async function readControl<T>(scope: string, work: () => Promise<T>): Promise<T | "missing"> {
  if (!dbConfigured()) {
    noteMissingAlertEmailSchema(scope);
    return "missing";
  }
  try {
    return await work();
  } catch (error) {
    if (isMissingSchemaCode(error)) {
      noteMissingAlertEmailSchema(scope);
      return "missing";
    }
    throw error;
  }
}

export async function getStoredAlertEmailMode(workspaceId: string): Promise<AlertEmailMode | "missing"> {
  const rows = await readControl("prefs", () =>
    q<{ mode: string }>(`SELECT mode FROM alert_email_prefs WHERE workspace_id = $1 LIMIT 1`, [workspaceId]),
  );
  if (rows === "missing") return "missing";
  return resolveAlertEmailMode(rows[0]?.mode ?? null);
}

export async function setAlertEmailMode(workspaceId: string, mode: AlertEmailMode): Promise<"ok" | "missing"> {
  const result = await readControl("prefs-write", () =>
    q(
      `INSERT INTO alert_email_prefs (workspace_id, mode, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (workspace_id)
       DO UPDATE SET mode = EXCLUDED.mode, updated_at = NOW()`,
      [workspaceId, mode],
    ),
  );
  return result === "missing" ? "missing" : "ok";
}

export async function recordAlertEmailSuppression(
  email: string,
  reason: "complained" | "bounced" | "provider",
  detail?: string,
): Promise<"ok" | "missing" | "skipped"> {
  const normalized = normalizeAlertEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(normalized)) return "skipped";
  const result = await readControl("suppression-write", () =>
    q(
      `INSERT INTO alert_email_suppressions (email, reason, detail)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET
         reason = EXCLUDED.reason,
         detail = COALESCE(EXCLUDED.detail, alert_email_suppressions.detail)`,
      [normalized, reason, detail ? detail.slice(0, 500) : null],
    ),
  );
  return result === "missing" ? "missing" : "ok";
}

export async function noteProviderSuppression(email: string, message: string): Promise<void> {
  if (!isProviderSuppressedMessage(message)) return;
  await recordAlertEmailSuppression(email, "provider", message);
}

async function isSuppressed(email: string): Promise<boolean | "missing"> {
  const rows = await readControl("suppression", () =>
    q<{ email: string }>(`SELECT email FROM alert_email_suppressions WHERE email = $1 LIMIT 1`, [normalizeAlertEmail(email)]),
  );
  if (rows === "missing") return "missing";
  return rows.length > 0;
}

async function sentToday(workspaceId: string, day: string): Promise<number | "missing"> {
  const rows = await readControl("cap", () =>
    q<{ sent_count: number }>(
      `SELECT sent_count FROM alert_email_daily_counts WHERE workspace_id = $1 AND sydney_day = $2::date`,
      [workspaceId, day],
    ),
  );
  if (rows === "missing") return "missing";
  return Number(rows[0]?.sent_count ?? 0);
}

async function consumeSlot(workspaceId: string, day: string, cap: number): Promise<boolean | "missing"> {
  const rows = await readControl("cap-write", () =>
    q<{ sent_count: number }>(
      `INSERT INTO alert_email_daily_counts (workspace_id, sydney_day, sent_count)
       VALUES ($1, $2::date, 1)
       ON CONFLICT (workspace_id, sydney_day)
       DO UPDATE SET sent_count = alert_email_daily_counts.sent_count + 1
       WHERE alert_email_daily_counts.sent_count < $3
       RETURNING sent_count`,
      [workspaceId, day, cap],
    ),
  );
  if (rows === "missing") return "missing";
  return rows.length > 0;
}

export async function releaseAlertSendSlot(workspaceId: string, day = sydneyCalendarDay()): Promise<void> {
  await readControl("cap-release", () =>
    q(
      `UPDATE alert_email_daily_counts
          SET sent_count = GREATEST(sent_count - 1, 0)
        WHERE workspace_id = $1 AND sydney_day = $2::date`,
      [workspaceId, day],
    ),
  );
}

async function enqueueDigest(input: {
  workspaceId: string;
  email: string;
  day: string;
  subject: string;
  line: string;
}): Promise<"ok" | "missing"> {
  const result = await readControl("digest", () =>
    q(
      `INSERT INTO alert_email_digest_items (workspace_id, email, sydney_day, subject, line)
       VALUES ($1, $2, $3::date, $4, $5)`,
      [input.workspaceId, normalizeAlertEmail(input.email), input.day, input.subject.slice(0, 300), input.line.slice(0, 500)],
    ),
  );
  return result === "missing" ? "missing" : "ok";
}

export type AssessedAlert =
  | { action: "send"; headers: Record<string, string>; html: string; text: string; day: string }
  | { action: "queued"; reason: string }
  | { action: "skipped"; reason: string };

function plainHtml(text: string): string {
  return `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f2937;"><pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(text)}</pre></body></html>`;
}

export async function assessOutgoingAlert(input: {
  workspaceId: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  line: string;
}): Promise<AssessedAlert> {
  const to = normalizeAlertEmail(input.to);
  if (!to || !input.workspaceId.trim()) return { action: "skipped", reason: "no-recipient" };

  const suppressed = await isSuppressed(to);
  if (suppressed === true) return { action: "skipped", reason: "suppressed" };

  const storedMode = await getStoredAlertEmailMode(input.workspaceId);
  const day = sydneyCalendarDay();
  const cap = alertEmailDailyCap();
  let missing = suppressed === "missing" || storedMode === "missing";
  const mode: AlertEmailMode = storedMode === "missing" ? "digest" : storedMode;
  let sent = 0;

  if (!missing && mode === "each") {
    const count = await sentToday(input.workspaceId, day);
    if (count === "missing") missing = true;
    else sent = count;
  }

  const queueOrSkip = async (reason: string): Promise<AssessedAlert> => {
    const queued = await enqueueDigest({
      workspaceId: input.workspaceId,
      email: to,
      day,
      subject: input.subject,
      line: input.line,
    });
    if (queued === "missing") return { action: "skipped", reason: "schema" };
    return { action: "queued", reason };
  };

  if (missing) return queueOrSkip("schema");

  const plan = planUserAlertEmail({ mode, suppressed: false, sentToday: sent, cap });
  if (plan.action === "skip") return { action: "skipped", reason: plan.reason };
  if (plan.action === "queue") return queueOrSkip(plan.reason);

  const consumed = await consumeSlot(input.workspaceId, day, cap);
  if (consumed !== true) return queueOrSkip(consumed === "missing" ? "schema" : "cap");

  const token = signAlertUnsubscribeToken(input.workspaceId);
  const notice = appendUnsubscribeNotice(
    input.html?.trim() ? input.html : plainHtml(input.text || input.line),
    input.text || input.line,
    alertUnsubscribeUrl(token),
  );
  return { action: "send", headers: listUnsubscribeHeaders(token), html: notice.html, text: notice.text, day };
}

export async function deliverUserAlertEmail(input: {
  workspaceId: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  line: string;
}): Promise<{ action: "sent" | "queued" | "skipped"; reason: string; providerId: string | null }> {
  const assessed = await assessOutgoingAlert(input);
  if (assessed.action === "queued") return { action: "queued", reason: assessed.reason, providerId: null };
  if (assessed.action === "skipped") return { action: "skipped", reason: assessed.reason, providerId: null };

  try {
    const providerId = await sendAlertsMailboxEmail({
      to: normalizeAlertEmail(input.to),
      subject: input.subject,
      html: assessed.html,
      text: assessed.text,
      headers: assessed.headers,
    });
    return { action: "sent", reason: "each", providerId };
  } catch (error) {
    await releaseAlertSendSlot(input.workspaceId, assessed.day).catch(() => {});
    const message = error instanceof Error ? error.message : "send failed";
    if (isProviderSuppressedMessage(message)) {
      await noteProviderSuppression(input.to, message).catch(() => {});
      return { action: "skipped", reason: "provider-suppressed", providerId: null };
    }
    throw error;
  }
}

type DigestRow = {
  id: string;
  workspace_id: string;
  email: string;
  sydney_day: string;
  line: string;
};

export async function sendDueAlertDigests(now = new Date()): Promise<{ sent: number; skipped: number; failed: number; reason?: string }> {
  const today = sydneyCalendarDay(now);
  const claimed = await readControl("digest-claim", () =>
    q<DigestRow>(
      `UPDATE alert_email_digest_items
          SET sent_at = NOW()
        WHERE sent_at IS NULL
          AND sydney_day < $1::date
        RETURNING id::text AS id, workspace_id, email, sydney_day::text AS sydney_day, line`,
      [today],
    ),
  );
  if (claimed === "missing") return { sent: 0, skipped: 0, failed: 0, reason: "schema" };

  const groups = new Map<string, DigestRow[]>();
  for (const row of claimed) {
    const key = `${row.workspace_id}\n${normalizeAlertEmail(row.email)}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const rows of groups.values()) {
    const email = normalizeAlertEmail(rows[0].email);
    const workspaceId = rows[0].workspace_id;
    const ids = rows.map((row) => row.id);
    try {
      const suppressed = await isSuppressed(email);
      const mode = await getStoredAlertEmailMode(workspaceId);
      if (suppressed === true || mode === "off") {
        skipped += 1;
        continue;
      }
      const token = signAlertUnsubscribeToken(workspaceId);
      const rendered = renderAlertDigestEmail({
        lines: rows.map((row) => ({ sydneyDay: String(row.sydney_day).slice(0, 10), line: row.line })),
        unsubscribeUrl: alertUnsubscribeUrl(token),
      });
      await sendAlertsMailboxEmail({
        to: email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: listUnsubscribeHeaders(token),
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "digest send failed";
      console.warn("[alert-email] digest send failed");
      await readControl("digest-release", () =>
        q(`UPDATE alert_email_digest_items SET sent_at = NULL WHERE id = ANY($1::bigint[])`, [ids]),
      ).catch(() => {});
      void message;
    }
  }
  return { sent, skipped, failed };
}

export async function recordWebhookSuppression(type: string, data: Record<string, unknown>): Promise<void> {
  const email = webhookRecipient(data);
  if (!email) return;
  if (type === "email.complained") {
    await recordAlertEmailSuppression(email, "complained");
    return;
  }
  if (type === "email.bounced" && isHardBounceEvent(data)) {
    const bounce = data.bounce;
    const detail = bounce && typeof bounce === "object" && typeof (bounce as { type?: unknown }).type === "string"
      ? (bounce as { type: string }).type
      : undefined;
    await recordAlertEmailSuppression(email, "bounced", detail);
  }
}
