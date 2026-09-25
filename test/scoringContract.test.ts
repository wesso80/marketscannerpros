import {describe,it,expect} from 'vitest';
import {deriveFactorSignals} from '@/lib/analysis/scannerFactorSignals';
import {computeCompositeV2, type FactorInput} from '@/lib/analysis/scannerScoreV2';
import {buildScannerScore, compareScannerScores, dollarVolume, scoreFreshness, synchronizeScannerScenario} from '@/lib/scanner/scoreContract';
import {computeMspScore} from '@/lib/scanner/rankedQueue';
import {computeStructureQuality,computeMomentumQuality,computeConfluenceScore,computeRiskQuality} from '@/lib/goldenEgg/semantics';

const factors: FactorInput[] = ['TREND','MOMENTUM','VOLUME','RELATIVE_STRENGTH','VOLATILITY'].map(f=>({factor:f as FactorInput['factor'],signed:f==='VOLUME'?-1:.8,available:true}));
describe('scoring audit regression contracts',()=>{
 it('treats a missing factor exactly like an observed neutral vote, and flags it via coverage',()=>{
  const removed=computeCompositeV2({factors:factors.map(f=>({...f,available:f.factor!=='VOLUME'})),regime:'neutral',evidenceQuality:'MEDIUM'});
  const neutral=computeCompositeV2({factors:factors.map(f=>f.factor==='VOLUME'?{...f,signed:0}:f),regime:'neutral',evidenceQuality:'MEDIUM'});
  expect(removed.composite).toBe(neutral.composite);
  expect(removed.coverage).toBeLessThan(neutral.coverage);
  const contract=buildScannerScore({factors:factors.map(f=>({...f,available:f.factor!=='VOLUME'})),regime:'neutral',freshness:'live',trustLevel:'GOOD'});
  expect(contract.missingFactors).toContain('VOLUME');
 });
 it('counts applicable equity factors and reaches high coverage without crypto positioning or catalyst feeds',()=>{
  const f=deriveFactorSignals({price:110,ema200:100,adx:30,rsi:60,mfi:60,rsIndexRatio:1.1,bbwp:10});
  const score=buildScannerScore({factors:f.factors,regime:'trending',freshness:'live',trustLevel:'GOOD'});
  expect(score.coverage).toBe(1);expect(score.evidenceQuality).toBe('HIGH');
 });
 it('preserves delayed and unknown freshness and blocks unevaluated trust',()=>{
  expect(scoreFreshness('delayed')).toBe('delayed');expect(scoreFreshness(undefined)).toBe('unknown');
  expect(buildScannerScore({factors,regime:'neutral',freshness:'live'}).permission).toBe('BLOCK');
 });
 it('caps insufficient trust and applies gates before the top ten without double discounting',()=>{
  const rows=Array.from({length:11},(_,i)=>({symbol:`S${i}`,score:90-i,compositeV2:{...buildScannerScore({factors,regime:'neutral',freshness:'live',trustLevel:'GOOD'}),composite:90-i}}));
  rows[0].compositeV2.permission='BLOCK';rows[0].compositeV2.composite=36;
  expect(rows.sort(compareScannerScores).slice(0,10).some(r=>r.symbol==='S10')).toBe(true);
  expect(computeMspScore({...rows.find(r=>r.symbol==='S0')!,scoreV2:{regimeScore:{gated:true}}} as any,'trend')).toBe(36);
  // v2.3: INSUFFICIENT_DATA is WATCH, and missing inputs are not capped a second time.
  const bad=buildScannerScore({factors,regime:'neutral',freshness:'live',trustLevel:'INSUFFICIENT_DATA'});
  const good=buildScannerScore({factors,regime:'neutral',freshness:'live',trustLevel:'GOOD'});
  expect(bad.composite).toBe(good.composite);expect(bad.permission).toBe('WATCH');
  expect(bad.watchReasons.map(r=>r.code)).toContain('INSUFFICIENT_DATA');
  // Unusable data (e.g. no price) still blocks.
  expect(buildScannerScore({factors,regime:'neutral',freshness:'live',trustLevel:'INSUFFICIENT_DATA',criticalBlockers:['Required input missing: price.']}).permission).toBe('BLOCK');
 });
 it('converts shares once and leaves crypto dollar volume unchanged',()=>{
  expect(dollarVolume(.01,1e9,'crypto')).toBe(1e9);expect(dollarVolume(1000,1e7,'crypto')).toBe(1e7);
  expect(dollarVolume(100,1e6,'equity')).toBe(1e8);expect(dollarVolume(100,undefined,'equity')).toBeUndefined();
 });
 it('keeps scenario geometry on the selected side and clears neutral levels',()=>{
  const row={direction:'bullish',price:100,atr:2,entry:100,stop:97,target:106};
  synchronizeScannerScenario(row,'bearish');expect(row.stop).toBeGreaterThan(row.entry);expect(row.target).toBeLessThan(row.entry);
  synchronizeScannerScenario(row,'neutral');expect(row.entry).toBeUndefined();
 });
 it('gives mirrored long and short structures and momentum comparable quality',()=>{
  const b={price:100,adx:30,atr:2,advUsd:1e8,assetClass:'equity' as const};
  const long=computeStructureQuality({...b,direction:'LONG',sma20:98,sma50:96,ema200:90,bbMiddle:98});
  const short=computeStructureQuality({...b,direction:'SHORT',sma20:102,sma50:104,ema200:110,bbMiddle:102});
  expect(long.score).toBe(short.score);expect(long.score).toBeGreaterThan(80);
  expect(computeMomentumQuality({rsi:60,macd:1,macdHist:.5,stochK:60},3,'LONG').score).toBe(computeMomentumQuality({rsi:40,macd:-1,macdHist:-.5,stochK:40},-3,'SHORT').score);
 });
 it('exposes the exact FIVN missing-flow arithmetic',()=>{
  const c=computeConfluenceScore([{key:'Structure',weight:.3,value:85,present:true},{key:'Flow',weight:.25,value:50,present:false},{key:'Momentum',weight:.2,value:85,present:true},{key:'Risk',weight:.25,value:57,present:true}],80);
  // Missing-but-applicable Flow counts as a flagged neutral 50 (was 0 = double penalty with the trust cap).
  expect(c.rawTotal).toBeCloseTo(69.25,10);expect(c.finalScore).toBe(69);expect(c.coverage).toBe(.75);expect(c.rows[1].points).toBe(12.5);expect(c.rows[1].available).toBe(false);expect(c.rows[1].imputedNeutral).toBe(true);expect(c.missingComponents).toEqual(['Flow']);
 });
 it('scales weekly ATR to the same daily-equivalent risk bucket',()=>{
  const r={barsPerDay:.2,atrPct:8,rsi:50,stochK:50,exhaustionRisk:0,trapDetected:false,advUsd:1e8,dataTrustLevel:'GOOD' as const,fundingRatePercent:null,eventWithinDays:null,stopDistanceAtr:1.5,assetClass:'equity' as const};
  expect(computeRiskQuality(r).score).toBe(computeRiskQuality({...r,barsPerDay:1,atrPct:8*Math.sqrt(.2)}).score);
 });
});
