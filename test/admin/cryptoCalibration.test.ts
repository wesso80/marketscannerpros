import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {CAL,buildCalibration,calibrateField,forwardObservations,paperObservations,proposeFromLedger,type PaperObs,type PaperSourceRow} from '@/lib/admin/cryptoCalibration';
import type {ForwardRow} from '@/lib/admin/cryptoForwardScore';
import type {Recommendation} from '@/lib/admin/cryptoRecommendations';
const day=86400000,t0=Date.UTC(2026,8,1);
const jev=(chase:number)=>({rule:'jev-shadow-v2',status:'scored',chase,flowAgrees:.8,btcHeadwind:.1,btcTrend:'UP',flowStamp:'aggressive buying',model:'typesafe-ai/jev',checkedAt:'2026-09-01T00:00:00Z'});
const row=(i:number,r:number,extra:Record<string,unknown>={}):PaperSourceRow=>({r_multiple:r,entry_time:new Date(t0+i*day).toISOString(),exit_reason:'TAKE_PROFIT',instrument_type:'coinbase:X-USD',created_reason:'k|'+JSON.stringify({signal:{kind:'BREAKOUT'},btcRegime:{state:i%2?'UP':'DOWN',longTrend:'BULL'},...extra})});
it('reads R, entry time, evidence JSON and the Jev stamp from a closed trade; rows without R are dropped',()=>{
 const obs=paperObservations([row(0,1.5,{jev:jev(.9)}),{...row(1,0),r_multiple:null},{...row(2,2),created_reason:null}]);
 expect(obs).toHaveLength(2);
 expect(obs[0]).toMatchObject({r:1.5,venue:'Coinbase USD'});
 expect(obs[0].jev?.chase).toBe(.9);
 expect(obs[1].reason).toBeNull();
});
it('a field under 30 rows per side is collecting; informational sides are never graded',()=>{
 const rows=Array.from({length:20},(_,i)=>row(i,i%2?1:-1));
 const ledger=buildCalibration(paperObservations(rows),[],{closedTrades:20,forwardRows:0});
 const btc=ledger.fields.find(f=>f.id==='btcRegime.state')!;
 expect(btc.sides.map(s=>s.side).sort()).toEqual(['DOWN','UP']);
 expect(btc.sides.every(s=>s.status==='collecting')).toBe(true);
 const flow=ledger.fields.find(f=>f.id==='flow.state')!;
 expect(flow.sides).toEqual([expect.objectContaining({side:'NOT_RECORDED',informational:true,status:'collecting'})]);
 expect(ledger.note).toContain('Nothing is confirmed yet');
 expect(JSON.stringify(ledger)).not.toMatch(/win ?rate|\bedge\b/i);
});
it('confirms a side only when both time halves agree on the sign and the lift clears the floor',()=>{
 // DOWN entries lose 1R, UP entries make 1R, consistently through time.
 const rows=Array.from({length:80},(_,i)=>row(i,i%2?1:-1));
 const ledger=buildCalibration(paperObservations(rows),[],{closedTrades:80,forwardRows:0});
 const btc=ledger.fields.find(f=>f.id==='btcRegime.state')!;
 const down=btc.sides.find(s=>s.side==='DOWN')!,up=btc.sides.find(s=>s.side==='UP')!;
 expect(down).toMatchObject({n:40,status:'confirmed'});
 expect(down.lift).toBeCloseTo(-1,6);
 expect(down.halfA).toMatchObject({n:20});expect(down.halfA.lift).toBeCloseTo(-1,6);
 expect(down.halfB.lift).toBeCloseTo(-1,6);
 expect(up.status).toBe('confirmed');
 expect(ledger.note).toContain('Confirmed: btcRegime.state DOWN');
});
it('a side whose halves disagree is contradicted, and a side inside one standard error is flat',()=>{
 // DOWN loses in the first half and wins in the second.
 const flip=Array.from({length:80},(_,i)=>row(i,i%2?0:(i<40?-1:1)));
 const flipped=buildCalibration(paperObservations(flip),[],{closedTrades:80,forwardRows:0}).fields.find(f=>f.id==='btcRegime.state')!.sides.find(s=>s.side==='DOWN')!;
 expect(flipped.status).toBe('contradicted');
 const noisy=Array.from({length:80},(_,i)=>row(i,((i*7)%5-2)/2));
 const flat=buildCalibration(paperObservations(noisy),[],{closedTrades:80,forwardRows:0}).fields.find(f=>f.id==='btcRegime.state')!;
 expect(flat.sides.every(s=>s.status==='flat'||s.status==='directional')).toBe(true);
});
it('scores the forward book on the 24h mark and splits saved Jev answers at 0.50',()=>{
 const fwd=(i:number,chase:number,changePct:number):ForwardRow=>({id:`c${i}`,symbol:`C${i}`,bucket:'VOLUME_WATCH',signalAt:new Date(t0+i*3600000).toISOString(),signalPrice:1,next4h:{status:'filled',price:1,at:'',changePct:changePct/2},day:{status:'filled',price:1,at:'',changePct},jev:{...jev(chase),flowAgrees:chase} as ForwardRow['jev']});
 const rows=[...Array.from({length:40},(_,i)=>fwd(i,.9,-3)),...Array.from({length:40},(_,i)=>fwd(100+i,.1,3)),{...fwd(999,.5,0),day:{status:'waiting'}} as ForwardRow];
 const obs=forwardObservations(rows);
 expect(obs).toHaveLength(80);
 const ledger=buildCalibration([],obs,{closedTrades:0,forwardRows:81});
 const chase=ledger.fields.find(f=>f.id==='jev.chase'&&f.outcome==='forward24h')!;
 expect(chase.label).toMatch(/not graded/);
 expect(chase.sides.every(s=>s.informational&&s.status==='collecting')).toBe(true);
 const flow=ledger.fields.find(f=>f.id==='jev.flowAgrees'&&f.outcome==='forward24h')!;
 expect(flow.unit).toBe('%');
 const high=flow.sides.find(s=>s.side==='flow agrees ≥0.50')!;
 expect(high.n).toBe(40);
 expect(high.lift).toBeCloseTo(-3,6);
 expect(['confirmed','contradicted','directional']).toContain(high.status);
});
it('files one text recommendation per newly confirmed side, dedups on later runs, caps at three a week, and retracts on contradiction',()=>{
 const rows=Array.from({length:80},(_,i)=>row(i,i%2?1:-1,{flow:{state:i%2?'NEUTRAL':'TAKER_SELL_HEAVY'},relativeStrength:{rule:i%2?'pass':'fail'},derivatives:{fundingState:i%2?'NEUTRAL':'CROWDED_LONG'}}));
 const ledger=buildCalibration(paperObservations(rows),[],{closedTrades:80,forwardRows:0});
 const confirmed=ledger.fields.flatMap(f=>f.sides.filter(s=>s.status==='confirmed'));
 expect(confirmed.length).toBeGreaterThan(CAL.weeklyCap);
 const first=proposeFromLedger(ledger,[],{},t0+90*day);
 expect(first.filedNow).toHaveLength(CAL.weeklyCap);
 expect(first.skippedByCap).toBe(confirmed.length-CAL.weeklyCap);
 expect(first.rows).toHaveLength(CAL.weeklyCap);
 for(const rec of first.rows as Recommendation[]){
  expect(rec.setup.startsWith('calibration ·')).toBe(true);
  expect(rec.status).toBe('unread');
  expect(rec.proposedRuleChange).not.toMatch(/win ?rate/i);
  expect(rec.proposedRuleChange).toMatch(/nothing has been changed/);
  expect(Number(rec.evidenceCount)).toBe(40);
 }
 const again=proposeFromLedger(ledger,first.rows,first.filed,t0+90*day+3600000);
 expect(again.filedNow).toHaveLength(0);
 expect(again.rows).toHaveLength(CAL.weeklyCap);
 const nextWeek=proposeFromLedger(ledger,first.rows,first.filed,t0+98*day);
 expect(nextWeek.filedNow.length).toBe(Math.min(CAL.weeklyCap,confirmed.length-CAL.weeklyCap));
 const filedField=first.filedNow[0].split('|')[0],filedSide=first.filedNow[0].split('|')[1];
 const flipped={...ledger,fields:ledger.fields.map(f=>f.id!==filedField?f:{...f,sides:f.sides.map(s=>s.side!==filedSide?s:{...s,status:'contradicted' as const,halfB:{n:s.halfB.n,lift:-(s.halfB.lift??0)}})})};
 const retract=proposeFromLedger(flipped,nextWeek.rows,nextWeek.filed,t0+106*day);
 expect(retract.filedNow.some(k=>k.endsWith('|contradicted'))).toBe(true);
 expect((retract.rows as Recommendation[]).some(r=>r.proposedRuleChange.startsWith('Retraction'))).toBe(true);
});
it('calibrateField keeps the full two-window arithmetic independent of the registry',()=>{
 const obs:PaperObs[]=Array.from({length:60},(_,i)=>({at:t0+i*day,r:i%3?0.5:-1,reason:null,jev:undefined,venue:i%3?'A':'B',exit:'x'}));
 const field=calibrateField({id:'venue',label:'Venue',file:'f',ruleVersion:'v',side:o=>o.venue},obs,o=>o.r,'R','paperR');
 const b=field.sides.find(s=>s.side==='B')!;
 expect(b.n).toBe(20);
 expect(b.lift).toBeCloseTo(-1-(40*0.5-20)/60,6);
 expect(b.status).toBe('collecting');
});
it('calibration never scores with Jev, never touches the planner or scheduler, and the planner never reads calibration',()=>{
 const src=readFileSync('lib/admin/cryptoCalibration.ts','utf8');
 const imports=src.split('\n').map(l=>l.trim()).filter(l=>l.startsWith('import '));
 expect(imports.some(l=>/jevClient|cryptoPaperMarket|cryptoAutomation|cryptoPaper'|cryptoVolumeMomentum/.test(l))).toBe(false);
 expect(imports.filter(l=>l.includes("'./cryptoJev'"))).toEqual(["import type {JevStamp} from './cryptoJev';"]);
 expect(src).not.toMatch(/ai-gateway|askJev/);
 expect(src).toMatch(/t\.workspace_id=\$2 AND pf\.workspace_id=\$2/);
 expect(readFileSync('lib/admin/cryptoMarketDataJob.ts','utf8')).toMatch(/p\.workspace_id=\$1 AND f\.workspace_id=\$1/);
 expect(readFileSync('lib/admin/cryptoPaperMarket.ts','utf8')).not.toMatch(/cryptoCalibration/);
 expect(readFileSync('lib/admin/cryptoAutomation.ts','utf8')).not.toMatch(/cryptoCalibration/);
 expect(readFileSync('lib/admin/cryptoRecommendations.ts','utf8')).not.toMatch(/cryptoCalibration|cryptoJev|jevClient/);
});
