/**
 * Persistence for jarvis_daily_reports. DB is authoritative; the store interface is injectable so the
 * idempotency semantics can be unit-tested against an in-memory implementation.
 */
import type { ArchiveRow, DailyReport, EmailStatus, HealthStatus, PersistedReportRow, ReportStatus } from './types';

type Q = <T = any>(sql: string, params?: unknown[]) => Promise<T[]>;

export interface ReportStore {
  /** Insert or update the report for a session. Email fields are never touched by regeneration. */
  upsertReport(input: { sessionDate: string; runId: string | null; report: DailyReport; markdown: string }): Promise<PersistedReportRow>;
  getBySession(sessionDate: string): Promise<PersistedReportRow | null>;
  getLatest(): Promise<PersistedReportRow | null>;
  listArchive(limit: number): Promise<ArchiveRow[]>;
  /** Atomically claim the right to send. Returns false when a send is already SENT / in flight. */
  claimEmail(sessionDate: string, opts: { allowRetryFailed: boolean; stalePendingMs: number; now: Date }): Promise<boolean>;
  markEmail(sessionDate: string, result: { status: EmailStatus; messageId?: string | null; error?: string | null; sentAt?: Date | null }): Promise<void>;
  neighbours(sessionDate: string): Promise<{ previous: string | null; next: string | null }>;
}

const toStatus = (h: HealthStatus): ReportStatus => (h === 'NORMAL' ? 'COMPLETE' : h === 'DEGRADED' ? 'DEGRADED' : 'FAILED');
const dateStr = (v: unknown): string => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : String(v).slice(0, 10));
const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

function rowFromPg(r: any): PersistedReportRow {
  return { id: Number(r.id), sessionDate: dateStr(r.session_date), runId: r.run_id, reportVersion: r.report_version, status: r.status, healthStatus: r.health_status, headline: r.headline, reportJson: r.report_json, reportMarkdown: r.report_markdown, generatedAt: iso(r.generated_at)!, emailStatus: r.email_status, emailSentAt: iso(r.email_sent_at), emailMessageId: r.email_message_id, emailError: r.email_error, createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)! };
}

export function pgReportStore(q: Q): ReportStore {
  return {
    async upsertReport({ sessionDate, runId, report, markdown }) {
      const rows = await q(
        `INSERT INTO jarvis_daily_reports (session_date, run_id, report_version, status, health_status, headline, report_json, report_markdown, generated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
         ON CONFLICT (session_date) DO UPDATE SET run_id = EXCLUDED.run_id, report_version = jarvis_daily_reports.report_version + 1, status = EXCLUDED.status, health_status = EXCLUDED.health_status,
           headline = EXCLUDED.headline, report_json = EXCLUDED.report_json, report_markdown = EXCLUDED.report_markdown, generated_at = EXCLUDED.generated_at, updated_at = NOW()
         RETURNING *`,
        [sessionDate, runId, report.version, toStatus(report.health.status), report.health.status, report.headline, JSON.stringify(report), markdown, report.generatedAt]);
      return rowFromPg(rows[0]);
    },
    async getBySession(sessionDate) { const rows = await q(`SELECT * FROM jarvis_daily_reports WHERE session_date = $1`, [sessionDate]); return rows[0] ? rowFromPg(rows[0]) : null; },
    async getLatest() { const rows = await q(`SELECT * FROM jarvis_daily_reports WHERE status <> 'FAILED' ORDER BY session_date DESC LIMIT 1`); return rows[0] ? rowFromPg(rows[0]) : null; },
    async listArchive(limit) {
      const rows = await q(`SELECT session_date, headline, health_status, status, generated_at, email_status FROM jarvis_daily_reports ORDER BY session_date DESC LIMIT $1`, [Math.max(1, Math.min(limit, 365))]);
      return rows.map((r: any) => ({ sessionDate: dateStr(r.session_date), headline: r.headline, healthStatus: r.health_status, status: r.status, generatedAt: iso(r.generated_at)!, emailStatus: r.email_status }));
    },
    async claimEmail(sessionDate, { allowRetryFailed, stalePendingMs, now }) {
      // Single UPDATE acts as the mutex: only one caller can flip a NOT_REQUESTED/NO_RECIPIENT (or retryable) row to PENDING.
      const rows = await q(
        `UPDATE jarvis_daily_reports SET email_status = 'PENDING', email_error = NULL, updated_at = $2
          WHERE session_date = $1
            AND (email_status IN ('NOT_REQUESTED', 'NO_RECIPIENT')
                 OR ($3 AND email_status = 'FAILED')
                 OR (email_status = 'PENDING' AND updated_at < $2::timestamptz - ($4 || ' milliseconds')::interval))
          RETURNING id`,
        [sessionDate, now.toISOString(), allowRetryFailed, String(stalePendingMs)]);
      return rows.length === 1;
    },
    async markEmail(sessionDate, { status, messageId = null, error = null, sentAt = null }) {
      await q(`UPDATE jarvis_daily_reports SET email_status = $2, email_message_id = COALESCE($3, email_message_id), email_error = $4, email_sent_at = COALESCE($5, email_sent_at), updated_at = NOW() WHERE session_date = $1`, [sessionDate, status, messageId, error, sentAt ? sentAt.toISOString() : null]);
    },
    async neighbours(sessionDate) {
      const [p] = await q(`SELECT session_date FROM jarvis_daily_reports WHERE session_date < $1 ORDER BY session_date DESC LIMIT 1`, [sessionDate]);
      const [n] = await q(`SELECT session_date FROM jarvis_daily_reports WHERE session_date > $1 ORDER BY session_date ASC LIMIT 1`, [sessionDate]);
      return { previous: p ? dateStr(p.session_date) : null, next: n ? dateStr(n.session_date) : null };
    },
  };
}

/** In-memory store with identical semantics (tests, dry runs). */
export function memoryReportStore(): ReportStore & { rows: Map<string, PersistedReportRow> } {
  const rows = new Map<string, PersistedReportRow>();
  let nextId = 1;
  return {
    rows,
    async upsertReport({ sessionDate, runId, report, markdown }) {
      const now = new Date().toISOString();
      const prev = rows.get(sessionDate);
      const row: PersistedReportRow = prev
        ? { ...prev, runId, reportVersion: prev.reportVersion + 1, status: toStatus(report.health.status), healthStatus: report.health.status, headline: report.headline, reportJson: report, reportMarkdown: markdown, generatedAt: report.generatedAt, updatedAt: now }
        : { id: nextId++, sessionDate, runId, reportVersion: report.version, status: toStatus(report.health.status), healthStatus: report.health.status, headline: report.headline, reportJson: report, reportMarkdown: markdown, generatedAt: report.generatedAt, emailStatus: 'NOT_REQUESTED', emailSentAt: null, emailMessageId: null, emailError: null, createdAt: now, updatedAt: now };
      rows.set(sessionDate, row);
      return row;
    },
    async getBySession(d) { return rows.get(d) ?? null; },
    async getLatest() { return [...rows.values()].filter((r) => r.status !== 'FAILED').sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))[0] ?? null; },
    async listArchive(limit) { return [...rows.values()].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate)).slice(0, limit).map((r) => ({ sessionDate: r.sessionDate, headline: r.headline, healthStatus: r.healthStatus, status: r.status, generatedAt: r.generatedAt, emailStatus: r.emailStatus })); },
    async claimEmail(d, { allowRetryFailed, stalePendingMs, now }) {
      const r = rows.get(d); if (!r) return false;
      const stalePending = r.emailStatus === 'PENDING' && now.getTime() - Date.parse(r.updatedAt) > stalePendingMs;
      const ok = r.emailStatus === 'NOT_REQUESTED' || r.emailStatus === 'NO_RECIPIENT' || (allowRetryFailed && r.emailStatus === 'FAILED') || stalePending;
      if (!ok) return false;
      rows.set(d, { ...r, emailStatus: 'PENDING', emailError: null, updatedAt: now.toISOString() });
      return true;
    },
    async markEmail(d, { status, messageId = null, error = null, sentAt = null }) {
      const r = rows.get(d); if (!r) return;
      rows.set(d, { ...r, emailStatus: status, emailMessageId: messageId ?? r.emailMessageId, emailError: error, emailSentAt: sentAt ? sentAt.toISOString() : r.emailSentAt, updatedAt: new Date().toISOString() });
    },
    async neighbours(d) { const ds = [...rows.keys()].sort(); return { previous: [...ds].reverse().find((x) => x < d) ?? null, next: ds.find((x) => x > d) ?? null }; },
  };
}
