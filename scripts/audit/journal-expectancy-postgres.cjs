// Executes the real admin route and its SQL against a rollback-only loopback fixture.
const {Client} = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const Module = require('node:module');
const {NextRequest} = require('next/server');
const url = process.env.JOURNAL_EXPECTANCY_TEST_URL;
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
 await db.query(`CREATE TEMP TABLE journal_entries(workspace_id text,is_open boolean,exit_date date,trade_date date,symbol text,strategy text,setup text,trade_type text,r_multiple numeric,dynamic_r numeric,normalized_r numeric,pl numeric,outcome text)`);
 async function insert(symbol,r,dynamic=null,normalized=null,pnl=null,outcome=null,workspace='owner',open=false,age=0){
 await db.query(`INSERT INTO journal_entries VALUES($1,$2,CURRENT_DATE-$3::int,CURRENT_DATE-$3::int,$4,'P',NULL,NULL,$5,$6,$7,$8,$9)`,[workspace,open,age,symbol,r,dynamic,normalized,pnl,outcome]);}
 await insert('A',2,null,null,10,'win');await insert('A',null);await insert('A',0,null,null,0,'neutral');
 await insert('B',null,-1,null,-5,'loss');await insert('B',null,null,3,5,'win');
 await insert('C','NaN',9);await insert('C','Infinity');await insert('C',-2,null,null,5,'win');
 await insert('X',100,null,null,null,null,'other');await insert('X',100,null,null,null,null,'owner',true);await insert('X',100,null,null,null,null,'owner',false,91);
 // More than 40 groups: neither total population nor candidate ranking is truncated first.
 for(let i=0;i<42;i++){await insert('G'+i,1);await insert('G'+i,1);}
 const {loadJournalExpectancy,JOURNAL_EXPECTANCY_SQL}=load('lib/admin/journalExpectancy.ts');
 const rows=(await db.query(JOURNAL_EXPECTANCY_SQL,['owner'])).rows;
 const all=rows.find(r=>r.kind==='overall'),a=rows.find(r=>r.kind==='symbol'&&r.key==='A'),b=rows.find(r=>r.kind==='symbol'&&r.key==='B');
 assert.equal(all.sample,92);assert.equal(all.valid_r_count,89);assert.equal(all.missing_r_count,1);assert.equal(all.invalid_r_count,2);assert.equal(all.conflicts,1);
 assert.equal(a.avg_r,1);assert.equal(a.valid_r_count,2);assert.equal(a.sample,3);assert.equal(a.wins,1);
 assert.equal(b.dynamic_r_count,1);assert.equal(b.normalized_r_count,1);assert.equal(b.avg_r,1);
 const result=await loadJournalExpectancy('owner');assert.equal(result.sampleTrades,92);assert.equal(result.validRCount,89);assert.equal(result.status,'available');
 const empty=await loadJournalExpectancy('empty');assert.equal(empty.sampleTrades,0);assert.equal(empty.status,'available');
 console.log('PASS: actual journal SQL/loader; missing vs zero R, nonfinite exclusion without fallback, source and conflict counts, >40 groups, workspace/open/date isolation, empty history.');
}finally{await db.query('ROLLBACK');await db.end();}})().catch(error=>{console.error(error);process.exitCode=1;});
