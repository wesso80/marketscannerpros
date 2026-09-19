/**
 * One-send email delivery for the daily report.
 *   NORMAL / DEGRADED  → normal report / health warning email (both persisted, both counted as the session's one email)
 *   FAILED             → SUPPRESSED_HEALTH (a failed run is never presented as a market report)
 * The store's claimEmail() is the mutex: cron-A/cron-B, restarts and reruns cannot double-send.
 */
import type { ReportStore } from './persistDailyReport';
import { emailSubject, renderEmailHtml } from './renderEmailHtml';
import type { DailyReport, EmailStatus } from './types';

export interface SendDeps {
  store: ReportStore;
  /** Existing Resend wrapper (lib/email sendAlertEmail). Returns provider message id. */
  sendEmail: (args: { to: string; subject: string; html: string }) => Promise<string | null>;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  baseUrl?: string;
  log?: (m: string) => void;
}

export interface SendResult { status: EmailStatus; recipients: string[]; messageId: string | null; error: string | null; skippedReason: string | null }

export const STALE_PENDING_MS = 30 * 60_000;

/** JARVIS_DAILY_REPORT_TO is the dedicated variable; ADMIN_DAILY_BRIEF_EMAILS is the existing admin digest list used as a fallback. */
export function resolveRecipients(env: Record<string, string | undefined>): string[] {
  const raw = env.JARVIS_DAILY_REPORT_TO || env.ADMIN_DAILY_BRIEF_EMAILS || '';
  return raw.split(',').map((e) => e.trim()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

export async function sendDailyReport(sessionDate: string, report: DailyReport, deps: SendDeps, opts: { retryFailed?: boolean } = {}): Promise<SendResult> {
  const env = deps.env ?? process.env;
  const now = deps.now?.() ?? new Date();
  const log = deps.log ?? (() => undefined);
  const base = deps.baseUrl ?? env.JARVIS_REPORT_BASE_URL ?? 'https://marketscannerpros.app';
  const url = `${base}/admin/jarvis/daily?date=${sessionDate}`;

  if (report.status === 'FAILED') {
    await deps.store.markEmail(sessionDate, { status: 'SUPPRESSED_HEALTH', error: report.health.summary });
    log(`email suppressed for ${sessionDate}: run FAILED`);
    return { status: 'SUPPRESSED_HEALTH', recipients: [], messageId: null, error: null, skippedReason: 'run failed — no market report to send' };
  }
  const recipients = resolveRecipients(env);
  if (!recipients.length) {
    const cur = await deps.store.getBySession(sessionDate);
    if (cur && cur.emailStatus !== 'SENT') await deps.store.markEmail(sessionDate, { status: 'NO_RECIPIENT', error: 'JARVIS_DAILY_REPORT_TO / ADMIN_DAILY_BRIEF_EMAILS not set' });
    log(`email skipped for ${sessionDate}: no recipient configured (set JARVIS_DAILY_REPORT_TO)`);
    return { status: 'NO_RECIPIENT', recipients: [], messageId: null, error: null, skippedReason: 'no recipient configured' };
  }
  const claimed = await deps.store.claimEmail(sessionDate, { allowRetryFailed: !!opts.retryFailed, stalePendingMs: STALE_PENDING_MS, now });
  if (!claimed) {
    const cur = await deps.store.getBySession(sessionDate);
    log(`email not sent for ${sessionDate}: already ${cur?.emailStatus ?? 'unknown'}`);
    return { status: cur?.emailStatus ?? 'NOT_REQUESTED', recipients, messageId: cur?.emailMessageId ?? null, error: null, skippedReason: `already ${cur?.emailStatus ?? 'handled'}` };
  }
  const subject = emailSubject(report);
  const html = renderEmailHtml(report, url);
  try {
    let lastId: string | null = null;
    for (const to of recipients) lastId = (await deps.sendEmail({ to, subject, html })) ?? lastId;
    await deps.store.markEmail(sessionDate, { status: 'SENT', messageId: lastId, sentAt: now });
    log(`email SENT for ${sessionDate} to ${recipients.length} recipient(s) (${lastId ?? 'no id'})`);
    return { status: 'SENT', recipients, messageId: lastId, error: null, skippedReason: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await deps.store.markEmail(sessionDate, { status: 'FAILED', error: msg.slice(0, 500) });
    log(`email FAILED for ${sessionDate}: ${msg}`);
    return { status: 'FAILED', recipients, messageId: null, error: msg, skippedReason: null };
  }
}
