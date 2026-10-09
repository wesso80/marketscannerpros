const {Client}=require('pg');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const url=process.env.OUTCOME_WRITER_TEST_URL;
if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw new Error('Loopback fixture database required');
const db=new Client({connectionString:url});
(async()=>{await db.connect();try{
 await db.query('BEGIN');
 await db.query(`CREATE TEMP TABLE ai_signal_log(id bigint, outcome text, outcome_measured_at timestamptz, lifecycle_state text, triggered_at timestamptz,target_1_hit_at timestamptz,stop_hit_at timestamptz,invalidated_at timestamptz,price_after_24h numeric,pct_move_24h numeric,price_after_24h_at timestamptz)`);
 await db.query(`INSERT INTO ai_signal_log(id,outcome,lifecycle_state) VALUES (1,'pending','DISCOVERED')`);
 const lc=fs.readFileSync('app/api/jobs/signal-lifecycle/route.ts','utf8').match(/`UPDATE ai_signal_log\s+SET lifecycle_state = \$2[\s\S]*?WHERE id = \$1`/)[0].slice(1,-1);
 const lab=fs.readFileSync('app/api/cron/label-ai-outcomes/route.ts','utf8').match(/`UPDATE ai_signal_log\s+SET outcome = \$1, price_after_24h = \$2, pct_move_24h = \$3, price_after_24h_at = \$5[\s\S]*?RETURNING id`/)[0].slice(1,-1);
 // Labeller completes after lifecycle read a pending/no-price snapshot, before its write.
 assert.equal((await db.query(lab,['correct',102,2,1,'2026-10-08T12:00:00Z'])).rowCount,1);
 await db.query(lc,[1,'EXPIRED','expired']);
 let r=(await db.query('SELECT * FROM ai_signal_log')).rows[0];
 assert.equal(r.outcome,'expired');assert.equal(Number(r.pct_move_24h),2);assert.ok(r.outcome_measured_at);
 assert.equal((await db.query(lab,['correct',102,2,1,'2026-10-08T12:00:00Z'])).rowCount,0);
 // Metadata update was unavailable: lifecycle sees an active state after neutral fixed-horizon measurement.
 await db.query("UPDATE ai_signal_log SET outcome='pending',lifecycle_state='DISCOVERED'");
 await db.query(lab,['neutral',100.5,0.5,1,'2026-10-08T12:00:00Z']);
 await db.query(lc,[1,'TARGET_1_HIT','correct']);
 r=(await db.query('SELECT * FROM ai_signal_log')).rows[0];
 assert.equal(r.outcome,'correct');assert.equal(Number(r.pct_move_24h),0.5);
 console.log('PASS: production SQL reproduces overwrite, retry exclusion, and neutral-to-correct methodology collision.');
}finally{await db.query('ROLLBACK');await db.end();}})().catch(e=>{console.error(e);process.exitCode=1;});
