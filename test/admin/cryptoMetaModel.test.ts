import {describe,expect,it} from 'vitest';
import {META,FEATURE_NAMES,encode,fitLr,predictLr,fitGbt,predictGbt,auc,metrics,calibration,trainableBefore,walkForward,proposeHoldout,binOf,type MetaRow} from '@/lib/admin/cryptoMetaModel';
const D=86400000,T0=Date.parse('2023-01-01T00:00:00Z');
/** Deterministic pseudo-random numbers. */
function rng(seed:number){let s=seed>>>0;return ()=>{s=(s*1664525+1013904223)>>>0;return s/2**32;};}
/** Synthetic signals: the win chance rises with RSI only when BTC trend is UP (an interaction trees can find). */
function dataset(n:number,seed=1):MetaRow[]{
 const r=rng(seed),out:MetaRow[]=[];
 for(let i=0;i<n;i++){
  const rsi=30+r()*50,up=r()<.5,rv=1.5+r()*3,miss=r()<.1;
  const p=up?(rsi>60?.75:.35):.4,y=r()<p?1:0,signalAt=T0+Math.floor(i*(720/n)*D)+4*3600000;
  out.push({id:`s${i}`,signalAt,exitAt:signalAt+Math.floor(r()*3*D)+3600000,y:y as 0|1,r:y?1.8:-1,x:encode({rsi14_4h:miss?null:rsi,btcTrend:up?'UP':'DOWN',relativeVolume:rv,kind:r()<.5?'BREAKOUT':'CONTINUATION',hourUtc:4,mcapRank:Math.ceil(r()*100)})});
 }
 return out;
}
describe('encoding',()=>{
 it('fixed width, missing flags, log scale for counts, one-hot categoricals',()=>{
  const x=encode({rsi14_4h:55,mcapRank:9,btcTrend:'DOWN',btcAbove200d:false,hourUtc:6});
  expect(x).toHaveLength(FEATURE_NAMES.length);
  const at=(n:string)=>x[FEATURE_NAMES.indexOf(n)];
  expect(at('rsi14_4h')).toBe(55);expect(at('rsi14_4h_missing')).toBe(0);
  expect(Number.isNaN(at('adx14_4h'))).toBe(true);expect(at('adx14_4h_missing')).toBe(1);
  expect(at('mcapRank')).toBeCloseTo(Math.log1p(9));
  expect(at('btcTrend=DOWN')).toBe(1);expect(at('btcTrend=UP')).toBe(0);expect(at('btcAbove200d=false')).toBe(1);
  expect(at('hourSin')).toBeCloseTo(1);
  expect(encode({}).filter(v=>v===1)).toHaveLength(17); // only the missing flags
 });
 it('bins: 0 is missing, then quantile edges',()=>{expect(binOf([1,2],NaN)).toBe(0);expect(binOf([1,2],0)).toBe(1);expect(binOf([1,2],1.5)).toBe(2);expect(binOf([1,2],9)).toBe(3);});
});
describe('models and metrics',()=>{
 const train=dataset(1500,3),test=dataset(1500,4),y=test.map(r=>r.y);
 it('AUC is exact on small cases',()=>{expect(auc([.1,.4,.35,.8],[0,0,1,1])).toBe(.75);expect(auc([.5,.5],[0,1])).toBe(.5);expect(auc([.2],[1])).toBeNull();});
 it('Brier, skill against the training base rate, and calibration bins',()=>{
  const m=metrics([.8,.2],[1,0],.5);expect(m.brier).toBeCloseTo(.04);expect(m.brierClimatology).toBeCloseTo(.25);expect(m.brierSkill).toBeCloseTo(.84);
  const c=calibration([.05,.95,.97],[0,1,0],[-1,2,-1]);expect(c).toHaveLength(META.calibrationBins);expect(c[9]).toMatchObject({n:2,observed:.5,avgR:.5});expect(c[0].n).toBe(1);
 });
 it('both models learn the signal out of sample (skill and ranking); trees use the interacting feature; deterministic',()=>{
  const g=fitGbt(train.map(r=>r.x),train.map(r=>r.y)),l=fitLr(train.map(r=>r.x),train.map(r=>r.y));
  const pg=test.map(r=>predictGbt(g,r.x)),pl=test.map(r=>predictLr(l,r.x)),base=train.reduce((s,r)=>s+r.y,0)/train.length;
  // Best possible skill on this data is about 0.09 (known probabilities); the trees must capture a clear share of it.
  expect(metrics(pg,y,base).brierSkill!).toBeGreaterThan(.02);expect(metrics(pl,y,base).brierSkill!).toBeGreaterThan(.02);
  expect(auc(pg,y)!).toBeGreaterThan(.55);expect(auc(pl,y)!).toBeGreaterThan(.55);
  expect(fitGbt(train.map(r=>r.x),train.map(r=>r.y))).toEqual(g);
  const rsi=FEATURE_NAMES.indexOf('rsi14_4h'),gain=g.gain[rsi]/g.gain.reduce((s,x)=>s+x,0);expect(gain).toBeGreaterThan(.2);
 });
});
describe('walk-forward: purging, embargo, locked holdout',()=>{
 const rows=dataset(900,7),holdout=proposeHoldout(rows)!;
 it('holdout is the last 91 days, ending after the last signal',()=>{
  const last=Math.max(...rows.map(r=>r.signalAt));expect(holdout.to).toBeGreaterThan(last);expect(holdout.to-holdout.from).toBe(META.holdoutDays*D);
 });
 it('training rows are embargoed 7 days and must have a known outcome before the test window',()=>{
  const at=T0+300*D,tr=trainableBefore(rows,at);
  expect(tr.every(r=>r.signalAt<at-7*D&&r.exitAt<at)).toBe(true);
  expect(trainableBefore([{...rows[0],signalAt:at-8*D,exitAt:at+1}],at)).toHaveLength(0);
 });
 const run=walkForward(rows,holdout);
 it('reports folds, pooled out-of-sample metrics, holdout and importance',()=>{
  expect(run.report.folds.length).toBeGreaterThan(1);
  for(const f of run.report.folds)expect(f.train).toBeGreaterThanOrEqual(META.minTrain);
  expect(run.report.oof.gbt.n).toBe(run.report.folds.reduce((s,f)=>s+f.test,0));
  expect(run.report.holdout.rows).toBe(rows.filter(r=>r.signalAt>=holdout.from).length);
  expect(run.report.importance[0].feature).toBe('rsi14_4h');
 });
 it('holdout labels never reach training: flipping them leaves every model and fold unchanged',()=>{
  const flipped=rows.map(r=>r.signalAt>=holdout.from?{...r,y:(1-r.y) as 0|1,r:-r.r}:r),again=walkForward(flipped,holdout);
  expect(again.final).toEqual(run.final);expect(again.report.folds).toEqual(run.report.folds);
  expect(again.report.holdout.metrics).not.toEqual(run.report.holdout.metrics);
 });
 it('no look-ahead: changing later labels never changes an earlier fold',()=>{
  const k=1,cut=Date.parse(run.report.folds[k].testTo);
  const later=rows.map(r=>r.signalAt>=cut?{...r,y:(1-r.y) as 0|1}:r),again=walkForward(later,holdout);
  expect(again.report.folds.slice(0,k+1)).toEqual(run.report.folds.slice(0,k+1));
 });
 it('rows after the locked holdout are not used',()=>{
  const extra=[...rows,...dataset(50,9).map((r,i)=>({...r,id:`late${i}`,signalAt:holdout.to+i*D,exitAt:holdout.to+i*D+D}))];
  const again=walkForward(extra,holdout);expect(again.report.postHoldoutRows).toBe(50);expect(again.final).toEqual(run.final);
 });
});
