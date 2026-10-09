import {describe,expect,it} from 'vitest';
import {clusteredMean} from '@/lib/admin/overlapUncertainty';
import {meanInterval, summariseGroup} from '@/lib/admin/edgeCheck';
const origin=Date.parse('2026-01-01T00:00:00Z');
const row=(day:number,move:number)=>({signalAt:new Date(origin+day*86400000).toISOString(),signedMove:move});

describe('overlap uncertainty',()=>{
 it('matches a hand-computed cluster variance and is wider than the independent estimate for repeated daily shocks',()=>{
  const rows=Array.from({length:30},(_,i)=>Array.from({length:10},()=>row(i,i%2?1:-1))).flat();
  const result=clusteredMean(rows,0.2,1);
  const radius=1.96*Math.sqrt(1/29);
  expect(result).toMatchObject({blocks:30,signals:300,largestBlock:10,status:'available'});
  expect(result.mean).toBeCloseTo(-0.2,10);
  expect(result.low).toBeCloseTo(-0.2-radius,10);
  expect(result.high).toBeCloseTo(-0.2+radius,10);
  const naive=meanInterval(rows.map(r=>r.signedMove-0.2))!;
  expect(result.high!-result.low!).toBeGreaterThan(naive.high-naive.low);
 });
 it('does not gain precision by duplicating every signal within the same blocks',()=>{
  const rows=Array.from({length:30},(_,i)=>row(i,i%2?1:-1));
  const a=clusteredMean(rows,0.2,1),b=clusteredMean(rows.flatMap(r=>[r,r,r,r]),0.2,1);
  expect(b.low).toBeCloseTo(a.low!,10);expect(b.high).toBeCloseTo(a.high!,10);
  expect(b.blocks).toBe(a.blocks);expect(b.signals).toBe(120);
 });
 it('preserves signal weighting when cluster sizes differ',()=>{
  const rows=[row(0,3),row(0,3),row(0,3),...Array.from({length:29},(_,i)=>row(i+1,1))];
  const mean=38/32;
  const se=Math.sqrt(30/29*((3*(3-mean))**2+29*(1-mean)**2)/32**2);
  const a=clusteredMean(rows,0,1);
  expect(a.mean).toBeCloseTo(mean,12);expect(a.low).toBeCloseTo(mean-1.96*se,12);
 });
 it('withholds short histories even with many rows, and treats week blocks separately',()=>{
  const rows=Array.from({length:30},(_,i)=>row(i,1));
  expect(clusteredMean(rows.slice(0,29),0.2,1)).toMatchObject({status:'insufficient_blocks',low:null,high:null});
  expect(clusteredMean(rows,0.2,7)).toMatchObject({blocks:5,status:'insufficient_blocks',low:null,high:null});
  expect(clusteredMean(Array.from({length:1000},()=>row(0,1)),0.2,1).blocks).toBe(1);
 });
 it('uses fixed UTC boundaries, reports exclusions and handles empty data',()=>{
  const rows=[{signalAt:'2026-01-01T23:30:00-02:00',signedMove:1},row(1,1),{signalAt:'bad',signedMove:1},row(2,NaN),row(2,101)];
  expect(clusteredMean(rows,0.2,1)).toMatchObject({blocks:1,signals:2,excluded:3,largestBlock:2});
  expect(clusteredMean([],0.2,7)).toMatchObject({blocks:0,signals:0,mean:null,low:null,high:null});
 });
 it('attaches both sensitivity estimates to the same group without changing its mean',()=>{
  const rows=Array.from({length:220},(_,i)=>({...row(i,i%2?2:-1),group:'A',outcome:i%2?'correct':'wrong'}));
  const g=summariseGroup('A',rows);
  expect(g.overlap.daily.blocks).toBe(220);expect(g.overlap.weekly.status).toBe('available');
  expect(g.overlap.daily.mean).toBeCloseTo(g.avgMoveAfterCost!,10);
 });
});
