import {assessVolumeMomentum} from './cryptoVolumeMomentum';
import {planCryptoPaper} from './cryptoPaperMarket';
import type {ExchangeBar} from './cryptoExchangeVolume';
/**
 * Strategy test harness, harness-v1. RESEARCH ONLY: no live rule changes, no orders. Every variant uses the same
 * costs, the same point-in-time universe and the same data. Rules were written before the first run; changing any
 * of them is a new harness version and must be counted as another variant.
 */
export const HARNESS={
 version:'harness-v1',from:'2022-01-01',inSampleEnd:'2025-01-01',
 /** A coin may trade only on days it was in the top 100 by market cap ON THAT DAY (Phase 4 data, delisted included). */
 universeTop:100,
 /** Identical for every variant: 0.05% half-spread at entry, 0.05% fee + 0.05% slippage per side (paper Coinbase costs). */
 halfSpread:.0005,cost:.0005,
 fixedHorizonDays:7,
 trend:{emaDays:20,atrDays:14,atrMult:3,stretchAtr:3,tightAtr4h:2},
 rank:{lookbacks:[30,60,90],volDays:90,topFraction:1/3,trendDays:50},
 /** Coinbase product accepted for a CoinGecko id only if >= 90% of overlapping daily closes agree within 3%. */
 mapping:{maxDiff:.03,minShare:.9,minOverlapDays:30},
 benchmarkTop:50,
 /**
  * After the backfill, the daily top-up adds a few new top-2,500 coins (and Retry errors re-queues failures) as pass-1
  * pending. Up to this many may still be pending at start; the count is recorded and shown with the results.
  */
 maxPendingPass1:25,
};
export const VARIANTS=[
 {id:'A',label:'Current system as-is (4h breakout + continuation, 2R target from fill, stop, 7-day horizon)'},
 {id:'B',label:'B: A, continuation setups only'},
 {id:'C',label:'C: B + longs only when BTC closed above its 200-day SMA'},
 {id:'D',label:'D: C with trend exits (daily close < 20-day EMA, 3x daily ATR trail, 2x 4h ATR trail when > 3 ATR above the 20-day EMA); no fixed target'},
 {id:'E',label:'E: pure daily-candle version of D (daily signal, daily exits, no 4h trail)'},
 {id:'F',label:'F: hybrid (daily BTC regime + daily relative-strength top third and above own 50-day; 4h continuation trigger; D exits)'},
] as const;
export type VariantId=typeof VARIANTS[number]['id'];
const H=3600000,F4=4*H,D=86400000;
export const dayKey=(ms:number)=>new Date(Math.floor(ms/D)*D).toISOString().slice(0,10);
/** Groups complete hours into bars of `size` ms (close-time stamps); incomplete groups are dropped, never padded. */
export function aggregate(hourly:ExchangeBar[],size:number):ExchangeBar[]{
 const need=size/H,g=new Map<number,ExchangeBar[]>();
 for(const b of hourly){const t=Math.ceil(b.t/size)*size;g.set(t,[...(g.get(t)??[]),b]);}
 return [...g].filter(([t,b])=>b.length===need&&b[0].t===t-size+H&&b.at(-1)!.t===t).sort((a,b)=>a[0]-b[0])
  .map(([t,b])=>({t,o:b[0].o,h:Math.max(...b.map(x=>x.h)),l:Math.min(...b.map(x=>x.l)),c:b.at(-1)!.c,v:b.reduce((s,x)=>s+x.v,0)}));
}
/** Daily EMA(20) and ATR(14) per daily close time, using only bars completed at that time. */
export function dailyContext(daily:ExchangeBar[]){
 const {emaDays,atrDays}=HARNESS.trend,k=2/(emaDays+1),out=new Map<number,{ema:number;atr:number}>();
 let ema:number|null=null;const tr:number[]=[];
 daily.forEach((b,i)=>{ema=ema==null?b.c:b.c*k+ema*(1-k);const p=daily[i-1];tr.push(p?Math.max(b.h-b.l,Math.abs(b.h-p.c),Math.abs(b.l-p.c)):b.h-b.l);
  if(i>=Math.max(emaDays,atrDays))out.set(b.t,{ema,atr:tr.slice(-atrDays).reduce((s,x)=>s+x,0)/atrDays});});
 return out;
}
export type HarnessTrade={variant:VariantId;coin:string;kind:string;signalAt:string;entryAt:string;exitAt:string;fill:number;stop:number;exit:number;r:number;reason:string;marked:boolean};
export const netR=(price:number,fill:number,stop:number,c=HARNESS.cost)=>{const eff=price*(1-c);return (eff-fill-fill*c-eff*c)/(fill-stop);};
type Pos={fill:number;stop:number;target:number|null;entryAt:number};
/** Fixed plan on hourly bars: stop checked first in an ambiguous bar; gaps fill at the open; horizon marked at a close. */
export function exitFixed(p:Pos,hourly:ExchangeBar[],from:number,horizonEnd:number,dataEnd:number){
 for(let i=from;i<hourly.length;i++){const b=hourly[i];
  if(b.t-H<p.entryAt)continue;
  if(b.t>horizonEnd||b.t>dataEnd){const last=hourly[i-1];return last?{price:last.c,at:last.t,reason:b.t>horizonEnd?'HORIZON':'DATA_END',marked:true}:null;}
  if(b.o<=p.stop)return {price:b.o,at:b.t-H,reason:'STOP_GAP',marked:false};
  if(b.l<=p.stop)return {price:p.stop,at:b.t,reason:'STOP',marked:false};
  if(p.target!=null&&b.o>=p.target)return {price:b.o,at:b.t-H,reason:'TARGET_GAP',marked:false};
  if(p.target!=null&&b.h>=p.target)return {price:p.target,at:b.t,reason:'TARGET',marked:false};
 }
 const last=hourly.at(-1);return last&&last.t>p.entryAt?{price:last.c,at:last.t,reason:'DATA_END',marked:true}:null;
}
/**
 * Trend exits (D, F): initial structural stop; at each completed daily close, exit on close < EMA20, else raise the
 * stop to highest daily high since entry - 3 x daily ATR; at each completed 4h close, when the 4h close is more than
 * 3 daily ATR above the EMA20, raise the stop to highest 4h high since entry - 2 x 4h ATR(14). Stops only ratchet up.
 */
export function exitTrend(p:Pos,hourly:ExchangeBar[],from:number,ctx:Map<number,{ema:number;atr:number}>,four:ExchangeBar[],use4h:boolean,dataEnd:number){
 let stop=p.stop,hiD=-Infinity,hi4=-Infinity;const fourAtr=new Map<number,number>();
 if(use4h)four.forEach((b,i)=>{if(i<15)return;const tr=four.slice(i-14,i+1).map((x,j,a)=>j?Math.max(x.h-x.l,Math.abs(x.h-a[j-1].c),Math.abs(x.l-a[j-1].c)):0).slice(1);fourAtr.set(b.t,tr.reduce((s,x)=>s+x,0)/14);});
 const four4=new Map(four.map(b=>[b.t,b]));let dayHigh=-Infinity;
 for(let i=from;i<hourly.length;i++){const b=hourly[i];
  if(b.t-H<p.entryAt)continue;
  if(b.t>dataEnd)break;
  if(b.o<=stop)return {price:b.o,at:b.t-H,reason:'STOP_GAP',marked:false};
  if(b.l<=stop)return {price:stop,at:b.t,reason:stop>p.stop?'TRAIL_STOP':'STOP',marked:false};
  dayHigh=Math.max(dayHigh,b.h);
  if(b.t%D===0){const c=ctx.get(b.t);hiD=Math.max(hiD,dayHigh);dayHigh=-Infinity;
   if(c){if(b.c<c.ema)return {price:b.c,at:b.t,reason:'CLOSE_BELOW_EMA20',marked:false};stop=Math.max(stop,hiD-HARNESS.trend.atrMult*c.atr);}}
  if(use4h&&b.t%F4===0){const f=four4.get(b.t);if(f){hi4=Math.max(hi4,f.h);const c=ctx.get(Math.floor(b.t/D)*D),a4=fourAtr.get(b.t);
   if(c&&a4&&f.c>c.ema+HARNESS.trend.stretchAtr*c.atr)stop=Math.max(stop,hi4-HARNESS.trend.tightAtr4h*a4);}}
 }
 const last=hourly.filter(b=>b.t<=dataEnd).at(-1);return last&&last.t>p.entryAt?{price:last.c,at:last.t,reason:'DATA_END',marked:true}:null;
}
/** Daily-only trend exits (E): stop on the daily low (stop first), EMA20 close exit, 3 x ATR daily trail. */
export function exitDaily(p:Pos,daily:ExchangeBar[],ctx:Map<number,{ema:number;atr:number}>,dataEnd:number){
 let stop=p.stop,hi=-Infinity;
 for(const b of daily){if(b.t-D<p.entryAt)continue;if(b.t>dataEnd)break;
  if(b.o<=stop)return {price:b.o,at:b.t-D,reason:'STOP_GAP',marked:false};
  if(b.l<=stop)return {price:stop,at:b.t,reason:stop>p.stop?'TRAIL_STOP':'STOP',marked:false};
  hi=Math.max(hi,b.h);const c=ctx.get(b.t);
  if(c){if(b.c<c.ema)return {price:b.c,at:b.t,reason:'CLOSE_BELOW_EMA20',marked:false};stop=Math.max(stop,hi-HARNESS.trend.atrMult*c.atr);}
 }
 const last=daily.filter(b=>b.t<=dataEnd).at(-1);return last&&last.t>p.entryAt?{price:last.c,at:last.t,reason:'DATA_END',marked:true}:null;
}
export type CoinContext={coin:string;product:string;universeDays:Set<string>;rankDays:Set<string>;btcBull:Map<string,boolean>};
/** First hourly open inside the live entry zone within 4h of the signal, via the live planner (same costs for all variants). */
function enter(sig:ReturnType<typeof assessVolumeMomentum>,hourly:ExchangeBar[],idxFrom:number,signalT:number,window:number){
 for(let i=idxFrom;i<hourly.length;i++){const hb=hourly[i],open=hb.t-H;if(open<signalT)continue;if(open>=signalT+window)break;
  const q={bid:hb.o*(1-HARNESS.halfSpread),ask:hb.o*(1+HARNESS.halfSpread),priceAt:new Date(open).toISOString(),receivedAt:new Date(open).toISOString(),product:'X'};
  const plan=planCryptoPaper(sig,q,200000,200000,open,HARNESS.cost);if(plan.ok)return {plan,at:open,idx:i};}
 return null;
}
/** Runs A-D and F on one coin's hourly bars and E on its daily bars. Only completed candles at each decision. */
export function runCoin(ctx:CoinContext,hourly:ExchangeBar[],dataEnd:number):HarnessTrade[]{
 const trades:HarnessTrade[]=[],four=aggregate(hourly,F4),daily=aggregate(hourly,D),dctx=dailyContext(daily),start=Date.parse(HARNESS.from);
 const busy:Record<string,number>={A:0,B:0,C:0,D:0,E:0,F:0};
 const push=(v:VariantId,kind:string,sigT:number,e:{plan:{fill:number;stop:number};at:number},x:{price:number;at:number;reason:string;marked:boolean}|null)=>{
  if(!x)return;busy[v]=x.at;trades.push({variant:v,coin:ctx.coin,kind,signalAt:new Date(sigT).toISOString(),entryAt:new Date(e.at).toISOString(),exitAt:new Date(x.at).toISOString(),fill:e.plan.fill,stop:e.plan.stop,exit:x.price,r:netR(x.price,e.plan.fill,e.plan.stop),reason:x.reason,marked:x.marked});
 };
 let hIdx=0;
 for(let i=24;i<four.length;i++){
  const t=four[i].t;if(t<start||t>dataEnd)continue;
  const day=dayKey(t);if(!ctx.universeDays.has(day))continue;
  if(four[i].t-four[i-24].t!==24*F4)continue;
  const sig=assessVolumeMomentum(four.slice(i-24,i+1),t);if(sig.stage!=='MOMENTUM_VOLUME')continue;
  while(hIdx<hourly.length&&hourly[hIdx].t<=t)hIdx++;
  const cont=sig.kind==='CONTINUATION',bull=ctx.btcBull.get(day)===true,ranked=ctx.rankDays.has(day);
  const e=enter(sig,hourly,hIdx,t,F4);if(!e)continue;
  const pos={fill:e.plan.fill,stop:e.plan.stop,target:e.plan.target,entryAt:e.at};
  if(t>=busy.A)push('A',sig.kind!,t,e,exitFixed(pos,hourly,e.idx,e.at+HARNESS.fixedHorizonDays*D,dataEnd));
  if(cont&&t>=busy.B)push('B',sig.kind!,t,e,exitFixed(pos,hourly,e.idx,e.at+HARNESS.fixedHorizonDays*D,dataEnd));
  if(cont&&bull&&t>=busy.C)push('C',sig.kind!,t,e,exitFixed(pos,hourly,e.idx,e.at+HARNESS.fixedHorizonDays*D,dataEnd));
  if(cont&&bull&&t>=busy.D)push('D',sig.kind!,t,e,exitTrend({...pos,target:null},hourly,e.idx,dctx,four,true,dataEnd));
  if(cont&&bull&&ranked&&t>=busy.F)push('F',sig.kind!,t,e,exitTrend({...pos,target:null},hourly,e.idx,dctx,four,true,dataEnd));
 }
 // E: the same signal rules on completed daily candles, entry at the next daily open, daily exits.
 for(let i=24;i<daily.length-1;i++){
  const t=daily[i].t;if(t<start||t>dataEnd)continue;const day=dayKey(t);
  if(!ctx.universeDays.has(day)||ctx.btcBull.get(day)!==true||t<busy.E)continue;
  if(daily[i].t-daily[i-24].t!==24*D)continue;
  const sig=assessVolumeMomentum(daily.slice(i-24,i+1),t,D);if(sig.stage!=='MOMENTUM_VOLUME'||sig.kind!=='CONTINUATION')continue;
  const nb=daily[i+1];if(nb.t!==t+D)continue;
  const q={bid:nb.o*(1-HARNESS.halfSpread),ask:nb.o*(1+HARNESS.halfSpread),priceAt:new Date(t).toISOString(),receivedAt:new Date(t).toISOString(),product:'X'};
  // The live planner rejects signals older than 4h15m; for daily candles the entry is exactly at the next open.
  const plan=planCryptoPaper({...sig,asOf:new Date(t).toISOString()},q,200000,200000,t,HARNESS.cost);if(!plan.ok)continue;
  const e={plan,at:t};
  push('E','CONTINUATION',t,e,exitDaily({fill:plan.fill,stop:plan.stop,target:null,entryAt:t},daily,dctx,dataEnd));
 }
 return trades;
}
/** Coinbase product accepted for a CoinGecko id only when daily closes agree (symbol alone never decides). */
export function verifyMapping(daily:ExchangeBar[],cgPrice:Map<string,number>){
 // Coinbase daily bar with close time t closes at 00:00 of dayKey(t) = CoinGecko's 00:00 observation for that key.
 let n=0,ok=0;for(const b of daily){const p=cgPrice.get(dayKey(b.t));if(p==null||p<=0)continue;n++;if(Math.abs(b.c/p-1)<=HARNESS.mapping.maxDiff)ok++;}
 return {overlap:n,share:n?ok/n:0,accepted:n>=HARNESS.mapping.minOverlapDays&&ok/n>=HARNESS.mapping.minShare};
}
export type Stats={trades:number;winRate:number|null;expectancyR:number|null;profitFactor:number|null;maxDrawdownR:number;totalR:number;avgHoldDays:number|null;marked:number};
/** Per-trade R statistics; drawdown on the cumulative R curve ordered by exit time (1R risk per trade, overlaps allowed). */
export function stats(ts:HarnessTrade[]):Stats{
 const rs=ts.map(t=>t.r),wins=rs.filter(r=>r>0),losses=rs.filter(r=>r<0),gw=wins.reduce((s,r)=>s+r,0),gl=-losses.reduce((s,r)=>s+r,0);
 let eq=0,peak=0,dd=0;for(const t of [...ts].sort((a,b)=>a.exitAt.localeCompare(b.exitAt))){eq+=t.r;peak=Math.max(peak,eq);dd=Math.min(dd,eq-peak);}
 return {trades:ts.length,winRate:ts.length?wins.length/ts.length:null,expectancyR:ts.length?eq/ts.length:null,profitFactor:gl>0?gw/gl:null,maxDrawdownR:dd,totalR:eq,avgHoldDays:ts.length?ts.reduce((s,t)=>s+(Date.parse(t.exitAt)-Date.parse(t.entryAt))/D,0)/ts.length:null,marked:ts.filter(t=>t.marked).length};
}
/** Relative-strength top third (volatility-adjusted 30/60/90-day return) AND above own 50-day, per day, from point-in-time prices. */
export function rankTopThird(prices:Map<string,Map<string,number>>,universeByDay:Map<string,string[]>){
 const out=new Map<string,Set<string>>(),{lookbacks,volDays,topFraction,trendDays}=HARNESS.rank;
 const at=(m:Map<string,number>,day:string,back:number)=>m.get(dayKey(Date.parse(day)-back*D));
 for(const [day,ids] of universeByDay){
  const scored:{id:string;s:number;above:boolean}[]=[];
  for(const id of ids){const m=prices.get(id);if(!m)continue;const c=m.get(day);if(!c)continue;
   const hist:number[]=[];for(let k=volDays;k>=0;k--){const p=at(m,day,k);if(p==null){hist.length=0;break;}hist.push(p);}if(hist.length<volDays+1)continue;
   const rets=hist.slice(1).map((p,j)=>Math.log(p/hist[j])),mu=rets.reduce((s,x)=>s+x,0)/rets.length,sd=Math.sqrt(rets.reduce((s,x)=>s+(x-mu)**2,0)/(rets.length-1));if(!(sd>0))continue;
   const r=lookbacks.map(L=>c/at(m,day,L)!-1),sma=hist.slice(-trendDays).reduce((s,x)=>s+x,0)/trendDays;
   scored.push({id,s:r.reduce((a,b)=>a+b,0)/r.length/sd,above:c>sma});}
  // Rank ALL scored coins, take the top third, THEN require the coin to be above its own 50-day average.
  const keep=scored.sort((a,b)=>b.s-a.s).slice(0,Math.floor(scored.length*topFraction)).filter(x=>x.above);
  out.set(day,new Set(keep.map(x=>x.id)));
 }
 return out;
}
