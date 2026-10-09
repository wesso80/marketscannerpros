// Fixture-only SQL verification. Refuses any host except loopback; uses a temporary table and rolls back.
const {Client}=require('pg');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const url=process.env.EDGE_COMPLETENESS_TEST_URL;
if(!url || !['127.0.0.1','localhost'].includes(new URL(url).hostname)) throw new Error('A loopback fixture database is required');
const db=new Client({connectionString:url});
(async()=>{await db.connect();try {
 await db.query('BEGIN');
 await db.query(`CREATE TEMP TABLE ai_signal_log (id int, workspace_id text, trade_bias text, regime text, outcome text, signal_at timestamptz, outcome_measured_at timestamptz, pct_move_24h numeric,price_at_signal numeric,price_after_24h numeric)`);
 const fix='2026-09-26T13:52:24Z';
 const fixtures=[
  ['correct',fix,2,'measured'],['wrong',fix,-2,'measured'],['neutral',fix,0,'measured'],
  ['pending',null,null,'pending'],['expired',null,null,'expired'],
  ['correct',null,2,'old_method'],['wrong','2026-09-01T00:00:00Z',-2,'old_method'],
  ['correct',fix,null,'invalid_move'],['correct',fix,101,'invalid_move'],
  [null,fix,2,'unknown'],['unrecognised',fix,2,'unknown'],['correct',fix,'NaN','invalid_move'],['correct',fix,100,'measured']
 ];
 for(let i=0;i<fixtures.length;i++){const [outcome,at,move]=fixtures[i];await db.query(`INSERT INTO ai_signal_log (id,workspace_id,trade_bias,regime,outcome,signal_at,outcome_measured_at,pct_move_24h) VALUES ($1,'operator-terminal','LONG','RANGE',$2,NOW()-INTERVAL '2 days',$3,$4)`,[i,outcome,at,move]);}
 await db.query(`INSERT INTO ai_signal_log (id,workspace_id,trade_bias,regime,outcome,signal_at,outcome_measured_at,pct_move_24h) VALUES (90,'private-user','LONG','RANGE','pending',NOW(),NULL,NULL),(91,'operator-terminal','NONE','RANGE','pending',NOW(),NULL,NULL),(92,'operator-terminal','LONG','RANGE','pending',NOW()-INTERVAL '400 days',NULL,NULL)`);
 const source=fs.readFileSync('app/api/admin/edge-check/route.ts','utf8');
 const template=source.match(/`SELECT ([\s\S]*?)ORDER BY signal_at ASC`/)[0].slice(1,-1);
 const evidenceSql=fs.readFileSync('lib/admin/verifiedOutcomes.ts','utf8').match(/export const EVIDENCE_SQL = `([\s\S]*?)`;/)[1];
 const sql=template.replace('${EVIDENCE_SQL}',evidenceSql).replace('${GROUP_SQL[by]}',"COALESCE(regime, 'unknown')").replace("${signedMoveSql('pct_move_24h')}","(CASE WHEN UPPER(trade_bias) = 'SHORT' THEN -pct_move_24h ELSE pct_move_24h END)");
 const result=await db.query(sql,[fix,90]);
 assert.equal(result.rowCount,fixtures.length);
 const actual={};for(const r of result.rows)actual[r.inclusion_status]=(actual[r.inclusion_status]||0)+1;
 const expected={};for(const f of fixtures)expected[f[3]]=(expected[f[3]]||0)+1;
 assert.deepEqual(actual,expected);
 const prior=await db.query(`SELECT COUNT(*)::int AS n FROM ai_signal_log WHERE workspace_id='operator-terminal' AND UPPER(trade_bias) IN ('LONG','SHORT') AND outcome IN ('correct','wrong','neutral') AND outcome_measured_at >= $1::timestamptz AND pct_move_24h IS NOT NULL AND ABS(pct_move_24h)<=100 AND signal_at > NOW()-($2::int*INTERVAL '1 day')`,[fix,90]);
 assert.equal(actual.measured,prior.rows[0].n);
 console.log('PASS: 13 classification fixtures; measured population matches prior SQL; workspace/direction/window exclusions preserved.');
}finally{await db.query('ROLLBACK');await db.end();}})().catch(e=>{console.error(e);process.exitCode=1;});
