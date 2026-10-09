// Executes the real admin route and its SQL against a rollback-only loopback fixture.
const {Client} = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const Module = require('node:module');
const {NextRequest} = require('next/server');
const url = process.env.EXPECTANCY_SHADOW_TEST_URL;
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
(async()=>{await db.connect();try{
 await db.query('BEGIN');
 await db.query(`CREATE TEMP TABLE ai_signal_log(id bigserial,workspace_id text,symbol text,trade_bias text,signal_at timestamptz,price_at_signal numeric,price_after_24h numeric,outcome_measured_at timestamptz,outcome text,pct_move_24h numeric(10,4),decision_trace jsonb,outcome_provenance jsonb,price_after_24h_at timestamptz)`);
 const signal=new Date(Date.now()-2*86400000).toISOString(),observed=new Date(Date.now()-86400000).toISOString(),processed=new Date().toISOString();
 const proof={writer:'label-ai-outcomes',method:'first-completed-close-v1',horizon:'24h',thresholdPct:1,direction:'LONG',signalAt:signal,entryPrice:100,observedPrice:102,observedAt:observed,processedAt:processed,barSource:'intraday',outcome:'correct',pctMove:2};
 async function add(symbol,playbook,count,known,move=2,direction='LONG',workspace='operator-terminal',age=2){
 await db.query(`INSERT INTO ai_signal_log(workspace_id,symbol,trade_bias,signal_at,price_at_signal,price_after_24h,outcome_measured_at,outcome,pct_move_24h,decision_trace,outcome_provenance,price_after_24h_at)
 SELECT $1,$2,$3,$4,100,100+$5::numeric,$6,CASE WHEN $5>0 THEN 'correct' ELSE 'wrong' END,$5,jsonb_build_object('playbook',$7::text),$8,$9 FROM generate_series(1,$10::int)`,[workspace,symbol,direction,age===2?signal:new Date(Date.now()-age*86400000).toISOString(),move,processed,playbook,known?proof:null,observed,count]);}
 await add('AAPL','P',30,true);await add('AAPL','P',10,false,-1);await add('OTHER','P',5,true);await add('AAPL','OtherKey',5,false,1.23456);await add('AAPL','P',1,false,3,'UNKNOWN');
 await add('AAPL','P',50,true,2,'LONG','other-workspace');await add('AAPL','P',50,true,2,'LONG','operator-terminal',121);
 const {GET}=load('app/api/admin/expectancy-shadow/route.ts');
 const {enrichHitsWithExpectancy}=load('lib/admin/expectancy.ts');
 const res=await GET(new NextRequest('http://localhost/api/admin/expectancy-shadow?symbol=AAPL&playbook=P&baseScore=60'));assert.equal(res.status,200);const result=await res.json();
 const [live]=await enrichHitsWithExpectancy([{symbol:'AAPL',playbook:'P',eliteScore:60}]);
 assert.equal(result.current.scoreBoost,live.expectancy.scoreBoost);assert.equal(result.current.hypotheticalEliteScore,live.eliteScore);assert.equal(result.current.blendedAvgMovePct,live.expectancy.blendedAvgMovePct);
 assert.deepEqual(result.current.symbol,live.expectancy.symbol);assert.deepEqual(result.current.playbook,live.expectancy.playbook);
 assert.equal(result.current.uniqueRecords,51);assert.equal(result.current.overlap,41);assert.equal(result.unrecognizedDirections,1);assert.equal(result.verified.uniqueRecords,35);
 // Only mutate transaction-local fixture rows, then run the unchanged live function on verified-only history.
 await db.query('DELETE FROM ai_signal_log WHERE outcome_provenance IS NULL');
 const [verified]=await enrichHitsWithExpectancy([{symbol:'AAPL',playbook:'P',eliteScore:60}]);
 assert.equal(result.verified.scoreBoost,verified.expectancy.scoreBoost);assert.equal(result.verified.hypotheticalEliteScore,verified.eliteScore);assert.deepEqual(result.verified.symbol,verified.expectancy.symbol);assert.deepEqual(result.verified.playbook,verified.expectancy.playbook);
 assert.equal(JSON.stringify(result).includes('provenance_evidence'),false);
 console.log('PASS: real route and PostgreSQL parity with unchanged live expectancy for both cohorts; overlap, rounding, window/workspace isolation, unknown direction and projection.');
}finally{await db.query('ROLLBACK');await db.end();}})().catch(error=>{console.error(error);process.exitCode=1;});
