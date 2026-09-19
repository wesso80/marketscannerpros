/**
 * Manual one-send verification: report-only + --send-email with a network trap that allows Resend only.
 *   npx tsx scripts/jarvis-send-verify.ts 2026-09-18
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const calls: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  calls.push(url);
  if (!/^https:\/\/api\.resend\.com\//.test(url)) throw new Error(`blocked non-Resend HTTP call: ${url}`);
  return realFetch(input, init);
}) as typeof fetch;

async function main() {
  const session = process.argv[2];
  const { generateDailyReport } = await import('../lib/jarvis/report/generateDailyReport');
  const { q } = await import('../lib/db');
  const before = (await q<any>(`SELECT id, report_version, email_status, email_sent_at, email_message_id FROM jarvis_daily_reports WHERE session_date = $1`, [session]))[0];
  const res = await generateDailyReport(session, { sendEmail: true }, { log: (m) => process.stderr.write(`[report] ${m}\n`) });
  const after = (await q<any>(`SELECT id, report_version, email_status, email_sent_at, email_message_id, email_error, (SELECT COUNT(*)::int FROM jarvis_daily_reports WHERE session_date = $1) AS rows_for_session FROM jarvis_daily_reports WHERE session_date = $1`, [session]))[0];
  const runs = (await q<any>(`SELECT COUNT(*)::int n FROM jarvis_runs WHERE kind = 'overnight'`))[0].n;
  console.log(JSON.stringify({
    httpCalls: calls.map((u) => u.replace(/\?.*$/, '')), alphaVantageCalls: calls.filter((u) => /alphavantage/.test(u)).length, coingeckoCalls: calls.filter((u) => /coingecko/.test(u)).length, resendCalls: calls.filter((u) => /resend/.test(u)).length,
    before, after, email: res.email, overnightRuns: runs,
  }, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
