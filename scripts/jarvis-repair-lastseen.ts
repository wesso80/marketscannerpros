/**
 * One-off repair: advance lastSeen/sessionsSeen for watchlist rows that were evaluated in a session
 * (present in that session's persisted run snapshot) but whose bookkeeping was not advanced (pre-fix behaviour).
 *   npx tsx scripts/jarvis-repair-lastseen.ts 2026-09-18 [--apply]
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

async function main() {
  const [session, flag] = process.argv.slice(2);
  const apply = flag === '--apply';
  const { loadRunBySession, loadWatchlist, saveWatchlist } = await import('../lib/jarvis/radar/store');
  const run = await loadRunBySession(session);
  if (!run) throw new Error(`no persisted run for ${session}`);
  const universe = new Set(Object.keys(run.snapshot ?? {}));
  const wl = await loadWatchlist();
  const fix = wl.filter((e) => e.lastSeen < session && universe.has(e.key));
  const untouched = wl.filter((e) => e.lastSeen < session && !universe.has(e.key));
  console.log(`watchlist ${wl.length} rows · evaluated-but-stale ${fix.length} · genuinely unseen ${untouched.length} (${untouched.map((e) => e.symbol).join(', ')})`);
  for (const e of fix) console.log(`  ${e.key.padEnd(18)} ${e.status.padEnd(15)} lastSeen ${e.lastSeen} → ${session}, sessionsSeen ${e.sessionsSeen} → ${e.sessionsSeen + 1}`);
  if (!apply) { console.log('dry run — pass --apply to write'); process.exit(0); }
  for (const e of fix) { e.sessionsSeen += 1; e.lastSeen = session; }
  await saveWatchlist(wl);
  console.log(`applied to ${fix.length} rows`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
