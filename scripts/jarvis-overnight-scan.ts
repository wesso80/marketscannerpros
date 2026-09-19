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
// Shares the 600 RPM contract with production web (400) + worker (200): stay well inside it.
process.env.ALPHA_VANTAGE_RPM ??= '120';

const args = new Set(process.argv.slice(2));
const argValue = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const log = (m: string) => process.stderr.write(`[radar ${new Date().toISOString().slice(11, 19)}] ${m}\n`);
// JARVIS_NOW (ISO) overrides the wall clock for schedule-gate testing only; data fetches always use real time.
const clockNow = () => (process.env.JARVIS_NOW ? Date.parse(process.env.JARVIS_NOW) : Date.now());
let peakRss = process.memoryUsage().rss;
setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 2000).unref();

/** New-York wall clock pieces without any DST table: Intl handles the transition. */
function nyNow(nowMs: number) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(nowMs));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: (Number(g('hour')) % 24) * 60 + Number(g('minute')), weekday: g('weekday') };
}
const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

async function main() {
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
  const ny = nyNow(clockNow());
  if (process.env.JARVIS_NOW) log(`clock override JARVIS_NOW=${process.env.JARVIS_NOW} (NY ${ny.date} ${hhmm(ny.minutes)} ${ny.weekday}) — gate test only`);
  if (scheduled) {
    if (['Sat', 'Sun'].includes(ny.weekday)) { log(`scheduled: ${ny.weekday} in New York — no session, exit`); process.exit(0); }
    // Regular close 16:00 ET; allow 45–150 min for final prints, volume, provider updates.
    // Two UTC crons (21:15 / 22:15) straddle DST — exactly one lands in this window; the marker stops the other.
    if (ny.minutes < 16 * 60 + 45 || ny.minutes > 18 * 60 + 30) { log(`scheduled: NY ${hhmm(ny.minutes)} outside post-close window 16:45–18:30 — exit`); process.exit(0); }
    const marker = await kvGet<{ at: string }>(`run_marker:${ny.date}`);
    if (marker) { log(`scheduled: already ran for ${ny.date} at ${marker.at} — exit`); process.exit(0); }
    log(`scheduled: NY ${ny.date} ${hhmm(ny.minutes)} — running`);
    await kvSet(`run_marker:${ny.date}`, { at: new Date(nowMs).toISOString(), status: 'started' });
  }

  const { runOvernightScan } = await import('../lib/jarvis/radar/scan');
  const { report } = await runOvernightScan({ nowMs, log, cryptoTop: Number(process.env.JARVIS_CRYPTO_TOP ?? 250) });
  // Holiday / lag guard: if the freshest US bar is not today's NY date the session did not happen — keep the report but say so.
  if (scheduled && report.sessionDate !== ny.date) report.dataGaps.unshift(`Scheduled run on ${ny.date} but the latest US session is ${report.sessionDate} (holiday or provider lag) — equity content is from that earlier session`);
  const md = renderMorning(report);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(mdPath, md, 'utf8');
  const peakMb = Math.round(peakRss / 1048576);
  await saveRun({ runKey: report.sessionDate, generatedAt: report.generatedAt, sessionDate: report.sessionDate, kind: 'overnight', report, markdown: md, snapshot: report.snapshot, apiUsage: { av: report.apiUsage.alphaVantage, cg: report.apiUsage.coingecko, db: report.apiUsage.dbQueries, errors: report.apiUsage.errors, peakRssMb: peakMb, equityCap: Number(process.env.JARVIS_EQUITY_MAX ?? 900) }, runtimeMs: report.apiUsage.runtimeMs });
  if (scheduled) await kvSet(`run_marker:${ny.date}`, { at: new Date(nowMs).toISOString(), status: 'completed', sessionDate: report.sessionDate });
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
