import {parseExchangeCandles,type ExchangeBar,selectCoinbasePair} from './cryptoExchangeVolume';
import type {DiscoveryRow,VenueEvidence} from './cryptoDiscovery';
export type BaseScanRow={id:string;symbol:string;product:string|null;stage:'PENDING'|'BASE'|'NOT_BASE'|'UNAVAILABLE'|'EXCLUDED';reason:string;asOf:string|null;high:number|null;low:number|null;widthPct:number|null;gapPct:number|null;slopePct:number|null;contraction:number|null};
export type BaseScan={version:1;discoveryAt:string;startedAt:string;updatedAt:string;rows:BaseScanRow[]};
const D=86400000;
export function createBaseScan(rows:(DiscoveryRow&{venues:VenueEvidence[]})[],discoveryAt:string,now:number):BaseScan{
  return {version:1,discoveryAt,startedAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),rows:rows.map((r):BaseScanRow=>{
    const product=selectCoinbasePair(r.venues,now);
    // Supplement discovery's heuristic: a near-dollar peg must not become a tight-base candidate.
    const pegged=/stablecoin|wrapped|bridged|staked|(?:^|[\s-])(?:usd[a-z0-9]*|[a-z]*usd|dai|eurc|paxg|xaut)(?:$|[\s-])/i.test(`${r.id} ${r.symbol} ${r.name}`);
    const excluded=r.stage==='EXCLUDED'||pegged;
    return {id:r.id,symbol:r.symbol,product,stage:excluded?'EXCLUDED':product?'PENDING':'UNAVAILABLE',reason:excluded?'Excluded by discovery or pegged-asset screening':product?'Waiting for completed daily candles':'No supported Coinbase USD pair in discovery',asOf:null,high:null,low:null,widthPct:null,gapPct:null,slopePct:null,contraction:null};
  }).sort((a,b)=>a.id.localeCompare(b.id))};
}
/** A daily watchlist only. No breakout, live quote or trade permission is inferred. */
export function assessDailyBase(row:BaseScanRow,bars:ExchangeBar[],now:number):BaseScanRow{
  const unavailable=(reason:string):BaseScanRow=>({...row,stage:'UNAVAILABLE',reason});
  if(bars.length<24)return unavailable('At least 24 completed daily candles required');
  const days=bars.slice(-24),last=days.at(-1)!;
  if(last.t>now||now-last.t>D+2*3600000)return unavailable('Daily candles are stale or future dated');
  for(let i=0;i<days.length;i++){
    const b=days[i];
    if(![b.t,b.o,b.h,b.l,b.c,b.v].every(Number.isFinite)||Math.min(b.o,b.h,b.l,b.c)<=0||b.v<0||b.h<Math.max(b.o,b.c,b.l)||b.l>Math.min(b.o,b.c)||b.t%D!==0||(i>0&&b.t-days[i-1].t!==D))return unavailable('Invalid or missing daily candles');
  }
  const base=days.slice(-21),mean=(a:number[])=>a.reduce((s,v)=>s+v,0)/a.length;
  const high=Math.max(...base.map(b=>b.h)),low=Math.min(...base.map(b=>b.l));
  const slow=mean(days.slice(-20).map(b=>b.c)),fast=mean(days.slice(-5).map(b=>b.c)),prior=mean(days.slice(-23,-3).map(b=>b.c));
  const widthPct=(high/low-1)*100,gapPct=Math.abs(fast/slow-1)*100,slopePct=Math.abs(slow/prior-1)*100;
  const older=mean(base.slice(0,14).map(b=>b.v)),recent=mean(base.slice(14).map(b=>b.v));
  const contraction=older>0?recent/older:null;
  const result={...row,asOf:new Date(last.t).toISOString(),high,low,widthPct,gapPct,slopePct,contraction};
  if(contraction===null||recent===0)return {...result,stage:'UNAVAILABLE',reason:'Zero volume baseline or recent volume; cannot validate contraction'};
  const passes=widthPct<=15&&gapPct<=3&&slopePct<=3&&contraction<=0.7;
  return {...result,stage:passes?'BASE':'NOT_BASE',reason:passes?'Tight flat 21-day range with contracting daily volume; watchlist only':'Failed: '+[widthPct>15?'range width >15%':null,gapPct>3?'MA gap >3%':null,slopePct>3?'MA slope >3%':null,contraction>0.7?'volume ratio >0.70':null].filter(Boolean).join(', ')};
}
export async function fetchDailyBase(row:BaseScanRow,now:number):Promise<BaseScanRow>{
  if(!row.product||!/^[A-Z0-9]{1,30}-USD$/.test(row.product))throw Error('Unsupported pair');
  const end=Math.floor(now/D)*D,start=end-30*D;
  const params=new URLSearchParams({granularity:'86400',start:new Date(start).toISOString(),end:new Date(end).toISOString()});
  const res=await fetch(`https://api.exchange.coinbase.com/products/${row.product}/candles?${params}`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!res.ok)throw Error('Daily provider unavailable');
  return assessDailyBase(row,parseExchangeCandles(await res.json(),D,start,end),now);
}
