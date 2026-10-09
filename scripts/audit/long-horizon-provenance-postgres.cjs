// Local isolated schema, real migrations and the labeller's real 6w/12w write statements. No provider calls.
const {Client}=require('pg');const fs=require('node:fs');const assert=require('node:assert/strict');
const url=process.env.OUTCOME_OWNERSHIP_TEST_URL;
if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw new Error('Loopback fixture database required');
const db=new Client({connectionString:url});const schema='long_horizon_fixture_'+process.pid;
const run=(file)=>db.query(fs.readFileSync('migrations/'+file,'utf8'));
(async()=>{await db.connect();try{
 await db.query('CREATE SCHEMA '+schema);await db.query('SET search_path TO '+schema);
 for(const file of ['048_ai_signal_log.sql','103_ai_signal_outcome_horizons.sql','105_ai_signal_outcome_6w_12w.sql'])await run(file);
 await assert.rejects(run('134_ai_outcome_long_horizon_provenance.sql'),/Apply migration 133/);await db.query('ROLLBACK').catch(()=>{});
 await db.query(`ALTER TABLE ai_signal_log ADD COLUMN IF NOT EXISTS lifecycle_state text DEFAULT 'DISCOVERED'`);
 const insert=async()=>(await db.query(`INSERT INTO ai_signal_log(workspace_id,symbol,regime,confluence_score,confidence,verdict,trade_bias,price_at_signal,stop_loss,target_1,outcome) VALUES ('fixture','AAPL','RANGE',50,50,'fixture','LONG',100,95,110,'pending') RETURNING id`)).rows[0].id;
 const historical=await insert();await db.query("UPDATE ai_signal_log SET outcome_6w='correct',pct_move_6w=3 WHERE id=$1",[historical]);
 await run('133_ai_outcome_ownership.sql');
 const m134=fs.readFileSync('migrations/134_ai_outcome_long_horizon_provenance.sql','utf8');await db.query(m134);await db.query(m134);
 let r=(await db.query('SELECT * FROM ai_signal_log WHERE id=$1',[historical])).rows[0];
 assert.equal(r.outcome_6w_provenance,null);assert.equal(r.outcome_12w_provenance,null);
 await db.query('UPDATE ai_signal_log SET pct_move_6w=4 WHERE id=$1',[historical]); // unknown history: unchanged behaviour, no backfill

 const source=fs.readFileSync('lib/outcomes/positionHorizonLabeller.ts','utf8');
 const tpl=(re)=>source.match(re)[0].slice(1,-1);
 const sql=(t,h)=>t.replaceAll('${h}',h).replaceAll('${prov}','outcome_'+h+'_provenance');
 const measuredT=tpl(/`UPDATE ai_signal_log\s+SET outcome_\$\{h\} = \$2,[\s\S]*?RETURNING id`/);
 const noDataT=tpl(/`UPDATE ai_signal_log\s+SET outcome_\$\{h\} = 'no_data',[\s\S]*?RETURNING id`/);
 const prov=(h,o)=>JSON.stringify({writer:'label-ai-outcomes',method:'daily-bar-horizon-v1',horizon:h,outcome:o});
 const measured=(h,id,o='correct')=>[id,o,104,'2026-09-20T20:00:00Z',4,111,99,11,-1,'target','2026-09-10',2,42,prov(h,o)];

 for(const h of ['6w','12w']){
  const id=await insert();
  assert.equal((await db.query(sql(measuredT,h),measured(h,id))).rowCount,1);
  assert.equal((await db.query(sql(measuredT,h),measured(h,id,'wrong'))).rowCount,0); // guarded: no relabel
  r=(await db.query('SELECT * FROM ai_signal_log WHERE id=$1',[id])).rows[0];
  assert.equal(r['outcome_'+h],'correct');assert.equal(r['outcome_'+h+'_provenance'].horizon,h);
  assert.equal(Date.parse(r['outcome_'+h+'_provenance'].processedAt),r['outcome_'+h+'_measured_at'].getTime());
  for(const change of [`outcome_${h}='wrong'`,`pct_move_${h}=99`,`r_multiple_${h}=5`,`first_hit_${h}='stop'`,`outcome_${h}_note='x'`,`outcome_${h}_provenance=NULL`,'stop_loss=90','target_1=120','price_at_signal=101',"trade_bias='SHORT'"])
   await assert.rejects(db.query(`UPDATE ai_signal_log SET ${change} WHERE id=$1`,[id]),new RegExp(`Verified ${h} outcome evidence is immutable`));
  await db.query("UPDATE ai_signal_log SET lifecycle_state='EXPIRED' WHERE id=$1",[id]); // unrelated columns stay writable
  const nd=await insert();
  assert.equal((await db.query(sql(noDataT,h),[nd,'daily history starts after the signal',prov(h,'no_data')])).rowCount,1);
  r=(await db.query('SELECT * FROM ai_signal_log WHERE id=$1',[nd])).rows[0];
  assert.equal(r['outcome_'+h],'no_data');assert.equal(r['outcome_'+h+'_provenance'].outcome,'no_data');
  await assert.rejects(db.query(`UPDATE ai_signal_log SET outcome_${h}=NULL WHERE id=$1`,[nd]),/immutable/);
  const bad=await insert();
  await assert.rejects(db.query(sql(measuredT,h),[bad,'correct','not-a-number',null,4,111,99,11,-1,'target',null,2,42,prov(h,'correct')]));
  r=(await db.query('SELECT * FROM ai_signal_log WHERE id=$1',[bad])).rows[0];
  assert.equal(r['outcome_'+h],null);assert.equal(r['outcome_'+h+'_provenance'],null);
 }
 // 6w evidence does not freeze the 12w horizon, and the 133 checks still hold after the function is replaced.
 const mixed=await insert();await db.query(sql(measuredT,'6w'),measured('6w',mixed));
 assert.equal((await db.query(sql(measuredT,'12w'),measured('12w',mixed,'wrong'))).rowCount,1);
 await db.query("UPDATE ai_signal_log SET outcome='neutral',outcome_measured_at=NOW(),outcome_provenance='{\"horizon\":\"24h\"}' WHERE id=$1",[mixed]);
 await assert.rejects(db.query("UPDATE ai_signal_log SET outcome='correct' WHERE id=$1",[mixed]),/Verified 24h outcome evidence is immutable/);
 console.log('PASS: 134 refuses without 133, real migrations (134 twice), unknown history untouched, atomic 6w/12w provenance (measured and no_data), guarded relabel, failed write leaves no provenance, 6w/12w immutability incl. stop/target, 24h check intact.');
}finally{await db.query('ROLLBACK').catch(()=>{});await db.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await db.end();}})().catch(e=>{console.error(e);process.exitCode=1;});
