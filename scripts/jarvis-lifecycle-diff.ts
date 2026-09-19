/**
 * Diff the persisted jarvis_watchlist (DB) against a before-snapshot to prove genuine lifecycle transitions.
 *   npx tsx scripts/jarvis-lifecycle-diff.ts .jarvis-data/snapshot-before-sep18.json 2026-09-18
 * Read-only.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();
import { q } from '../lib/db';

async function main() {
  const [snapFile, session] = process.argv.slice(2);
  const before = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
  const beforeMap = new Map<string, any>(before.watchlist.map((w: any) => [w.key, w]));
  const after = await q<any>(`SELECT key, symbol, asset_class, status, first_seen::text AS first_seen, last_seen::text AS last_seen, sessions_seen, origin, state, updated_at FROM jarvis_watchlist ORDER BY key`);
  const afterMap = new Map<string, any>(after.map((w: any) => [w.key, w]));

  const newRows = after.filter((w: any) => !beforeMap.has(w.key));
  const removed = before.watchlist.filter((w: any) => !afterMap.has(w.key));
  const changed = after.filter((w: any) => beforeMap.has(w.key) && (beforeMap.get(w.key).status !== w.status || beforeMap.get(w.key).last_seen !== w.last_seen || JSON.stringify(beforeMap.get(w.key).state) !== JSON.stringify(w.state)));
  const unchanged = after.filter((w: any) => beforeMap.has(w.key) && !changed.includes(w));
  const statusChanged = changed.filter((w: any) => beforeMap.get(w.key).status !== w.status);

  console.log(`== jarvis_watchlist: before ${before.watchlist.length} (snapshot ${before.takenAt}) → after ${after.length} ==`);
  console.log(`new ${newRows.length} · updated ${changed.length} (status changed ${statusChanged.length}) · unchanged ${unchanged.length} · removed ${removed.length}`);
  const byStatus = (rows: any[]) => { const o: Record<string, number> = {}; for (const r of rows) o[r.status] = (o[r.status] ?? 0) + 1; return JSON.stringify(o); };
  console.log(`status counts before ${byStatus(before.watchlist)} → after ${byStatus(after)}`);

  // transitions recorded in persisted history for the session
  const trans: Record<string, number> = {};
  const examples: any[] = [];
  for (const w of after) {
    const h: any[] = w.state?.history ?? [];
    for (let i = 0; i < h.length; i++) {
      if (h[i].date !== session) continue;
      const from = i > 0 ? h[i - 1].status : null;
      if (from === h[i].status) continue;
      const k = `${from ?? 'NEW(first seen)'} → ${h[i].status}`;
      trans[k] = (trans[k] ?? 0) + 1;
      const prev = beforeMap.get(w.key);
      if (prev && from !== null) examples.push({ symbol: w.symbol, cls: w.asset_class, from, to: h[i].status, priorNote: prev.state?.history?.slice(-1)[0]?.note ?? prev.state?.note, priorMetrics: prev.state?.metrics, newNote: h[i].note, newMetrics: w.state?.metrics, trigger: w.state?.triggerLevel, inval: w.state?.invalidationLevel, firstSeen: w.first_seen, sessions: w.sessions_seen });
    }
  }
  console.log(`\n== transitions recorded in persisted history for ${session} ==`);
  for (const [k, v] of Object.entries(trans).sort((a, b) => b[1] - a[1])) console.log(`${k.padEnd(40)} ${v}`);
  console.log(`\n== examples of transitions from persisted Sep-17 rows (${examples.length}) ==`);
  const order: Record<string, number> = { CONFIRMED_MOVE: 0, NEAR_TRIGGER: 1, DEVELOPING: 2, DETERIORATING: 3, FAILED: 4, EXPIRED: 5 };
  examples.sort((a, b) => (order[a.to] ?? 9) - (order[b.to] ?? 9));
  const m = (x: any) => (x ? Object.entries(x).filter(([k]) => /price|ret1|volRatio|score|bbWidth|distToHi|rs|atr/i.test(k)).slice(0, 6).map(([k, v]) => `${k}=${typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2)) : v}`).join(' ') : 'n/a');
  for (const e of examples.slice(0, 40)) console.log(`${e.symbol} (${e.cls}) | ${e.from} → ${e.to} | seen ${e.sessions} since ${e.firstSeen} | trigger ${e.trigger ?? 'n/a'} inval ${e.inval ?? 'n/a'}\n   Sep17: ${String(e.priorNote).slice(0, 150)} [${m(e.priorMetrics)}]\n   ${session}: ${String(e.newNote).slice(0, 170)} [${m(e.newMetrics)}]`);

  const removedKeys = removed.map((r: any) => `${r.key}(${r.status})`).join(', ');
  if (removed.length) console.log(`\nremoved rows: ${removedKeys}`);
  const expired = after.filter((w: any) => w.status === 'EXPIRED' && beforeMap.get(w.key)?.status !== 'EXPIRED');
  console.log(`\nexpired this session: ${expired.length}${expired.length ? ' — ' + expired.map((w: any) => w.symbol).join(', ') : ''}`);
  const stale = after.filter((w: any) => w.last_seen !== session);
  console.log(`rows not touched this session (last_seen ≠ ${session}): ${stale.length}${stale.length ? ' — ' + stale.slice(0, 20).map((w: any) => `${w.symbol}:${w.status}`).join(', ') : ''}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
