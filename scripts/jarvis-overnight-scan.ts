/**
 * Private Jarvis — Overnight Opportunity Radar runner.
 *
 *   npm run jarvis:scan                       run now (owner, local)
 *   npm run jarvis:scan -- --scheduled        cron mode: only runs in the post-close window (America/New_York) once per session
 *   npm run jarvis:scan -- --refresh-crypto   lightweight pre-morning crypto refresh of the latest persisted run
 *   npm run jarvis:scan -- --report-only --session 2026-09-17 [--send-email] [--retry-email]
 *                                             build/persist the daily report from the persisted run (no market calls)
 *
 * Owner-only, read-only against market data, research-only. Writes reports/jarvis-morning.{md,json}
 * (git-ignored) and persists runs/watchlist to the private jarvis_* tables + .jarvis-data/ mirror.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();
// Shared ceiling is 540/min in lib/avLimiter.ts. This value is not a separate budget.
// Without Upstash on this process, takes stay on the local emergency cap.
process.env.ALPHA_VANTAGE_RPM ??= '120';

const args = new Set(process.argv.slice(2));
const argValue = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const log = (m: string) => process.stderr.write(`[radar ${new Date().toISOString().slice(11, 19)}] ${m}\n`);
// JARVIS_NOW (ISO) overrides the wall clock for schedule-gate testing only; data fetches always use real time.
const clockNow = () => (process.env.JARVIS_NOW ? Date.parse(process.env.JARVIS_NOW) : Date.now());
let peakRss = process.memoryUsage().rss;
setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 2000).unref();

const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

async function main() {
  // Not gated by ADMIN_DISCOVERY_ONLY: this run feeds the paid-customer MSP Radar daily report (/tools/msp-radar).
  const { renderMorning } = await import('../lib/jarvis/radar/render');
  const { saveRun, loadLatestRun, kvGet, kvSet } = await import('../lib/jarvis/radar/store');
  const dir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const mdPath = path.join(dir, 'jarvis-morning.md'), jsonPath = path.join(dir, 'jarvis-morning.json');
  const nowMs = Date.now();

  if (args.has('--report-only')) {
    const session = argValue('--session');
    if (!session || !/^\d{4}-\d{2}-\d{2}$/.test(session)) { log('--report-only requires --session YYYY-MM-DD'); process.exit(2); }
    const { generateDailyReport } = await import('../lib/jarvis/report/generateDailyReport');
    const res = await generateDailyReport(session, { sendEmail: args.has('--send-email'), retryFailedEmail: args.has('--retry-email') }, { log });
    fs.writeFileSync(path.join(dir, `jarvis-daily-${session}.md`), res.markdown, 'utf8');
    log(`daily report ${session}: status ${res.report.status}, health ${res.report.health.status}, db row #${res.row.id} v${res.row.reportVersion}, email ${res.email ? res.email.status : 'not requested'} → reports/jarvis-daily-${session}.md`);
    process.exit(0);
  }

  if (args.has('--refresh-crypto')) {
    const { refreshCrypto } = await import('../lib/jarvis/radar/refresh');
    const latest = await loadLatestRun();
    if (!latest) { log('no persisted overnight run to refresh'); process.exit(0); }
    const res = await refreshCrypto(latest.report, nowMs);
    const report = { ...latest.report, snapshot: { ...latest.report.snapshot, ...res.snapshotPatch } };
    const md = renderMorning(report, { at: new Date(nowMs).toISOString(), lines: res.lines });
    fs.writeFileSync(mdPath, md, 'utf8');
    fs.writeFileSync(jsonPath, JSON.stringify({ ...report, cryptoRefresh: { at: new Date(nowMs).toISOString(), lines: res.lines, material: res.material } }, null, 2), 'utf8');
    await saveRun({ runKey: `${latest.sessionDate}:refresh`, generatedAt: new Date(nowMs).toISOString(), sessionDate: latest.sessionDate, kind: 'crypto_refresh', report, markdown: md, snapshot: report.snapshot, apiUsage: {}, runtimeMs: Date.now() - nowMs });
    log(`crypto refresh done (${res.material ? 'MATERIAL changes' : 'no material change'}) → ${path.relative(process.cwd(), mdPath)}`);
    process.exit(0);
  }

  const scheduled = args.has('--scheduled');
  const { nyClock, scheduledRunDecision } = await import('../lib/jarvis/radar/scheduleGate');
  const ny = nyClock(clockNow());
  if (process.env.JARVIS_NOW) log(`clock override JARVIS_NOW=${process.env.JARVIS_NOW} (NY ${ny.date} ${hhmm(ny.minutes)} ${ny.weekday}) — gate test only`);
  if (scheduled) {
    const marker = await kvGet<{ at?: string; status?: string }>(`run_marker:${ny.date}`);
    const decision = scheduledRunDecision(ny, marker);
    if (!decision.run) {
      log(`scheduled: ${decision.reason} (NY ${ny.date} ${hhmm(ny.minutes)} ${ny.weekday}${marker?.at ? `, marker ${marker.at}` : ''}) — exit`);
      process.exit(0);
    }
    if (decision.reason === 'retry-incomplete') log(`scheduled: earlier run for ${ny.date} did not finish — retry`);
    else log(`scheduled: NY ${ny.date} ${hhmm(ny.minutes)} — running`);
    await kvSet(`run_marker:${ny.date}`, { at: new Date(nowMs).toISOString(), status: 'started' });
  }

  const { runOvernightScan } = await import('../lib/jarvis/radar/scan');
  const { runWithAvBudget } = await import('../lib/avLimiter');
  const { report } = await runWithAvBudget({ lane: 'backfill', feature: 'jarvis-overnight' }, () => runOvernightScan({ nowMs, log, cryptoTop: Number(process.env.JARVIS_CRYPTO_TOP ?? 250) }));
  // Holiday / lag guard: if the freshest US bar is not today's NY date the session did not happen — keep the report but say so.
  if (scheduled && report.sessionDate !== ny.date) report.dataGaps.unshift(`Scheduled run on ${ny.date} but the latest US session is ${report.sessionDate} (holiday or provider lag) — equity content is from that earlier session`);
  const md = renderMorning(report);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(mdPath, md, 'utf8');
  const peakMb = Math.round(peakRss / 1048576);
  await saveRun({ runKey: report.sessionDate, generatedAt: report.generatedAt, sessionDate: report.sessionDate, kind: 'overnight', report, markdown: md, snapshot: report.snapshot, apiUsage: { av: report.apiUsage.alphaVantage, cg: report.apiUsage.coingecko, db: report.apiUsage.dbQueries, errors: report.apiUsage.errors, peakRssMb: peakMb, equityCap: Number(process.env.JARVIS_EQUITY_MAX ?? 900) }, runtimeMs: report.apiUsage.runtimeMs });
  if (scheduled) await kvSet(`run_marker:${ny.date}`, { at: new Date(nowMs).toISOString(), status: 'completed', sessionDate: report.sessionDate });
  // Log the shortlist as admin calls for outcome labelling (best-effort; never touches scan results).
  try {
    const { recordJarvisShortlist } = await import('../lib/jarvis/radar/adminCalls');
    const logged = await recordJarvisShortlist(report);
    if (logged) log(`admin calls: ${logged.recorded} logged, ${logged.duplicates} already logged, skipped ${JSON.stringify(logged.skipped)}${logged.error ? ` · error ${logged.error}` : ''}`);
  } catch (e) { log(`admin call logging failed (scan results are intact): ${e instanceof Error ? e.message : String(e)}`); }
  log(`done → ${path.relative(process.cwd(), mdPath)} · AV ${report.apiUsage.alphaVantage} calls · CG ${report.apiUsage.coingecko} · errors ${report.apiUsage.errors} · ${(report.apiUsage.runtimeMs / 60000).toFixed(1)} min · peak RSS ${peakMb} MB`);
  // Daily report + delivery run AFTER the scan is fully persisted; any failure here is recorded and never touches scan results.
  try {
    const { generateDailyReport } = await import('../lib/jarvis/report/generateDailyReport');
    const res = await generateDailyReport(report.sessionDate, { sendEmail: scheduled || args.has('--send-email') }, { log });
    fs.writeFileSync(path.join(dir, `jarvis-daily-${report.sessionDate}.md`), res.markdown, 'utf8');
    log(`daily report: ${res.report.status} / ${res.report.health.status} · email ${res.email ? res.email.status : 'not requested'}`);
  } catch (e) { log(`daily report step failed (scan results are intact): ${e instanceof Error ? e.message : String(e)}`); }
  log(`universe ${report.counts.universe} · movers ${report.counts.meaningfulMovers} · unusual ${report.counts.unusual} · candidates ${report.counts.initialCandidates} · shortlist ${report.counts.finalShortlist}: ${report.shortlist.map((c) => `${c.symbol}(${c.status})`).join(', ')}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
