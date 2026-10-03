import {it,expect} from 'vitest';
import {brierScore,bucketRows,logLossScore,probabilityBucket,scoreJevQuestions,type StampBag} from '@/lib/admin/jevProbability';
const pair=(p:number,y:0|1,value=y?1:-1)=>({p,y,value});
it('scores a perfect probability as zero Brier and a near-zero log loss, and a certain miss as Brier 1',()=>{
 expect(brierScore([pair(1,1),pair(0,0)])).toBe(0);
 expect(logLossScore([pair(1,1),pair(0,0)])).toBeLessThan(0.001);
 expect(brierScore([pair(1,0)])).toBe(1);
 expect(brierScore([])).toBeNull();
 expect(logLossScore([])).toBeNull();
 const base=brierScore([pair(0.25,1),pair(0.25,0),pair(0.25,0),pair(0.25,0)]);
 expect(base).toBeCloseTo(0.1875,6);
});
it('puts probabilities in the five fixed buckets, with 1.0 in the top bucket and the boundaries on the upper side',()=>{
 expect(probabilityBucket(0)).toBe('0-0.2');
 expect(probabilityBucket(0.199)).toBe('0-0.2');
 expect(probabilityBucket(0.2)).toBe('0.2-0.4');
 expect(probabilityBucket(0.4)).toBe('0.4-0.6');
 expect(probabilityBucket(0.6)).toBe('0.6-0.8');
 expect(probabilityBucket(0.8)).toBe('0.8-1.0');
 expect(probabilityBucket(1)).toBe('0.8-1.0');
 expect(probabilityBucket(-0.01)).toBeNull();
 expect(probabilityBucket(1.01)).toBeNull();
 const rows=bucketRows([pair(0.1,0,-2),pair(0.1,1,2),pair(0.9,1,4),pair(1,0,-4)]);
 expect(rows.map(r=>r.bucket)).toEqual(['0-0.2','0.2-0.4','0.4-0.6','0.6-0.8','0.8-1.0']);
 expect(rows[0]).toMatchObject({n:2,favorable:0.5,meanOutcome:0});
 expect(rows[1].n).toBe(0);
 expect(rows[4]).toMatchObject({n:2,favorable:0.5,meanOutcome:0});
 expect(rows[4].meanP).toBeCloseTo(0.95,6);
});
it('scores each stored Jev question against the graded outcome and skips unscored stamps',()=>{
 const jev={status:'scored',chase:0.9,flowAgrees:0.1,btcHeadwind:0.6};
 const rows:StampBag[]=[
  {outcome:'paperR',value:1,jev},
  {outcome:'paperR',value:-1,jev:{status:'scored',chase:0.1,flowAgrees:0.8,btcHeadwind:0.2}},
  {outcome:'paperR',value:1,jev:{status:'unavailable',chase:null}},
  {outcome:'forward24h',value:3,chart:{status:'scored',cleanBase:0.7,strongClose:0.7,volumeExpansion:0.7,overheadSupply:0.2}},
  {outcome:'forward24h',value:-1,catalyst:{status:'no-headlines',listingNews:null}},
 ];
 const report=scoreJevQuestions(rows);
 const chase=report.questions.find(q=>q.id==='jev.chase'&&q.outcome==='paperR')!;
 expect(chase.n).toBe(2);
 expect(chase.positives).toBe(1);
 expect(chase.brier).toBeCloseTo(((0.9-1)**2+(0.1-0)**2)/2,6);
 expect(chase.logLoss).toBeGreaterThan(0);
 expect(chase.buckets.find(b=>b.bucket==='0.8-1.0')).toMatchObject({n:1,favorable:1,meanOutcome:1});
 expect(chase.buckets.find(b=>b.bucket==='0-0.2')).toMatchObject({n:1,favorable:0,meanOutcome:-1});
 expect(report.questions.some(q=>q.id==='chart.cleanBase'&&q.outcome==='forward24h'&&q.n===1)).toBe(true);
 expect(report.questions.some(q=>q.module==='catalyst')).toBe(false);
 expect(report.definition).toMatch(/strictly positive/);
 expect(JSON.stringify(report)).not.toMatch(/win ?rate/i);
});
