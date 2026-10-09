/** Isolated regression: ADMIN_AUDIT_TEST_DATABASE_URL must name a local disposable database.
 * Run with node scripts/audit/scanner-audit-postgres.cjs. Requires pg and typescript.
 * Compiles the actual helper, substitutes only DB transport, Redis and calibration metadata,
 * and executes every generated SELECT in a PostgreSQL READ ONLY transaction.
 */
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { Client } = require('pg');
const url = new URL(process.env.ADMIN_AUDIT_TEST_DATABASE_URL || '');
assert.equal(url.hostname, '127.0.0.1', 'Local fixture only');
assert.equal(url.pathname, '/msp_scanner_audit_test', 'Dedicated fixture database only');
const client = new Client({ connectionString: url.href });
const file = resolve(__dirname, '../../lib/admin/scannerDataAudit.ts');
const sqls = [];
const mocks = {
  '@/lib/db': { q: async (sql, args) => {
    assert.match(sql.trim(), /^SELECT\b/i);
    sqls.push(sql);
    return (await client.query(sql, args)).rows;
  } },
  '@/lib/redis': { getRedis: () => null },
  '@/lib/scoring/canonical/calibrationData': { CALIBRATION_META: { version: 'fixture', generated: 'fixture', horizonBars: 20 } },
};
const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, { exports: exportsObject, require: name => {
  assert.ok(name in mocks, `Unexpected dependency: ${name}`); return mocks[name];
}, Date, console }, { filename: file });
async function main() {
  await client.connect();
  try {
    // Only connection-local temporary tables are created; no production schema is used.
    await client.query(`CREATE TEMP TABLE symbol_universe(symbol text PRIMARY KEY, asset_type text, enabled boolean);
      CREATE TEMP TABLE ohlcv_bars(symbol text, timeframe text, ts timestamptz, volume numeric);
      CREATE TEMP TABLE cg_hist_daily(coin_id text, day date);
      INSERT INTO symbol_universe VALUES ('EQ_DAILY','equity',true),('EQ_INTRADAY','equity',true),
        ('EQ_EMPTY','equity',true),('EQ_DISABLED','equity',false),('BTC','crypto',true);
      INSERT INTO ohlcv_bars VALUES ('EQ_DAILY','daily','2026-10-01',10),('EQ_DAILY','daily','2026-10-02',0),
        ('EQ_INTRADAY','15m','2026-10-02',20),('BTC','daily','2026-10-02',30);
      INSERT INTO cg_hist_daily VALUES ('bitcoin','2026-10-01'),('bitcoin','2026-10-02');`);
    await client.query('BEGIN READ ONLY');
    const report = await exportsObject.scannerDataAudit(true);
    assert.equal(sqls.length, 4);
    const eq = report.universe.find(r => r.asset === 'equity');
    assert.equal(eq.enabled, 3);
    assert.equal(eq.withoutBars, 2, 'Intraday-only and absent history both lack daily bars');
    assert.equal(report.universe.find(r => r.asset === 'crypto').withoutBars, 0);
    assert.equal(report.assets.find(r => r.asset === 'equity').bars, 2);
    assert.equal(report.cryptoHistory.coins, 1);
    assert.equal(report.cryptoHistory.days, 2);
    assert.equal(report.timeframes.find(r => r.timeframe === '15m').rows, 1);
    assert.ok(report.findings.some(s => s.includes('2 of 3 enabled scanner symbols')));
    // Prove the exact original alias causes the observed production error on this engine.
    const universeSql = sqls.find(s => s.includes('without_bars'));
    assert.ok(universeSql);
    await client.query('SAVEPOINT old_alias');
    await assert.rejects(client.query(universeSql.replace('AS without_bars', 'without')),
      e => e.code === '42601' && /without/.test(e.message));
    await client.query('ROLLBACK TO SAVEPOINT old_alias');
    await client.query('ROLLBACK');
    console.log('PASS: all four helper SELECTs run on PostgreSQL; daily-history counts correct; original alias reproduces 42601.');
  } finally { await client.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
