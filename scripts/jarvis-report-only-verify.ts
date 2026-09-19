/**
 * Verification wrapper: run the report-only path with every outbound HTTP call trapped.
 * Any fetch() proves a provider call and fails loudly. DB (pg over TCP, not fetch) is allowed.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

let fetchCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any) => { fetchCalls += 1; throw new Error(`HTTP call during report-only: ${typeof input === 'string' ? input : input?.url}`); }) as typeof fetch;

async function main() {
  const session = process.argv[2];
  const { generateDailyReport } = await import('../lib/jarvis/report/generateDailyReport');
  const { q } = await import('../lib/db');
  const before = await q<any>(`SELECT id, report_version, email_status FROM jarvis_daily_reports WHERE session_date = $1`, [session]);
  const res = await generateDailyReport(session, { sendEmail: false }, { log: (m) => process.stderr.write(`[report] ${m}\n`) });
  const after = await q<any>(`SELECT id, report_version, email_status, (SELECT COUNT(*)::int FROM jarvis_daily_reports WHERE session_date = $1) AS rows_for_session FROM jarvis_daily_reports WHERE session_date = $1`, [session]);
  const runs = await q<any>(`SELECT COUNT(*)::int n, MAX(generated_at) newest FROM jarvis_runs WHERE kind = 'overnight'`);
  console.log(JSON.stringify({ session, fetchCalls, before: before[0], after: after[0], status: res.report.status, health: res.report.health.status, email: res.email, overnightRuns: runs[0].n, newestRun: new Date(runs[0].newest).toISOString() }, null, 2));
  globalThis.fetch = realFetch;
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
