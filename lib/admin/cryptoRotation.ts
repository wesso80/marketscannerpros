/**
 * Weekly relative-strength rotation, SIMULATED research only. Rules below were fixed BEFORE the first run
 * (rotation-v1). Changing any of them makes a new version that must be reported as a separate variant.
 * Decisions use only daily candles completed at the decision close; every fill is at the NEXT day's open.
 */
export const ROTATION={
 version:'rotation-v1',
 simStart:Date.UTC(2022,0,1),inSampleEnd:Date.UTC(2025,0,1),
 holdings:6,exitRank:12,universeSize:50,minHistoryDays:120,volumeDays:30,minMedianUsdVolume:1e6,
 lookbacks:[30,60,90],volDays:90,trendDays:20,regimeDays:200,slotDailyVolTarget:.04,
 rebalanceWeekday:1,staleDays:5,costsPerSide:[.001,.003,.006],primaryCost:.003,
};
const D=86400000;
/** Daily series aligned to a shared grid of close times; null = no candle that day (never filled in). */
export type RotationSeries={product:string;base:string;status:string;o:(number|null)[];c:(number|null)[];usdVol:(number|null)[]};
export type RotationData={days:number[];btc:RotationSeries;coins:RotationSeries[]};
export type RotationTrade={product:string;entryDecision:string;entryAt:string;entryPrice:number;exitDecision:string|null;exitAt:string|null;exitPrice:number|null;reason:string|null;weight:number;rankAtEntry:number;scoreAtEntry:number;returnPct:number|null;holdDays:number|null;marked?:true};
export type EquityPoint={t:number;equity:number;exposure:number};
const mean=(a:number[])=>a.reduce((s,n)=>s+n,0)/a.length;
const median=(a:number[])=>{const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
function sd(a:number[]){const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1));}
/** Values for the last n grid days ending at i; null when any day is missing (no partial windows). */
function window(a:(number|null)[],i:number,n:number):number[]|null{
 if(i-n+1<0)return null;const out:number[]=[];for(let k=i-n+1;k<=i;k++){const v=a[k];if(v==null)return null;out.push(v);}return out;
}
export function regimeOn(btc:RotationSeries,i:number):boolean|null{
 const w=window(btc.c,i,ROTATION.regimeDays);return w?w.at(-1)!>mean(w):null;
}
const listedCache=new WeakMap<RotationSeries,Int32Array>();
/** Running count of days with a candle, computed once per series. */
function listedDays(s:RotationSeries,i:number){
 let a=listedCache.get(s);
 if(!a){a=new Int32Array(s.c.length);let n=0;s.c.forEach((c,k)=>{if(c!=null)n++;a![k]=n;});listedCache.set(s,a);}
 return a[i];
}
export type Ranked={idx:number;product:string;score:number;vol:number;trendUp:boolean;rank:number};
/** Universe (top 50 by median 30-day USD volume, >= $1m, >= 120 days listed) ranked by volatility-adjusted momentum. */
export function rankUniverse(coins:RotationSeries[],i:number):Ranked[]{
 const pool:{idx:number;vol30:number}[]=[];
 coins.forEach((s,idx)=>{
  if(s.c[i]==null)return;
  if(listedDays(s,i)<ROTATION.minHistoryDays)return;
  const v=s.usdVol.slice(Math.max(0,i-ROTATION.volumeDays+1),i+1).filter((x):x is number=>x!=null);
  if(v.length<ROTATION.volumeDays*.8)return;
  const m=median(v);if(m>=ROTATION.minMedianUsdVolume)pool.push({idx,vol30:m});
 });
 pool.sort((a,b)=>b.vol30-a.vol30);
 const scored:Omit<Ranked,'rank'>[]=[];
 for(const {idx} of pool.slice(0,ROTATION.universeSize)){
  const s=coins[idx],closes=window(s.c,i,ROTATION.volDays+1);if(!closes)continue;
  const rets=closes.slice(1).map((c,k)=>Math.log(c/closes[k])),vol=sd(rets);if(!(vol>0))continue;
  const c=closes.at(-1)!,r=ROTATION.lookbacks.map(L=>c/closes[closes.length-1-L]-1);
  const trend=window(s.c,i,ROTATION.trendDays)!;
  scored.push({idx,product:s.product,score:mean(r)/vol,vol,trendUp:c>mean(trend)});
 }
 return scored.sort((a,b)=>b.score-a.score).map((x,k)=>({...x,rank:k+1}));
}
type Pos={idx:number;units:number;trade:RotationTrade;lastClose:number;missing:number};
export type RotationRun={equity:EquityPoint[];trades:RotationTrade[];regimeUnknownDays:number;dataEndedExits:number;unfilledEntries:number};
/** Rotation with or without the BTC 200-day regime switch; cash earns nothing; long only, no leverage. */
export function simulateRotation(data:RotationData,cost:number,useRegime=true,start=ROTATION.simStart):RotationRun{
 const {days,coins}=data,equity:EquityPoint[]=[],trades:RotationTrade[]=[];
 let cash=1,held:Pos[]=[],pendingBuys:{idx:number;weight:number;rank:number;score:number;decision:number}[]=[],pendingSells=new Map<number,{reason:string;decision:number}>();
 let regimeUnknownDays=0,dataEndedExits=0,unfilledEntries=0;
 const first=days.findIndex(t=>t>=start);if(first<0)return {equity,trades,regimeUnknownDays,dataEndedExits,unfilledEntries};
 const close=(p:Pos,i:number)=>{const c=coins[p.idx].c[i];if(c!=null){p.lastClose=c;p.missing=0;}else p.missing++;return p.lastClose;};
 const exit=(p:Pos,price:number,i:number,reason:string,decision:number,marked=false)=>{
  cash+=p.units*price*(1-cost);
  Object.assign(p.trade,{exitDecision:new Date(days[decision]).toISOString(),exitAt:new Date(days[i]-(marked?0:D)).toISOString(),exitPrice:price,reason,returnPct:price*(1-cost)/(p.trade.entryPrice/(1-cost))-1,holdDays:Math.round((days[i]-Date.parse(p.trade.entryAt))/D)},marked?{marked:true}:{});
 };
 for(let i=first;i<days.length;i++){
  // 1. Fills at today's open (decided at yesterday's close). Sells first so their cash can fund buys.
  for(const [idx,s] of [...pendingSells]){
   const p=held.find(h=>h.idx===idx);if(!p){pendingSells.delete(idx);continue;}
   const o=coins[idx].o[i];if(o==null)continue;
   exit(p,o,i,s.reason,s.decision);held=held.filter(h=>h!==p);pendingSells.delete(idx);
  }
  const eqOpen=cash+held.reduce((s,p)=>s+p.units*(coins[p.idx].o[i]??p.lastClose),0);
  for(const b of pendingBuys){
   const o=coins[b.idx].o[i];if(o==null||held.some(h=>h.idx===b.idx)){unfilledEntries++;continue;}
   const spend=Math.min(cash,b.weight*eqOpen);if(spend<=1e-9){unfilledEntries++;continue;}
   const entryPrice=o;cash-=spend;
   const trade:RotationTrade={product:coins[b.idx].product,entryDecision:new Date(days[b.decision]).toISOString(),entryAt:new Date(days[i]-D).toISOString(),entryPrice,exitDecision:null,exitAt:null,exitPrice:null,reason:null,weight:b.weight,rankAtEntry:b.rank,scoreAtEntry:Math.round(b.score*1000)/1000,returnPct:null,holdDays:null};
   trades.push(trade);held.push({idx:b.idx,units:spend*(1-cost)/o,trade,lastClose:o,missing:0});
  }
  pendingBuys=[];
  // 2. Mark at today's close. A coin with no candles for staleDays is closed at its last close (flagged DATA_ENDED).
  for(const p of [...held]){close(p,i);if(p.missing>=ROTATION.staleDays){exit(p,p.lastClose,i,'DATA_ENDED',i,true);held=held.filter(h=>h!==p);pendingSells.delete(p.idx);dataEndedExits++;}}
  const eq=cash+held.reduce((s,p)=>s+p.units*p.lastClose,0);
  equity.push({t:days[i],equity:eq,exposure:eq>0?(eq-cash)/eq:0});
  if(i===days.length-1)break;
  // 3. Decisions at today's close.
  const regime=useRegime?regimeOn(data.btc,i):true;
  if(regime==null)regimeUnknownDays++;
  const weekly=new Date(days[i]-D).getUTCDay()===ROTATION.rebalanceWeekday;
  const ranked=weekly?rankUniverse(coins,i):[];
  const rankOf=new Map(ranked.map(r=>[r.idx,r]));
  for(const p of held){
   if(pendingSells.has(p.idx))continue;
   const c=coins[p.idx].c[i],trend=window(coins[p.idx].c,i,ROTATION.trendDays);
   const reason=regime===false?'REGIME_OFF':c!=null&&trend&&c<mean(trend)?'BELOW_20D':weekly&&(rankOf.get(p.idx)?.rank??Infinity)>ROTATION.exitRank?'RANK_DROP':null;
   if(reason)pendingSells.set(p.idx,{reason,decision:i});
  }
  if(weekly&&regime===true){
   const staying=held.filter(p=>!pendingSells.has(p.idx)).length,slots=ROTATION.holdings-staying,n=ROTATION.holdings;
   for(const r of ranked.filter(r=>r.score>0&&r.trendUp&&!held.some(h=>h.idx===r.idx)).slice(0,Math.max(0,slots)))
    pendingBuys.push({idx:r.idx,rank:r.rank,score:r.score,decision:i,weight:Math.min(1/n,(1/n)*ROTATION.slotDailyVolTarget/r.vol)});
  }
 }
 // Positions still open at the end are marked at the last close (not realised; flagged).
 const last=days.length-1;for(const p of held)exit(p,p.lastClose,last,'OPEN_AT_END',last,true);
 return {equity,trades,regimeUnknownDays,dataEndedExits,unfilledEntries};
}
/** Buy BTC at the first open and hold. */
export function simulateHold(s:RotationSeries,days:number[],cost:number,start=ROTATION.simStart):EquityPoint[]{
 const first=days.findIndex((t,i)=>t>=start&&s.o[i]!=null);if(first<0)return [];
 const units=(1-cost)/s.o[first]!;let last=s.o[first]!;
 return days.slice(first).map((t,k)=>{last=s.c[first+k]??last;return {t,equity:units*last,exposure:1};});
}
/** Equal weight across the same weekly universe, always invested, rebalanced weekly at the next open. */
export function simulateEqualWeight(data:RotationData,cost:number,start=ROTATION.simStart):EquityPoint[]{
 const {days,coins}=data,out:EquityPoint[]=[];let cash=1,units=new Map<number,number>(),last=new Map<number,number>(),target:number[]|null=null;
 const first=days.findIndex(t=>t>=start);if(first<0)return out;
 for(let i=first;i<days.length;i++){
  if(target){
   const px=(idx:number)=>coins[idx].o[i]??last.get(idx)??0;
   const eq=cash+[...units].reduce((s,[idx,u])=>s+u*px(idx),0),tradable=target.filter(idx=>coins[idx].o[i]!=null),w=tradable.length?1/tradable.length:0;
   for(const [idx,u] of [...units]){if(coins[idx].o[i]==null)continue;const want=tradable.includes(idx)?w*eq/px(idx):0;if(want<u){cash+=(u-want)*px(idx)*(1-cost);want>0?units.set(idx,want):units.delete(idx);}}
   for(const idx of tradable){const u=units.get(idx)??0,want=w*eq/px(idx);if(want>u){const spend=Math.min(cash,(want-u)*px(idx));cash-=spend;units.set(idx,u+spend*(1-cost)/px(idx));}}
   target=null;
  }
  for(const idx of units.keys()){const c=coins[idx].c[i];if(c!=null)last.set(idx,c);}
  const eq=cash+[...units].reduce((s,[idx,u])=>s+u*(last.get(idx)??0),0);
  out.push({t:days[i],equity:eq,exposure:eq>0?(eq-cash)/eq:0});
  if(new Date(days[i]-D).getUTCDay()===ROTATION.rebalanceWeekday)target=rankUniverse(coins,i).map(r=>r.idx);
 }
 return out;
}
export type Metrics={from:string;to:string;days:number;totalReturn:number;cagr:number;maxDrawdown:number;annVol:number;sharpe:number|null;timeInMarket:number};
export function metrics(eq:EquityPoint[],from:number,to:number):Metrics|null{
 const s=eq.filter(p=>p.t>=from&&p.t<to);if(s.length<30)return null;
 const base=eq[eq.indexOf(s[0])-1]?.equity??s[0].equity,rets=s.map((p,k)=>p.equity/(k?s[k-1].equity:base)-1);
 let peak=base,mdd=0;for(const p of s){peak=Math.max(peak,p.equity);mdd=Math.min(mdd,p.equity/peak-1);}
 const total=s.at(-1)!.equity/base-1,years=s.length/365,v=sd(rets);
 return {from:new Date(s[0].t).toISOString(),to:new Date(s.at(-1)!.t).toISOString(),days:s.length,totalReturn:total,cagr:(1+total)**(1/years)-1,maxDrawdown:mdd,annVol:v*Math.sqrt(365),sharpe:v>0?mean(rets)/v*Math.sqrt(365):null,timeInMarket:mean(s.map(p=>p.exposure>0?1:0))};
}
export type TradeStats={trades:number;winRate:number|null;avgReturn:number|null;avgHoldDays:number|null;best:number|null;worst:number|null;top3ShareOfGains:number|null;byReason:Record<string,number>};
export function tradeStats(trades:RotationTrade[],from:number,to:number):TradeStats{
 const t=trades.filter(x=>x.returnPct!=null&&Date.parse(x.entryAt)>=from&&Date.parse(x.entryAt)<to),r=t.map(x=>x.returnPct!);
 const gains=r.filter(x=>x>0).sort((a,b)=>b-a),sumG=gains.reduce((s,x)=>s+x,0),byReason:Record<string,number>={};
 for(const x of t)byReason[x.reason??'UNKNOWN']=(byReason[x.reason??'UNKNOWN']??0)+1;
 return {trades:t.length,winRate:r.length?gains.length/r.length:null,avgReturn:r.length?mean(r):null,avgHoldDays:t.length?mean(t.map(x=>x.holdDays??0)):null,best:r.length?Math.max(...r):null,worst:r.length?Math.min(...r):null,top3ShareOfGains:sumG>0?gains.slice(0,3).reduce((s,x)=>s+x,0)/sumG:null,byReason};
}
