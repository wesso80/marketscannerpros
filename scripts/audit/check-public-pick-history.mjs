// Isolated, in-memory PostgreSQL test. Never reads DATABASE_URL or connects to production.
// npm install --prefix /tmp/msp-sql-check @electric-sql/pglite
// PGLITE_PACKAGE=/tmp/msp-sql-check/node_modules/@electric-sql/pglite/dist/index.js node scripts/audit/check-public-pick-history.mjs
import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
const { PGlite } = await import(process.env.PGLITE_PACKAGE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec("SET TIME ZONE 'America/New_York'");
await db.exec(await readFile('migrations/008_daily_picks.sql','utf8'));
await db.exec(await readFile('migrations/009_daily_picks_rank_type.sql','utf8'));
const insert = `INSERT INTO daily_picks(asset_class,symbol,score,direction,price,scan_date,created_at,indicators)
 VALUES ('crypto',$1,70,'bullish',100,'2026-10-02','2026-10-03 00:40:00','{"data_as_of":"2026-10-03T00:00:00Z","run_id":"test-run"}')
 ON CONFLICT(asset_class,symbol,scan_date) DO NOTHING`;
await db.query(insert,['BTC']); // backfill must preserve existing publication
await db.exec(await readFile('migrations/114_public_daily_picks_history.sql','utf8'));
await db.query(insert,['ETH']); // trigger captures new publication
await db.query(insert,['ETH']); // rerun neither duplicates nor rewrites
const {rows}=await db.query('SELECT * FROM daily_picks_history ORDER BY symbol');
assert.equal(rows.length,2);
assert.equal(rows[0].run_id,'test-run');
assert.equal(rows[0].published_at.toISOString(),'2026-10-03T00:40:00.000Z');
assert.equal(rows[0].data_as_of.toISOString(),'2026-10-03T00:00:00.000Z');
assert.equal(rows[1].pick.price,100);
for(const sql of ['UPDATE daily_picks_history SET run_id=\'changed\'','DELETE FROM daily_picks_history','TRUNCATE daily_picks_history']) {
 await assert.rejects(db.exec(sql),/append-only/);
}
const before=rows[1].published_at.toISOString();
const restored=await db.query(`SELECT (jsonb_populate_record(NULL::daily_picks,pick)).* FROM daily_picks_history WHERE scan_date=$1::date AND symbol='ETH'`,['2026-10-02']);
assert.equal(restored.rows[0].price,'100.00000000');
const restoredTime = await db.query("SELECT ((jsonb_populate_record(NULL::daily_picks,pick)).created_at AT TIME ZONE 'UTC') AS published FROM daily_picks_history WHERE symbol='ETH'");
assert.equal(restoredTime.rows[0].published.toISOString(),before);
await db.close();
console.log('PASS: retained-row backfill, new-row trigger, duplicate protection, full-row date lookup, immutable publication time; UPDATE/DELETE/TRUNCATE refused.');
