import {it,expect} from 'vitest';
import {backtestCoin,summarizeBacktest,type BacktestState} from '@/lib/admin/cryptoBacktest';
import type {ExchangeBar} from '@/lib/admin/cryptoExchangeVolume';
const H=3600000,F=4*H,D=24*H,M15=900000,T0=Date.UTC(2026,5,1),N=40;
// Slow 4h uptrend, then a volume breakout on the last bar that passes the live rules without being stretched.
function market(gapUp=false){
 const four:{o:number;h:number;l:number;c:number;v:number}[]=[];
 for(let k=0;k<N-1;k++){const c=100+.1*k;four.push({o:c,h:c+.5,l:c-.5,c,v:40});}
 const prev=four.at(-1)!.c,C=prev+.8;four.push({o:prev,h:C+.1,l:prev-.2,c:C,v:100});
 const hourly:ExchangeBar[]=[];
 four.forEach((b,k)=>{const t=T0+k*F;
  hourly.push({t:t+H,o:b.o,h:b.h,l:b.l,c:b.o,v:b.v/4},{t:t+2*H,o:b.o,h:b.o,l:b.o,c:b.o,v:b.v/4},{t:t+3*H,o:b.o,h:b.o,l:b.o,c:b.o,v:b.v/4},{t:t+4*H,o:b.o,h:Math.max(b.o,b.c),l:Math.min(b.o,b.c),c:b.c,v:b.v/4});});
 const signalAt=T0+N*F,open=gapUp?C+5:C;
 for(let j=1;j<=8;j++)hourly.push({t:signalAt+j*H,o:open,h:open+.05,l:open-.05,c:open,v:10});
 return {hourly,signalAt,C};
}
const btc:ExchangeBar[]=Array.from({length:70},(_,i)=>({t:T0+N*F-(69-i)*D-((T0+N*F)%D),o:1,h:1,l:1,c:50000+i*100,v:1}));
function fetcher(m:ReturnType<typeof market>){
 return async(_p:string,start:number,end:number,step:number)=>{
  if(step===H)return {bars:m.hourly.filter(b=>b.t>start&&b.t<=end),requests:1,dropped:0};
  // The backtest reads 8 anchor candles before the entry candle; one real anchor, then a gap-free path from entry.
  const C=m.C,e=start+8*M15,bars:ExchangeBar[]=[{t:e,o:C,h:C,l:C,c:C,v:1},{t:e+M15,o:C,h:C+.2,l:C-.1,c:C+.1,v:1},{t:e+2*M15,o:C+.1,h:C+6,l:C,c:C+5.5,v:1}];
  for(let t=e+3*M15;t<=end;t+=M15)bars.push({t,o:C+5.5,h:C+5.6,l:C+5.4,c:C+5.5,v:1});
  return {bars,requests:1,dropped:0};
 };
}
it('enters at the first in-zone hourly open after the signal and replays the live fixed exit with costs',async()=>{
 const m=market(),r=await backtestCoin({id:'coin',product:'COIN-USD'},T0+30*F,m.signalAt+8*H,btc,fetcher(m));
 expect(r).toMatchObject({signals:1,noEntry:0});
 expect(r.trades).toHaveLength(1);
 const t=r.trades[0];
 expect(t).toMatchObject({kind:'BREAKOUT',entryAt:new Date(m.signalAt).toISOString(),btcRegime:'UP',fixed:{status:'CLOSED',exit:'TAKE_PROFIT'}});
 expect(t.fixed.r!).toBeGreaterThan(1.5);expect(t.fixed.r!).toBeLessThan(2);
 expect(t.shadow.legs[0]).toEqual({reason:'PARTIAL_TARGET'});expect(t.filledBars).toBe(0);
});
it('does not chase: a gap above the live maximum entry records no trade',async()=>{
 const m=market(true),r=await backtestCoin({id:'coin',product:'COIN-USD'},T0+30*F,m.signalAt+8*H,btc,fetcher(m));
 expect(r).toMatchObject({signals:1,noEntry:1,trades:[]});
});
it('summarizes in R with $500 per R and reports excluded trades separately',async()=>{
 const m=market(),r=await backtestCoin({id:'coin',product:'COIN-USD'},T0+30*F,m.signalAt+8*H,btc,fetcher(m));
 const open={...r.trades[0],id:'x',fixed:{status:'OPEN_AT_HORIZON' as const,r:null,exit:null,at:null}};
 const state={version:1,status:'COMPLETE',coins:[{id:'coin',product:'COIN-USD',symbol:'C',status:'DONE',signals:2,noEntry:0,overlapping:0}],trades:[r.trades[0],open],requests:3,droppedRows:0} as unknown as BacktestState;
 const s=summarizeBacktest(state);
 expect(s.stats.overall).toMatchObject({trades:1});expect(s.stats.overall.netPnl).toBeCloseTo(r.trades[0].fixed.r!*500,1);
 expect(s.counts).toMatchObject({trades:2,openAtHorizon:1,signals:2});
});
