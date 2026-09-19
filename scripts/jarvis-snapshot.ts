/**
 * Snapshot jarvis_watchlist + jarvis_runs + jarvis_daily_reports from the DB (authoritative) for before/after diffs.
 *   npx tsx scripts/jarvis-snapshot.ts <label>
 * Writes .jarvis-data/snapshot-<label>.json (git-ignored). Read-only.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();
import { q } from '../lib/db';

async function main() {
  const label = process.argv[2] ?? new Date().toISOString().replace(/[:.]/g, '-');
  const watchlist = await q<any>(`SELECT key, symbol, asset_class, status, first_seen::text AS first_seen, last_seen::text AS last_seen, sessions_seen, origin, state, updated_at FROM jarvis_watchlist ORDER BY key`);
  const runs = await q<any>(`SELECT run_key, kind, session_date::text AS session_date, generated_at, runtime_ms, api_usage, report->'counts' AS counts FROM jarvis_runs ORDER BY generated_at`);
  const reports = await q<any>(`SELECT id, session_date::text AS session_date, run_id, report_version, status, health_status, email_status, generated_at, updated_at FROM jarvis_daily_reports ORDER BY session_date`);
  const markers = await q<any>(`SELECT key, value FROM jarvis_kv WHERE key LIKE 'run_marker:%'`);
  const out = { takenAt: new Date().toISOString(), watchlist, runs, reports, markers };
  fs.mkdirSync('.jarvis-data', { recursive: true });
  const file = path.join('.jarvis-data', `snapshot-${label}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
  console.log(`${file}: watchlist ${watchlist.length} rows, runs ${runs.length}, reports ${reports.length}, markers ${markers.length}`);
  const byStatus: Record<string, number> = {};
  for (const w of watchlist) byStatus[w.status] = (byStatus[w.status] ?? 0) + 1;
  console.log('watchlist by status:', JSON.stringify(byStatus));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
