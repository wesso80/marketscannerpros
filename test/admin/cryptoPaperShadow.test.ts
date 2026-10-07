import {it,expect} from 'vitest';
import {initShadow,advanceShadow,shadowChanged,shadowTitle,SHADOW_PLANS_ACTIVE} from '@/lib/admin/cryptoPaperShadow';
import {compareExitPlans,summarizeCryptoPaper} from '@/lib/admin/cryptoPaperStats';
const step=900000,t0=Date.UTC(2026,8,29,0),c=.0005;
const pos=(over={})=>({id:'p1',symbol:'bitcoin',instrumentType:'coinbase:BTC-USD',averageEntry:100,openedAt:new Date(t0).toISOString(),initialStopLoss:95,quantity:10,entryFee:.5,...over});
const bar=(i:number,o:number,h:number,l:number,cl:number)=>({openAt:t0+i*step,closeAt:t0+(i+1)*step,open:o,high:h,low:l,close:cl});
const net=(px:number)=>{const eff=px*(1-c);return eff-100-.05-eff*c;};
const now=t0+200*step;
it('takes a full stop loss at the stop, or at a gap-down open',()=>{
 const s=advanceShadow(initShadow(pos(),2,c),[bar(0,100,101,94,96)],now);
 expect(s).toMatchObject({status:'CLOSED',legs:[{fraction:1,price:95,reason:'STOP'}]});expect(s.r).toBeCloseTo(net(95)/5,3);
 expect(advanceShadow(initShadow(pos(),2,c),[bar(0,100,101,99,100),bar(1,93,94,92,93)],now).legs[0].price).toBe(93);
});
it('takes half at +1.5R, trails the rest from completed candles only, and exits on the trail',()=>{
 const s0=initShadow(pos(),2,c);
 const s1=advanceShadow(s0,[bar(0,100,107.5,101,107)],now);
 expect(s1).toMatchObject({status:'OPEN',remaining:.5,stop:103.5,legs:[{fraction:.5,price:107.5,reason:'PARTIAL_TARGET'}]});
 // A new high inside a candle raises the stop only for later candles, even though this candle's low is below it.
 const s2=advanceShadow(s1,[bar(1,107,112,104,111)],now);
 expect(s2).toMatchObject({status:'OPEN',stop:108});
 const s3=advanceShadow(s2,[bar(2,110,110,107,107)],now);
 expect(s3).toMatchObject({status:'CLOSED',legs:[{reason:'PARTIAL_TARGET'},{fraction:.5,price:108,reason:'TRAIL_STOP'}]});
 expect(s3.r).toBeCloseTo((.5*net(107.5)+.5*net(108))/5,3);
 expect(shadowChanged(s1,s2)).toBe(true);
});
it('charges a same-candle breakeven after a partial because intra-candle order is unknown',()=>{
 const s=advanceShadow(initShadow(pos(),2,c),[bar(0,100,108,99.5,104)],now);
 expect(s).toMatchObject({status:'CLOSED',legs:[{reason:'PARTIAL_TARGET'},{price:100,reason:'BREAKEVEN_STOP'}]});
});
it('v2 exits after 72 hours when +1R was never reached; earlier v1 shadows keep their 24h rule',()=>{
 const bars=Array.from({length:300},(_,i)=>bar(i,100,103,98,101)),later=t0+300*step;
 expect(advanceShadow(initShadow(pos(),2,c),bars,later)).toMatchObject({plan:'partial-trail-v2',status:'CLOSED',legs:[{price:101,reason:'TIME_STOP',at:new Date(t0+72*3600000).toISOString()}]});
 const v1={...initShadow(pos(),2,c),plan:'partial-trail-v1' as const};
 expect(advanceShadow(v1,bars,later).legs[0]).toMatchObject({reason:'TIME_STOP',at:new Date(t0+24*3600000).toISOString()});
});
it('does not credit highs from the partial entry candle but still charges its stop',()=>{
 const p=pos({openedAt:new Date(t0+60000).toISOString()});
 expect(advanceShadow(initShadow(p,2,c),[bar(0,100,120,97,100)],now)).toMatchObject({status:'OPEN',remaining:1,highest:null});
 expect(advanceShadow(initShadow(p,2,c),[bar(0,100,120,94,100)],now).status).toBe('CLOSED');
});
it('refuses gaps and marks missing inputs UNAVAILABLE instead of guessing',()=>{
 expect(()=>advanceShadow(initShadow(pos(),2,c),[bar(1,100,101,99,100)],now)).toThrow('gap');
 expect(initShadow(pos(),NaN,c)).toMatchObject({status:'UNAVAILABLE',reason:expect.stringContaining('ATR')});
 expect(initShadow(pos({initialStopLoss:null}),2,c).status).toBe('UNAVAILABLE');
});
it('compares plans only on positions closed under both',()=>{
 const rows=[{position_id:'a',r_multiple:'2'},{position_id:'b',r_multiple:'-1'},{position_id:'c',r_multiple:'1'}] as never;
 const v2='partial-trail-v2';
 const cmp=compareExitPlans(rows,[{positionId:'a',plan:v2,status:'CLOSED',r:3,legs:[{reason:'TRAIL_STOP'}]},{positionId:'b',plan:v2,status:'CLOSED',r:-1,legs:[{reason:'STOP'}]},{positionId:'c',plan:v2,status:'OPEN',r:null,legs:[]},{positionId:'c',status:'CLOSED',r:9,legs:[{reason:'TIME_STOP'}]}]);
 expect(cmp).toMatchObject({plan:v2,earlierPlanShadows:1,pairs:2,openShadows:1,fixed:{avgR:.5,totalR:1},trail:{avgR:1,totalR:2},trailExitReasons:{TRAIL_STOP:1,STOP:1}});
});
it('backtest horizon closes a still-running remainder at a completed close, and leaves closed shadows alone',async()=>{
 const {closeShadowAt}=await import('@/lib/admin/cryptoPaperShadow');
 const s1=advanceShadow(initShadow(pos(),2,c),[bar(0,100,107.5,101,107)],now);
 const h=closeShadowAt(s1,110,t0+step);
 expect(h).toMatchObject({status:'CLOSED',legs:[{reason:'PARTIAL_TARGET'},{fraction:.5,price:110,reason:'HORIZON'}]});
 expect(h.r).toBeCloseTo((.5*net(107.5)+.5*net(110))/5,3);
 expect(closeShadowAt(h,1,t0)).toBe(h);
});
it('v3 exits the remainder when a completed 4h candle that began after entry closes below the entry floor',()=>{
 const v3=(over={})=>initShadow(pos(over),2,c,'failed-breakout-trail-v3',99);
 expect(initShadow(pos(),2,c,'failed-breakout-trail-v3')).toMatchObject({status:'UNAVAILABLE',reason:expect.stringContaining('entry floor')});
 // 16 bars = 4h from t0 (entry). Bar 15 closes the first 4h period; below 99 there closes the position at that close.
 const flat=Array.from({length:16},(_,i)=>bar(i,100,100.5,99.5,100));
 const failed=[...flat.slice(0,15),bar(15,99.6,99.7,98.6,98.7)];
 expect(advanceShadow(v3(),failed,now)).toMatchObject({status:'CLOSED',legs:[{fraction:1,price:98.7,reason:'FAILED_BREAKOUT',at:new Date(t0+16*step).toISOString()}]});
 // A 4h close below the floor only inside the entry's own 4h period is not a completed post-entry candle.
 const late=(over={})=>initShadow(pos({openedAt:new Date(t0+step).toISOString(),...over}),2,c,'failed-breakout-trail-v3',99);
 expect(advanceShadow(late(),failed,now).status).toBe('OPEN');
 // 15m closes below the floor that are not 4h closes do not trigger it; v2 on the same bars stays open.
 expect(advanceShadow(v3(),[...flat.slice(0,5),bar(5,99.6,99.7,98.6,98.7)],now).status).toBe('OPEN');
 expect(advanceShadow(initShadow(pos(),2,c),failed,now).status).toBe('OPEN');
});
it('v4 trails the whole position from entry with no partial, labelling a stop raised above the original as a trail',()=>{
 const v4=initShadow(pos(),2,c,'trail-only-v4');
 const s1=advanceShadow(v4,[bar(0,100,107.5,101,107)],now);
 expect(s1).toMatchObject({status:'OPEN',remaining:1,legs:[],stop:103.5});
 const s2=advanceShadow(s1,[bar(1,107,112,104,111)],now);
 expect(s2).toMatchObject({status:'OPEN',stop:108});
 const s3=advanceShadow(s2,[bar(2,110,110,107,107)],now);
 expect(s3).toMatchObject({status:'CLOSED',legs:[{fraction:1,price:108,reason:'TRAIL_STOP'}]});
 expect(s3.r).toBeCloseTo(net(108)/5,3);
 // A trailed stop still below entry (97 = 101 high - 2 ATR) is a trail exit, not the original stop.
 const s4=advanceShadow(advanceShadow(initShadow(pos(),2,c,'trail-only-v4'),[bar(0,100,101,99.5,100.5)],now),[bar(1,100.5,100.6,96.9,97.5)],now);
 expect(s4).toMatchObject({status:'CLOSED',legs:[{price:97,reason:'TRAIL_STOP'}]});
});
it('stores v3 and v4 under their own journal titles and compares each plan separately',()=>{
 expect(SHADOW_PLANS_ACTIVE).toEqual(['partial-trail-v2','failed-breakout-trail-v3','trail-only-v4','ratchet-v5','half2r-trail3-v6','chandelier3-v7']);
 expect(shadowTitle('partial-trail-v2')).toBe(shadowTitle('partial-trail-v1'));
 expect(shadowTitle('failed-breakout-trail-v3')).toBe('Crypto shadow exit plan failed-breakout-trail-v3');
 const rows=[{position_id:'a',r_multiple:'2'},{position_id:'b',r_multiple:'-1'}] as never;
 const shadows=[{positionId:'a',plan:'partial-trail-v2',status:'CLOSED',r:3,legs:[{reason:'TRAIL_STOP'}]},{positionId:'a',plan:'trail-only-v4',status:'CLOSED',r:4,legs:[{reason:'TRAIL_STOP'}]},{positionId:'b',plan:'trail-only-v4',status:'OPEN',r:null,legs:[]}];
 expect(compareExitPlans(rows,shadows,'trail-only-v4')).toMatchObject({plan:'trail-only-v4',pairs:1,openShadows:1,earlierPlanShadows:0,trail:{avgR:4}});
 expect(compareExitPlans(rows,shadows,'failed-breakout-trail-v3')).toMatchObject({pairs:0,openShadows:0});
});
it('recomputes ledger R at higher per-side costs from the slippage-free quote, excluding rows without prices',()=>{
 // Fill 100.05 = ask 100 * (1 + 0.05% slippage); exit_price 109.945 = 110 * (1 - 0.05%); stop 95 → 1R = 5.05.
 const row={position_id:'p',r_multiple:'1.9',realised_pnl:'9.5',outcome:'WIN',exit_reason:'TAKE_PROFIT',instrument_type:'coinbase:X-USD',entry_time:'2026-09-01T00:00:00Z',exit_time:'2026-09-02T00:00:00Z',created_reason:'k|'+JSON.stringify({plan:{stop:95}}),entry_price:'100.05',exit_price:'109.945',quantity:'1',stop_loss:'95'};
 const s=summarizeCryptoPaper([row,{...row,position_id:'q',entry_price:null,exit_price:null}]);
 expect(s.costSensitivity.map(x=>x.feePctPerSide)).toEqual([0.1,0.3,0.6,0.9]);
 const at=(pct:number)=>s.costSensitivity.find(x=>x.feePctPerSide===pct)!;
 expect(at(0.1)).toMatchObject({trades:1,excluded:1});
 expect(at(0.1).avgR).toBeCloseTo((110*.999-100*1.001)/5.05,4);
 expect(at(0.6).avgR).toBeCloseTo((110*.994-100*1.006)/5.05,4);
 expect(at(0.6).avgR!).toBeLessThan(at(0.1).avgR!);
});
// ── Phase 2 plans (entry 100, stop 95 => 1R = 5; ATR 2) ──
it('v5 ratchet: breakeven after +1.5R, +1R locked after +2R, raised only from completed highs, no time stop',()=>{
 const s0=initShadow(pos(),2,c,'ratchet-v5');
 const s1=advanceShadow(s0,[bar(0,100,107.6,100.5,107)],now); // high +1.52R -> stop to breakeven for later candles
 expect(s1).toMatchObject({status:'OPEN',stop:100,remaining:1,legs:[]});
 const s2=advanceShadow(s1,[bar(1,107,110.2,104,110)],now); // high +2.04R -> lock +1R (105)
 expect(s2.stop).toBe(105);
 const s3=advanceShadow(s2,[bar(2,110,110,104,104)],now);
 expect(s3).toMatchObject({status:'CLOSED',legs:[{fraction:1,price:105,reason:'RATCHET_STOP'}]});
 expect(s3.r).toBeCloseTo(net(105)/5,3);
 // No time stop: 100 hours flat below +1R stays open.
 const flat=Array.from({length:400},(_,i)=>bar(i,100,101,99,100));
 expect(advanceShadow(initShadow(pos(),2,c,'ratchet-v5'),flat,now+400*step).status).toBe('OPEN');
});
it('v6: half at +2R without a breakeven move, the rest trails 3 ATR; v7: whole position trails 3 ATR from entry',()=>{
 const v6=advanceShadow(initShadow(pos(),2,c,'half2r-trail3-v6'),[bar(0,100,110.5,99,110)],now);
 // Half filled at 110 (+2R); stop stays at 95 (no breakeven), trail = 110.5 - 6 = 104.5 applies from the next candle.
 expect(v6).toMatchObject({status:'OPEN',remaining:.5,stop:104.5,legs:[{fraction:.5,price:110,reason:'PARTIAL_TARGET'}]});
 const v6b=advanceShadow(v6,[bar(1,110,111,104,104.2)],now);
 expect(v6b).toMatchObject({status:'CLOSED',legs:[{reason:'PARTIAL_TARGET'},{fraction:.5,price:104.5,reason:'TRAIL_STOP'}]});
 const v7=advanceShadow(initShadow(pos(),2,c,'chandelier3-v7'),[bar(0,100,103,99,102)],now);
 expect(v7).toMatchObject({status:'OPEN',stop:97,remaining:1}); // max(95, 103 - 6)
 expect(advanceShadow(v7,[bar(1,102,102,96.5,97)],now)).toMatchObject({status:'CLOSED',legs:[{fraction:1,price:97,reason:'TRAIL_STOP'}]});
});
it('Phase 2 plans never use a later candle: changing candles after the exit leaves every result unchanged',()=>{
 for(const plan of ['ratchet-v5','half2r-trail3-v6','chandelier3-v7'] as const){
  const head=[bar(0,100,107.6,100.5,107),bar(1,107,110.2,104,110),bar(2,110,110,94,94)];
  const a=advanceShadow(initShadow(pos(),2,c,plan),[...head,bar(3,94,500,1,200)],now);
  const b=advanceShadow(initShadow(pos(),2,c,plan),[...head,bar(3,94,90,80,85)],now);
  expect(a.status).toBe('CLOSED');expect(a.r).toBe(b.r);expect(a.legs).toEqual(b.legs);
 }
});
