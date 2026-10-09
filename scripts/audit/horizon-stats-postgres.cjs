// Executes the real admin route and its SQL against a rollback-only loopback fixture.
const {Client} = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const Module = require('node:module');
const {NextRequest} = require('next/server');
const url = process.env.HORIZON_STATS_TEST_URL;
if (!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Loopback fixture required');
const db = new Client({connectionString:url});
const cache = new Map();
function load(file) {
 if (cache.has(file)) return cache.get(file);
 const mod = new Module(path.resolve(file));
 mod.paths = Module._nodeModulePaths(process.cwd());
 const original = mod.require.bind(mod);
 mod.require = name => {
  if (name === '@/lib/outcomes/positionHorizonLabeller') return {detectPositionHorizons:async()=>['6w','12w'],POSITION_MIGRATION_FILE:'fixture'};
  if (name === '@/lib/adminAuth') return {requireAdmin:async()=>({ok:true})};
  if (name === '@/lib/db') return {q:async(sql,params)=>(await db.query(sql,params)).rows};
  if (name === '@/lib/admin/errorResponse') return {adminErrorText:()=> 'fixture error'};
  if (name.startsWith('@/')) return load(name.slice(2)+'.ts');
  if (name.startsWith('./')) return load(path.join(path.dirname(file),name+'.ts'));
  return original(name);
 };
 mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,path.resolve(file));
 cache.set(file,mod.exports);return mod.exports;
}
(async()=>{await db.connect();try{
 await db.query('BEGIN');
 await db.query(`CREATE TEMP TABLE ai_signal_log(workspace_id text, trade_bias text, asset_type text, price_at_signal numeric, signal_at timestamptz, decision_trace jsonb)`);
 for(const h of ['6w','12w']) {
  await db.query(`ALTER TABLE ai_signal_log ADD COLUMN outcome_${h} text, ADD COLUMN pct_move_${h} numeric, ADD COLUMN r_multiple_${h} numeric, ADD COLUMN first_hit_${h} text, ADD COLUMN mfe_pct_${h} numeric, ADD COLUMN mae_pct_${h} numeric`);
 }
 await db.query(`INSERT INTO ai_signal_log(workspace_id,trade_bias,asset_type,price_at_signal,signal_at,decision_trace)
 SELECT 'operator-terminal','LONG','equity',100,NOW()-INTERVAL '100 days','{"playbook":"SPARSE"}'::jsonb FROM generate_series(1,10)`);
 await db.query(`INSERT INTO ai_signal_log(workspace_id,trade_bias,asset_type,price_at_signal,signal_at,decision_trace)
 SELECT 'operator-terminal',' short ','equity',100,NOW()-INTERVAL '100 days','{"playbook":"SHORT"}'::jsonb FROM generate_series(1,10)`);
 for(const h of ['6w','12w']) {
  await db.query(`UPDATE ai_signal_log SET outcome_${h}='correct',r_multiple_${h}='NaN' WHERE trade_bias='LONG'`);
  await db.query(`UPDATE ai_signal_log SET pct_move_${h}=5,r_multiple_${h}=2,mfe_pct_${h}=8,mae_pct_${h}=-2 WHERE ctid=(SELECT ctid FROM ai_signal_log WHERE trade_bias='LONG' LIMIT 1)`);
  await db.query(`UPDATE ai_signal_log SET outcome_${h}='correct',pct_move_${h}=-2,r_multiple_${h}=0,mfe_pct_${h}=0,mae_pct_${h}=0 WHERE trade_bias=' short '`);
 }
 const {loadPositionHorizonStats}=load('lib/admin/positionHorizonStats.ts');
 const result=await loadPositionHorizonStats();assert.equal(result.available,true);
 for(const block of result.horizons) {
  const sparse=block.bySetup.find(x=>x.setup==='SPARSE');const short=block.bySetup.find(x=>x.setup==='SHORT');
  assert.equal(sparse.measured,10);assert.equal(sparse.returnCount,1);assert.equal(sparse.avgReturnPct,null);assert.equal(sparse.rCount,1);assert.equal(sparse.avgR,null);assert.equal(sparse.mfeCount,1);assert.equal(sparse.avgMfePct,null);
  assert.equal(short.returnCount,10);assert.equal(short.avgReturnPct,2);assert.equal(short.avgR,0);assert.equal(short.avgMfePct,0);assert.equal(short.avgMaePct,0);
 }
 console.log('PASS: actual 6w/12w aggregation on PostgreSQL; sparse denominators, NaN R exclusion, normalized SHORT sign and zero averages.');
}finally{await db.query('ROLLBACK');await db.end();}})().catch(error=>{console.error(error);process.exitCode=1;});
