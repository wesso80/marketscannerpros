// Executes the real admin route and its SQL against a rollback-only loopback fixture.
const {Client} = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const Module = require('node:module');
const {NextRequest} = require('next/server');
const url = process.env.COHORT_PANEL_TEST_URL;
if (!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Loopback fixture required');
const db = new Client({connectionString:url});
const cache = new Map();
function load(file) {
 if (cache.has(file)) return cache.get(file);
 const mod = new Module(path.resolve(file));
 mod.paths = Module._nodeModulePaths(process.cwd());
 const original = mod.require.bind(mod);
 mod.require = name => {
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
(async()=>{await db.connect();try {
 await db.query('BEGIN');
 await db.query(`CREATE TEMP TABLE ai_signal_log (
 id bigserial, workspace_id text, trade_bias text, signal_at timestamptz,
 price_at_signal numeric, price_after_24h numeric, outcome_measured_at timestamptz,
 outcome text, pct_move_24h numeric, regime text, decision_trace jsonb, asset_type text)`);
 const {GET}=load('app/api/admin/outcome-cohorts/route.ts');
 const run=async(scope,cohort='all')=>{const res=await GET(new NextRequest('http://localhost/api/admin/outcome-cohorts?scope='+scope+'&cohort='+cohort+'&days=7'));assert.equal(res.status,200);return res.json();};
 const signal=new Date(Date.now()-2*86400000).toISOString();
 const observed=new Date(new Date(signal).getTime()+86400000).toISOString();
 const processed=new Date(new Date(observed).getTime()+60000).toISOString();
 await db.query(`INSERT INTO ai_signal_log(workspace_id,trade_bias,signal_at,price_at_signal,price_after_24h,outcome_measured_at,outcome,pct_move_24h,regime,decision_trace,asset_type)
 VALUES ('operator-terminal','LONG',$1,100,102,$2,'correct',2,'RANGE','{"playbook":"A"}','equity')`,[signal,processed]);
 let result=await run('signals','verified');assert.equal(result.provenance.unknown,1);assert.equal(result.overall.records,0);
 await db.query('ALTER TABLE ai_signal_log ADD COLUMN outcome_provenance jsonb, ADD COLUMN price_after_24h_at timestamptz');
 const proof={writer:'label-ai-outcomes',method:'first-completed-close-v1',horizon:'24h',thresholdPct:1,direction:'LONG',signalAt:signal,entryPrice:100,observedPrice:102,observedAt:observed,processedAt:processed,barSource:'intraday',outcome:'correct',pctMove:2};
 await db.query('UPDATE ai_signal_log SET outcome_provenance=$1,price_after_24h_at=$2',[proof,observed]);
 // Unknown losing history, an inconsistent record, an admin-only source, and excluded records.
 async function clone(workspace,outcome,move,provenance,signalTime=signal,direction='LONG') {
  await db.query(`INSERT INTO ai_signal_log(workspace_id,trade_bias,signal_at,price_at_signal,price_after_24h,outcome_measured_at,outcome,pct_move_24h,regime,decision_trace,asset_type,outcome_provenance,price_after_24h_at)
  VALUES ($1,$2,$3,100,$4,$5,$6,$7,'RANGE','{"playbook":"A"}','equity',$8,$9)`,[workspace,direction,signalTime,100+move,processed,outcome,move,provenance,observed]);
 }
 await clone('operator-terminal','wrong',-2,null);
 await clone('operator-terminal','neutral',0,proof);
 await clone('admin-call:jarvis','correct',2,proof);
 await clone('other-user','correct',2,proof);
 await clone('operator-terminal','pending',2,proof);
 await clone('operator-terminal','correct',2,proof,new Date(Date.now()-8*86400000).toISOString());
 await clone('operator-terminal','correct',2,proof,signal,'NEUTRAL');
 for (const scope of ['signals','scorecard']) {
  result=await run(scope);assert.equal(result.overall.records,3);assert.equal(result.overall.directionalHitRate,50);
  assert.deepEqual(result.provenance,{cohort:'all',total:3,verified:1,unknown:1,inconsistent:1,selected:3});
  result=await run(scope,'verified');assert.equal(result.overall.records,1);assert.equal(result.overall.directionalHitRate,100);
  result=await run(scope,'unverified');assert.equal(result.overall.records,2);assert.equal(result.overall.directionalHitRate,0);
 }
 result=await run('backtest','verified');assert.equal(result.overall.records,2);assert.equal(result.groups.length,2);
 assert.equal(result.groups.some(g=>g.name==='JARVIS / EQUITY'),true);
 assert.equal(JSON.stringify(result).includes('provenance_evidence'),false);
 console.log('PASS: actual route/SQL on PostgreSQL; old schema, verified/unknown/inconsistent cohorts, workspace/window/direction/status isolation, source grouping and response projection.');
} finally {await db.query('ROLLBACK');await db.end();}})().catch(error=>{console.error(error);process.exitCode=1;});
