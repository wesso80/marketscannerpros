import {describe,expect,it} from 'vitest';
import {encode,proposeHoldout,fitGbt,predictGbt} from '@/lib/admin/cryptoMetaModel';
import {EXIT_PLANS,EXIT_SELECT,fitSelector,selectPlan,strategyStats,walkForwardExit,type ExitRow} from '@/lib/admin/cryptoExitSelect';
const D=86400000,T0=Date.parse('2023-01-01T00:00:00Z');
function rng(seed:number){let s=seed>>>0;return ()=>{s=(s*1664525+1013904223)>>>0;return s/2**32;};}
/** Trailing plans pay when ADX is high (trend); the fixed plan pays otherwise. Noise on every plan. */
function dataset(n:number,seed=1):ExitRow[]{
 const r=rng(seed);return Array.from({length:n},(_,i)=>{
  const adx=10+r()*40,trend=adx>30,signalAt=T0+Math.floor(i*(720/n)*D)+4*3600000,noise=()=>(r()-.5)*2;
  const rr=Object.fromEntries(EXIT_PLANS.map(p=>[p,p==='fixed-2r'?(trend?0:.4)+noise():p==='trail-only-v4'?(trend?.8:-.3)+noise():-.1+noise()])) as ExitRow['r'];
  return {id:`s${i}`,signalAt,exitAt:signalAt+7*D,x:encode({adx14_4h:adx,rsi14_4h:40+r()*30,hourUtc:4}),r:rr};});
}
describe('exit selection',()=>{
 it('regression trees learn a conditional mean',()=>{
  const X=Array.from({length:600},(_,i)=>[i%2?1:0]),y=X.map(x=>x[0]?2:-1),m=fitGbt(X,y,{...EXIT_SELECT.gbt,trees:200,rate:.1,minLeaf:10},'squared');
  expect(m.loss).toBe('squared');expect(predictGbt(m,[1])).toBeCloseTo(2,1);expect(predictGbt(m,[0])).toBeCloseTo(-1,1);
 });
 it('paired stats against fixed',()=>{
  const s=strategyStats([1,2,3],[0,1,1]);expect(s.meanR).toBe(2);expect(s.totalR).toBe(6);expect(s.vsFixed.meanDiff).toBeCloseTo(1.3333,3);
  expect(s.vsFixed.se).toBeCloseTo(Math.sqrt(1/3)/Math.sqrt(3),3);expect(strategyStats([],[]).meanR).toBeNull();
 });
 it('the selector picks the plan that pays in each regime; the static plan comes from training means only',()=>{
  const m=fitSelector(dataset(1500,2));
  expect(selectPlan(m,encode({adx14_4h:45,rsi14_4h:50,hourUtc:4})).plan).toBe('trail-only-v4');
  expect(selectPlan(m,encode({adx14_4h:15,rsi14_4h:50,hourUtc:4})).plan).toBe('fixed-2r');
  expect(m.trainMeans[m.staticBest]).toBe(Math.max(...EXIT_PLANS.map(p=>m.trainMeans[p])));
 });
 const rows=dataset(1200,5),holdout=proposeHoldout(rows)!,run=walkForwardExit(rows,holdout);
 it('out of sample: the model beats always-fixed and the best single plan; the oracle bounds it',()=>{
  const s=run.report.walkForward.strategies;
  expect(run.report.folds.length).toBeGreaterThan(1);
  expect(s.model.meanR!).toBeGreaterThan(s['fixed-2r'].meanR!);expect(s.model.meanR!).toBeGreaterThan(s['static-best'].meanR!);
  expect(s.oracle.meanR!).toBeGreaterThanOrEqual(s.model.meanR!);expect(s.model.vsFixed.t!).toBeGreaterThan(2);
  expect(Object.values(run.report.walkForward.modelChoices).reduce((a,b)=>a+b,0)).toBe(s.model.n);
  expect(run.report.holdout.summary!.strategies.model.n).toBe(rows.filter(r=>r.signalAt>=holdout.from).length);
 });
 it('holdout outcomes never reach training; later outcomes never change an earlier window',()=>{
  const flip=(r:ExitRow)=>({...r,r:Object.fromEntries(EXIT_PLANS.map(p=>[p,-r.r[p]])) as ExitRow['r']});
  const a=walkForwardExit(rows.map(r=>r.signalAt>=holdout.from?flip(r):r),holdout);
  expect(a.final).toEqual(run.final);expect(a.report.folds).toEqual(run.report.folds);
  const cut=Date.parse(run.report.folds[0].testTo),b=walkForwardExit(rows.map(r=>r.signalAt>=cut?flip(r):r),holdout);
  expect(b.report.folds[0]).toEqual(run.report.folds[0]);
 });
});
