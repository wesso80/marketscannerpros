import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {MC_GUARD,applyMcGuard,bonferroniZ,inverseNormCdf,type CalibrationFieldBase,type CalibrationSide} from '@/lib/admin/calibrationCore';
import {CAL,buildCalibration,paperObservations,type PaperObs} from '@/lib/admin/cryptoCalibration';
const day=86400000,t0=Date.UTC(2026,8,1);
const side=(over:Partial<CalibrationSide>):CalibrationSide=>({side:'A',n:40,mean:1,lift:1,se:.1,halfA:{n:20,lift:1},halfB:{n:20,lift:1},status:'confirmed',informational:false,window:{holdoutN:12,holdoutLift:1,discoveryConfirmed:true},...over});
const field=(sides:CalibrationSide[],unit:'R'|'%'='R'):CalibrationFieldBase<'paperR'>[]=>[{id:'f',label:'F',file:'f',ruleVersion:'rule-v1',outcome:'paperR',unit,observations:80,sides}];
it('uses a Bonferroni z that is about 1.96 for one side and above 3.3 for 65 sides',()=>{
 expect(inverseNormCdf(0.975)).toBeCloseTo(1.959964,4);
 expect(bonferroniZ(1)).toBeCloseTo(1.959964,4);
 expect(bonferroniZ(65)).toBeGreaterThan(3.3);
 expect(bonferroniZ(65)).toBeLessThan(3.5);
 expect(bonferroniZ(0)).toBe(bonferroniZ(1));
});
it('drops a screen-confirmed side that misses the family threshold, the discovery window, or the holdout',()=>{
 const z=bonferroniZ(65);
 const weak=applyMcGuard(field([side({lift:0.3,se:0.2})]),65)[0].sides[0];
 expect(weak.status).toBe('directional');
 expect(weak.guard).toMatchObject({rule:MC_GUARD.version,family:65,passed:false,reason:'bonferroni'});
 expect(Math.abs(0.3)).toBeLessThan(z*0.2);
 const held=applyMcGuard(field([side({window:{holdoutN:12,holdoutLift:-1,discoveryConfirmed:true}})]),1)[0].sides[0];
 expect(held.status).toBe('directional');
 expect(held.guard?.reason).toBe('holdout');
 const early=applyMcGuard(field([side({window:{holdoutN:12,holdoutLift:1,discoveryConfirmed:false}})]),1)[0].sides[0];
 expect(early.guard?.reason).toBe('discovery-window');
 const thin=applyMcGuard(field([side({window:{holdoutN:9,holdoutLift:1,discoveryConfirmed:true}})]),1)[0].sides[0];
 expect(thin.guard?.reason).toBe('holdout');
 const kept=applyMcGuard(field([side({lift:2,se:0.2})]),65)[0].sides[0];
 expect(kept.status).toBe('confirmed');
 expect(kept.guard).toMatchObject({passed:true,reason:'passed',family:65});
 const info=applyMcGuard(field([side({informational:true,status:'confirmed'})]),65)[0].sides[0];
 expect(info.status).toBe('confirmed');
 expect(info.guard).toBeUndefined();
});
it('keeps a consistent two-window effect confirmed and labels the ledger with the guard version',()=>{
 const rows=Array.from({length:80},(_,i)=>({r_multiple:i%2?1:-1,entry_time:new Date(t0+i*day).toISOString(),exit_reason:'TAKE_PROFIT',instrument_type:'coinbase:X-USD',created_reason:'k|'+JSON.stringify({btcRegime:{state:i%2?'UP':'DOWN',longTrend:'BULL'}})}));
 const ledger=buildCalibration(paperObservations(rows),[],{closedTrades:80,forwardRows:0});
 const down=ledger.fields.find(f=>f.id==='btcRegime.state')!.sides.find(s=>s.side==='DOWN')!;
 expect(ledger.confirmationRule).toBe('mc-guard-v1');
 expect(down.status).toBe('confirmed');
 expect(down.guard).toMatchObject({passed:true,rule:'mc-guard-v1',family:ledger.testedSides});
 expect(down.halfA.n).toBe(20);
 expect(ledger.note).toContain('mc-guard-v1');
 expect(ledger.note).toContain('Confirmed: btcRegime.state DOWN');
});
it('does not confirm a side whose latest third reverses',()=>{
 const obs:PaperObs[]=[];
 for(let i=0;i<120;i++){
  const late=i>=100;
  const down=i%2===0;
  const r=down?(late?1:-1):(late?-1:1);
  obs.push({at:t0+i*day,r,reason:{btcRegime:{state:down?'DOWN':'UP',longTrend:'BULL'}},jev:undefined,catalyst:undefined,chart:undefined,shadow:undefined,venue:'Coinbase USD',exit:'TAKE_PROFIT'});
 }
 const ledger=buildCalibration(obs,[],{closedTrades:120,forwardRows:0});
 const down=ledger.fields.find(f=>f.id==='btcRegime.state')!.sides.find(s=>s.side==='DOWN')!;
 expect(down.n).toBe(60);
 expect(down.window&&down.window.holdoutN).toBeGreaterThan(0);
 expect(down.status).not.toBe('confirmed');
});
it('question rule versions stay on the question, and the filing key carries the guard so old confirmations are not the same sample',()=>{
 const src=readFileSync('lib/admin/cryptoCalibration.ts','utf8');
 expect(src).toMatch(/\$\{MC_GUARD\.version\}/);
 expect(src).toMatch(/ruleVersion:'jev-shadow-v2'/);
 expect(src).not.toMatch(/scoreRow|loadShadowWeights|attachShadowScore/);
 expect(readFileSync('lib/admin/cryptoPaper.ts','utf8')).not.toMatch(/jevProbability|jevUsage|cryptoForwardArchive|applyMcGuard/);
 expect(readFileSync('lib/admin/cryptoPaperBase.ts','utf8')).not.toMatch(/jevProbability|jevUsage|cryptoForwardArchive|applyMcGuard/);
 expect(CAL.minSide).toBe(30);
});
