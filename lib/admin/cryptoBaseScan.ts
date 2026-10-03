import type {ExchangeBar} from './cryptoExchangeVolume';
import {selectDailyPair,fetchDailyVenue,type DailyVenue} from './cryptoDailyVenues';
import type {DiscoveryRow,VenueEvidence} from './cryptoDiscovery';
export type BaseScanRow={id:string;symbol:string;product:string|null;exchange:DailyVenue|null;quote:string|null;volumeUnit:string|null;stage:'PENDING'|'BASE'|'NOT_BASE'|'UNAVAILABLE'|'EXCLUDED';reason:string;asOf:string|null;high:number|null;low:number|null;widthPct:number|null;gapPct:number|null;slopePct:number|null;contraction:number|null};
export type BaseScan={version:2;discoveryAt:string;startedAt:string;updatedAt:string;rows:BaseScanRow[]};
const D=86400000;
/** Tight-base gates in assessDailyBase. Width, SMA5/20 gap and SMA20 slope are percents; contraction is recent/older volume. */
export const DAILY_BASE_LIMITS={widthPct:15,gapPct:3,slopePct:3,contraction:0.7} as const;
export function createBaseScan(rows:(DiscoveryRow&{venues:VenueEvidence[]})[],discoveryAt:string,now:number):BaseScan{
  return {version:2,discoveryAt,startedAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),rows:rows.map((r):BaseScanRow=>{
    const pair=selectDailyPair(r.venues,now),product=pair?.product??null;
    // Supplement discovery's heuristic: a near-dollar peg must not become a tight-base candidate.
    const pegged=/stablecoin|wrapped|bridged|staked|(?:^|[\s-])(?:usd[a-z0-9]*|[a-z]*usd|dai|eurc|paxg|xaut)(?:$|[\s-])/i.test(`${r.id} ${r.symbol} ${r.name}`);
    const excluded=r.stage==='EXCLUDED'||pegged;
    return {id:r.id,symbol:r.symbol,product,exchange:pair?.exchange??null,quote:pair?.quote??null,volumeUnit:pair?.volumeUnit??null,stage:excluded?'EXCLUDED':product?'PENDING':'UNAVAILABLE',reason:excluded?'Excluded by discovery or pegged-asset screening':product?'Waiting for completed daily candles':'No supported fresh USD/USDT/USDC pair in discovery',asOf:null,high:null,low:null,widthPct:null,gapPct:null,slopePct:null,contraction:null};
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
  const L=DAILY_BASE_LIMITS;
  const passes=widthPct<=L.widthPct&&gapPct<=L.gapPct&&slopePct<=L.slopePct&&contraction<=L.contraction;
  return {...result,stage:passes?'BASE':'NOT_BASE',reason:passes?'Tight flat 21-day range with contracting daily volume; watchlist only':'Failed: '+[widthPct>L.widthPct?`range width >${L.widthPct}%`:null,gapPct>L.gapPct?`MA gap >${L.gapPct}%`:null,slopePct>L.slopePct?`MA slope >${L.slopePct}%`:null,contraction>L.contraction?`volume ratio >${L.contraction.toFixed(2)}`:null].filter(Boolean).join(', ')};
}
export async function fetchDailyBase(row:BaseScanRow,now:number):Promise<BaseScanRow>{
  if(!row.product||!row.exchange||!row.quote||!row.volumeUnit)throw Error('Unsupported pair');
  return assessDailyBase(row,await fetchDailyVenue({exchange:row.exchange,product:row.product,quote:row.quote,volumeUnit:row.volumeUnit},now),now);
}
