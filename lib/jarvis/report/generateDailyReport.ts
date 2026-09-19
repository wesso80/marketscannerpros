/**
 * Orchestration: persisted run (+ watchlist) → report → health gate → persist → optional one-send email.
 * Zero provider calls. Safe to re-run: regeneration upserts the same session row and never touches email state.
 */
import { q } from '../../db';
import { loadRunBySession, loadWatchlist, type RunRecord, type WatchEntry } from '../radar/store';
import { buildDailyReport, buildFailedReport } from './buildDailyReport';
import { pgReportStore, type ReportStore } from './persistDailyReport';
import { renderReportMarkdown } from './renderMarkdown';
import { sendDailyReport, type SendDeps, type SendResult } from './sendDailyReport';
import type { DailyReport, PersistedReportRow } from './types';

export interface GenerateDeps {
  store?: ReportStore;
  loadRun?: (sessionDate: string) => Promise<RunRecord | null>;
  loadWatch?: () => Promise<WatchEntry[]>;
  sendEmail?: SendDeps['sendEmail'];
  env?: Record<string, string | undefined>;
  log?: (m: string) => void;
  now?: () => Date;
}

export interface GenerateResult { report: DailyReport; row: PersistedReportRow; markdown: string; email: SendResult | null }

export async function generateDailyReport(sessionDate: string, opts: { sendEmail: boolean; retryFailedEmail?: boolean }, deps: GenerateDeps = {}): Promise<GenerateResult> {
  const log = deps.log ?? ((m: string) => process.stderr.write(`[jarvis-report] ${m}\n`));
  const store = deps.store ?? pgReportStore(q);
  const run = await (deps.loadRun ?? loadRunBySession)(sessionDate);
  let report: DailyReport;
  if (!run || !run.report) {
    report = buildFailedReport(sessionDate, run?.runKey ?? null, run ? 'run row exists but payload is empty' : 'no completed overnight run persisted for this session');
  } else {
    const watchlist = await (deps.loadWatch ?? loadWatchlist)();
    report = buildDailyReport({ run: { runKey: run.runKey, report: run.report, apiUsage: run.apiUsage ?? {}, runtimeMs: run.runtimeMs ?? 0, generatedAt: run.generatedAt, sessionDate: run.sessionDate }, watchlist });
  }
  const markdown = renderReportMarkdown(report);
  const row = await store.upsertReport({ sessionDate, runId: run?.runKey ?? null, report, markdown });
  log(`report ${sessionDate}: ${report.status} / health ${report.health.status} (v${row.reportVersion}) — ${report.headline}`);
  let email: SendResult | null = null;
  if (opts.sendEmail) {
    if (!deps.sendEmail) { const mod = await import('../../email'); deps.sendEmail = (a) => mod.sendAlertEmail(a); }
    email = await sendDailyReport(sessionDate, report, { store, sendEmail: deps.sendEmail, env: deps.env, log, now: deps.now }, { retryFailed: opts.retryFailedEmail });
  } else log(`email not requested for ${sessionDate} (pass --send-email to deliver)`);
  return { report, row, markdown, email };
}
