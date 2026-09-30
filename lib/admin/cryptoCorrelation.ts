import {getRedis} from '@/lib/redis';
import {fourHourUrl,parseFourHour} from './cryptoVolumeMomentum';
import type {DailyPair} from './cryptoDailyVenues';
import type {ExchangeBar} from './cryptoExchangeVolume';
const F=4*3600000;
/** Correlation-aware sizing: risk shrinks as more open positions move with the candidate. */
export const CORRELATION={lookbackBars:30,minOverlap:20,threshold:.7,floor:.25,
 /** Portfolio-level cap on the combined risk-to-stop of one correlated cluster, % of equity (3 full 0.25% trades). */
 clusterRiskPct:.75,
 /** Below this fraction of a normal trade's risk, a squeezed entry is blocked rather than opened as a sliver. */
 minRiskFraction:.1};
/** Completed 4h bars, cached for the current 4h window (completed bars cannot change within it). */
export async function fourHourBars(pair:DailyPair,now=Date.now()):Promise<ExchangeBar[]>{
 const window=Math.floor(now/F)*F,key=`admin:crypto-markets:4h-bars:v1:${pair.exchange}:${pair.product}:${window}`,redis=getRedis();
 const cached=await redis?.get<ExchangeBar[]>(key).catch(()=>null);if(Array.isArray(cached)&&cached.length)return cached;
 const r=await fetch(fourHourUrl(pair,now),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error(`4h candles HTTP ${r.status}`);
 const bars=parseFourHour(pair,await r.json(),now);
 await redis?.set(key,bars,{ex:5*3600}).catch(()=>undefined);
 return bars;
}
/** Pairs an open paper instrument with its candle venue; unknown instruments return null. */
export function instrumentPair(instrumentType:string):DailyPair|null{
 const okx=instrumentType.startsWith('okx-usd-v1:'),product=okx?instrumentType.slice(11):instrumentType.startsWith('coinbase:')?instrumentType.slice(9):'';
 const [base,quote]=product.split('-');
 return base&&quote?{exchange:okx?'okex':'gdax',product,quote,volumeUnit:base}:null;
}
/** Pearson correlation of 4h log returns over the last lookback bars, aligned by candle time. */
export function returnCorrelation(a:ExchangeBar[],b:ExchangeBar[]):{rho:number;n:number}|null{
 const ret=(bars:ExchangeBar[])=>{const m=new Map<number,number>();for(let i=1;i<bars.length;i++)if(bars[i].t-bars[i-1].t===F)m.set(bars[i].t,Math.log(bars[i].c/bars[i-1].c));return m;};
 const ra=ret(a),rb=ret(b),times=[...ra.keys()].filter(t=>rb.has(t)).sort((x,y)=>x-y).slice(-CORRELATION.lookbackBars);
 if(times.length<CORRELATION.minOverlap)return null;
 const xs=times.map(t=>ra.get(t)!),ys=times.map(t=>rb.get(t)!),mean=(v:number[])=>v.reduce((s,n)=>s+n,0)/v.length,mx=mean(xs),my=mean(ys);
 let sxy=0,sxx=0,syy=0;for(let i=0;i<xs.length;i++){sxy+=(xs[i]-mx)*(ys[i]-my);sxx+=(xs[i]-mx)**2;syy+=(ys[i]-my)**2;}
 return sxx>0&&syy>0?{rho:sxy/Math.sqrt(sxx*syy),n:times.length}:null;
}
/**
 * Scale = 1/sqrt(1 + n), n = open positions with correlation >= threshold, floored at 25%.
 * An open position whose history is missing or too short counts as correlated (conservative); never estimated.
 */
export function correlationScale(candidate:ExchangeBar[],open:{coin:string;bars:ExchangeBar[]|null}[]){
 const correlated:{coin:string;rho:number}[]=[],unavailable:string[]=[];
 for(const o of open){
  const c=o.bars?returnCorrelation(candidate,o.bars):null;
  if(!c)unavailable.push(o.coin);else if(c.rho>=CORRELATION.threshold)correlated.push({coin:o.coin,rho:Math.round(c.rho*100)/100});
 }
 const n=correlated.length+unavailable.length;
 return {scale:Math.max(CORRELATION.floor,1/Math.sqrt(1+n)),correlated,unavailable,threshold:CORRELATION.threshold,lookbackBars:CORRELATION.lookbackBars};
}

/** Risk to stop after estimated exit costs, as the portfolio risk cap computes it. A missing stop is unbounded. */
export function positionRiskUsd(p:{instrumentType:string;averageEntry:number;stopLoss:number|null;quantity:number;entryFee?:number|null}){
 const cost=p.instrumentType.startsWith('okx-usd-v1:')?.001:.0005;
 return p.stopLoss==null?Infinity:Math.max(0,p.averageEntry-p.stopLoss*(1-cost))*p.quantity+(p.entryFee??p.averageEntry*p.quantity*cost)+p.stopLoss*(1-cost)*p.quantity*cost;
}
/**
 * Cluster cap at entry. The cluster is every open position correlated with the candidate, whose history is unavailable,
 * or that opened after the correlation check (conservative). Returns the risk scale allowed for the new trade.
 */
export function clusterAllowance(corr:{scale:number;correlated:{coin:string}[];unavailable:string[]},opens:{coin:string;riskUsd:number}[],checkedCoins:string[],equity:number,baseRiskUsd:number){
 const inCluster=new Set([...corr.correlated.map(c=>c.coin),...corr.unavailable,...opens.map(o=>o.coin).filter(c=>!checkedCoins.includes(c))]);
 const members=opens.filter(o=>inCluster.has(o.coin)),clusterRiskUsd=members.reduce((s,o)=>s+o.riskUsd,0),capUsd=equity*CORRELATION.clusterRiskPct/100;
 const room=Math.max(0,capUsd-clusterRiskUsd),scale=Math.min(corr.scale,baseRiskUsd>0?room/baseRiskUsd:0);
 return {members:members.map(o=>o.coin),clusterRiskUsd:Math.round(clusterRiskUsd*100)/100,capUsd:Math.round(capUsd*100)/100,scale,blocked:!(scale>=CORRELATION.minRiskFraction),capped:scale<corr.scale};
}
export type PortfolioCluster={coins:string[];riskUsd:number;capUsd:number;overCap:boolean};
/**
 * Every-cycle recheck across ALL open positions: groups positions linked by correlation >= threshold (single linkage).
 * Positions without enough history are listed separately and never merged by guess.
 */
export function portfolioClusters(opens:{coin:string;bars:ExchangeBar[]|null;riskUsd:number}[],equity:number){
 const parent=opens.map((_,i)=>i),find=(i:number):number=>parent[i]===i?i:(parent[i]=find(parent[i]));
 const pairs:{a:string;b:string;rho:number}[]=[],unavailable=opens.filter(o=>!o.bars).map(o=>o.coin);
 for(let i=0;i<opens.length;i++)for(let j=i+1;j<opens.length;j++){
  const a=opens[i].bars,b=opens[j].bars;if(!a||!b)continue;
  const c=returnCorrelation(a,b);if(!c)continue;
  if(c.rho>=CORRELATION.threshold){parent[find(i)]=find(j);pairs.push({a:opens[i].coin,b:opens[j].coin,rho:Math.round(c.rho*100)/100});}
 }
 const groups=new Map<number,number[]>();opens.forEach((_,i)=>groups.set(find(i),[...(groups.get(find(i))??[]),i]));
 const capUsd=equity*CORRELATION.clusterRiskPct/100;
 const clusters:PortfolioCluster[]=[...groups.values()].filter(g=>g.length>1).map(g=>{const riskUsd=g.reduce((s,i)=>s+opens[i].riskUsd,0);return {coins:g.map(i=>opens[i].coin),riskUsd:Math.round(riskUsd*100)/100,capUsd:Math.round(capUsd*100)/100,overCap:riskUsd>capUsd};}).sort((x,y)=>y.riskUsd-x.riskUsd);
 return {clusters,pairs,unavailable,threshold:CORRELATION.threshold,lookbackBars:CORRELATION.lookbackBars};
}
