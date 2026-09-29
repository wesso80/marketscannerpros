import {it,expect} from 'vitest';
import {initShadow,advanceShadow,shadowChanged} from '@/lib/admin/cryptoPaperShadow';
import {compareExitPlans} from '@/lib/admin/cryptoPaperStats';
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
