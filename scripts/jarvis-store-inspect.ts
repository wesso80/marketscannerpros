/**
 * Inspect the private Jarvis store (owner-only): runs, watchlist, markers.
 *   npx tsx scripts/jarvis-store-inspect.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();
import { q } from '../lib/db';

async function main() {
  const runs = await q<any>(`SELECT run_key, kind, session_date::text AS session_date, generated_at, runtime_ms, api_usage, (report->'counts') AS counts FROM jarvis_runs ORDER BY generated_at DESC LIMIT 10`);
  console.log('== jarvis_runs ==');
  for (const r of runs) console.log(`${r.run_key.padEnd(20)} ${r.kind.padEnd(15)} session ${r.session_date} generated ${new Date(r.generated_at).toISOString()} runtime ${(r.runtime_ms / 60000).toFixed(1)}m api ${JSON.stringify(r.api_usage)} universe ${r.counts?.universe} shortlist ${r.counts?.finalShortlist}`);
  const wl = await q<any>(`SELECT key, status, first_seen::text AS first_seen, last_seen::text AS last_seen, sessions_seen, origin, state->>'note' AS note, jsonb_array_length(state->'history') AS transitions FROM jarvis_watchlist ORDER BY status, symbol`);
  console.log(`\n== jarvis_watchlist (${wl.length} rows) ==`);
  for (const w of wl) console.log(`${w.key.padEnd(18)} ${w.status.padEnd(15)} first ${w.first_seen} last ${w.last_seen} seen ${w.sessions_seen} transitions ${w.transitions} [${w.origin}] ${String(w.note).slice(0, 90)}`);
  const kv = await q<any>(`SELECT key, value, updated_at FROM jarvis_kv WHERE key LIKE 'run_marker:%' ORDER BY key`);
  console.log(`\n== run markers (${kv.length}) ==`);
  for (const k of kv) console.log(`${k.key} ${JSON.stringify(k.value)}`);
  const ov = await q<any>(`SELECT COUNT(*)::int n, MAX(fetched_at) newest FROM company_overview`);
  console.log(`\ncompany_overview rows: ${ov[0].n} (newest ${ov[0].newest ? new Date(ov[0].newest).toISOString() : 'n/a'})`);
  const reports = await q<any>(`SELECT id, session_date::text AS session_date, run_id, report_version, status, health_status, headline, generated_at, email_status, email_sent_at, email_message_id, email_error, length(report_markdown) AS md_len, pg_column_size(report_json) AS json_bytes, created_at, updated_at FROM jarvis_daily_reports ORDER BY session_date DESC LIMIT 10`);
  console.log(`\n== jarvis_daily_reports (${reports.length}) ==`);
  for (const r of reports) console.log(`#${r.id} ${r.session_date} run ${r.run_id} v${r.report_version} ${r.status}/${r.health_status} email ${r.email_status}${r.email_sent_at ? ' sent ' + new Date(r.email_sent_at).toISOString() : ''}${r.email_message_id ? ' id ' + r.email_message_id : ''}${r.email_error ? ' err ' + r.email_error : ''} md ${r.md_len}ch json ${r.json_bytes}B created ${new Date(r.created_at).toISOString()} updated ${new Date(r.updated_at).toISOString()}\n   ${r.headline}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
