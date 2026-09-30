import {it,expect} from 'vitest';
import {startExcursion,advanceExcursion,excursionR,giveBack,giveBackSummary,netR,bookGiveBack,peakDistance,type ExcursionBar} from '@/lib/admin/cryptoExcursion';
const S=900000,T0=Date.UTC(2026,8,1);
const bar=(k:number,high:number,low:number):ExcursionBar=>({openAt:T0+k*S,closeAt:T0+(k+1)*S,high,low});
it('computes MFE/MAE in net R from completed candles, excluding the pre-fill high of the entry candle',()=>{
 // Entry mid-candle 0; its high (130) may predate the fill and is excluded; its low (95) counts.
 const s0=startExcursion(100,90,0,T0+5*60000,S)!;
 const s=advanceExcursion(s0,[bar(0,130,95),bar(1,112,99),bar(2,105,97)],T0+3*S);
 expect(excursionR(s)).toEqual({mfeR:1.2,maeR:-.5});expect(s.through).toBe(T0+3*S);
 // An incomplete bar (closes after `until`) is ignored.
 expect(advanceExcursion(s0,[bar(0,101,99),bar(1,200,50)],T0+S+60000).high).toBeNull();
});
it('is point-in-time: changing any bar after `until` or after the exit never changes the result',()=>{
 const s0=startExcursion(100,90,.0005,T0,S)!,bars=[bar(0,104,98),bar(1,108,96),bar(2,111,92)];
 const until=T0+2*S,a=advanceExcursion(s0,bars,until),b=advanceExcursion(s0,[...bars.slice(0,2),bar(2,999,1),bar(3,999,1)],until);
 expect(excursionR(a)).toEqual(excursionR(b));
 const exit={price:92,at:T0+3*S,insideBar:true};
 const x=advanceExcursion(s0,[...bars,bar(3,500,1)],T0+10*S,exit),y=advanceExcursion(s0,[...bars,bar(3,1000,.5),bar(4,2000,.1)],T0+10*S,exit);
 expect(excursionR(x)).toEqual(excursionR(y));
});
it('excludes the extremes of the bar an intrabar exit happened in, but keeps a marked completed bar',()=>{
 const s0=startExcursion(100,90,0,T0,S)!,bars=[bar(0,105,99),bar(1,125,89)];
 // Stop at 90 inside bar 1: its high 125 may have come after the stop; MFE stays at bar 0's 105.
 expect(excursionR(advanceExcursion(s0,bars,T0+5*S,{price:90,at:T0+2*S,insideBar:true}))).toEqual({mfeR:.5,maeR:-1});
 // Marked at bar 1's close: bar 1 completed before the mark, so it counts fully.
 expect(excursionR(advanceExcursion(s0,bars,T0+5*S,{price:110,at:T0+2*S,insideBar:false}))).toEqual({mfeR:2.5,maeR:-1.1});
});
it('fails on a gap instead of skipping candles, and resumes incrementally',()=>{
 const s0=startExcursion(100,90,0,T0,S)!;
 expect(()=>advanceExcursion(s0,[bar(0,101,99),bar(2,150,99)],T0+5*S)).toThrow('gap');
 const a=advanceExcursion(s0,[bar(0,103,99)],T0+S),b=advanceExcursion(a,[bar(0,103,99),bar(1,107,98)],T0+2*S);
 expect(excursionR(b)).toEqual({mfeR:.7,maeR:-.2});
});
it('give-back = (MFE - final)/MFE, null when never in profit; summary guards against tiny MFEs',()=>{
 expect(giveBack(2,.5)).toBe(.75);expect(giveBack(2,2)).toBe(0);expect(giveBack(1,-1)).toBe(2);expect(giveBack(0,-1)).toBeNull();expect(giveBack(null,1)).toBeNull();
 const s=giveBackSummary([{mfeR:2,maeR:-.2,finalR:1},{mfeR:.1,maeR:-1,finalR:-1},{mfeR:-.1,maeR:-1,finalR:-1}]);
 expect(s).toMatchObject({trades:3,avgGiveBackReached1R:.5,reached1R:1,medianGiveBack:5.75});
 expect(netR(110,100,90,0)).toBe(1);
});
it('book give-back and distance from the running peak',()=>{
 expect(bookGiveBack([{peakUsd:100,currentUsd:40},{peakUsd:null,currentUsd:-10}])).toEqual({peakOpenProfitUsd:100,currentOpenPnlUsd:30,givenBackUsd:70,givenBackPct:.7});
 expect(peakDistance([{at:'a',value:10},{at:'b',value:50},{at:'c',value:20}])).toMatchObject({peak:{at:'b',value:50},fromPeak:-30,fromPeakPct:.6});
});
it('backtests may skip no-trade gaps; live paths may not',()=>{
 const s0=startExcursion(100,90,0,T0,S)!,bars=[bar(0,101,99),bar(3,120,99)];
 expect(excursionR(advanceExcursion(s0,bars,T0+5*S,undefined,{allowGaps:true}))).toEqual({mfeR:2,maeR:-.1});
 expect(()=>advanceExcursion(s0,bars,T0+5*S)).toThrow('gap');
});
