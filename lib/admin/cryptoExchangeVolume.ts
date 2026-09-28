import type {VenueEvidence} from './cryptoDiscovery';
import {reviewCryptoBase,type BaseReview} from './cryptoBase';
export type ExchangeBar={t:number;o:number;h:number;l:number;c:number;v:number};
export type ExchangeVolume={coinId:string;product:string;source:'Coinbase';fetchedAt:string;volumeUnit:string;hourly:ExchangeBar[];fourHourly:ExchangeBar[];daily:ExchangeBar[];base:BaseReview;latestVolume:number;averageVolume:number;relativeVolume:number|null;contractionRatio:number|null;volumeExpansion:boolean;priceAndVolumeBreakout:boolean};
const H=3600000,D=24*H;
export function selectCoinbasePair(venues:VenueEvidence[],now=Date.now()):string|null{
  // Use the identity-matched pair from discovery, never synthesize a ticker from a coin symbol.
  const v=venues.filter(v=>v.exchange==='gdax'&&/^[A-Z0-9]{1,30}\/USD$/.test(v.pair)&&Number.isFinite(Date.parse(v.observedAt))&&Date.parse(v.observedAt)<=now&&now-Date.parse(v.observedAt)<=15*60000&&v.volumeUsd>=250000&&v.spreadPct>=0&&v.spreadPct<=0.5).sort((a,b)=>b.volumeUsd-a.volumeUsd)[0];
  return v?v.pair.replace('/','-'):null;
}
/** Coinbase time is bucket START, unlike CoinGecko's close timestamps. */
export function parseExchangeCandles(raw:unknown,interval:number,start:number,end:number):ExchangeBar[]{
  if(!Array.isArray(raw))throw Error('Exchange returned no candle array');
  const bars=new Map<number,ExchangeBar>();
  for(const row of raw){
    if(!Array.isArray(row)||row.length<6||!row.slice(0,6).every(v=>typeof v==='number'&&Number.isFinite(v)))throw Error('Invalid exchange candle values');
    const [seconds,l,h,o,c,v]=row,t=seconds*1000+interval;
    if(seconds*1000<start||t>end)continue;
    if(seconds<=0||seconds*1000%interval!==0||Math.min(l,h,o,c)<=0||h<Math.max(l,o,c)||l>Math.min(h,o,c)||v<0)throw Error('Invalid exchange candle geometry or volume');
    const b={t,o,h,l,c,v},prior=bars.get(t);
    if(prior&&JSON.stringify(prior)!==JSON.stringify(b))throw Error('Conflicting exchange candles');
    bars.set(t,b);
  }
  const sorted=[...bars.values()].sort((a,b)=>a.t-b.t);
  for(let i=1;i<sorted.length;i++)if(sorted[i].t-sorted[i-1].t!==interval)throw Error('Missing exchange candle periods; no volume was invented');
  return sorted;
}
export function exchangeVolumeReview(coinId:string,product:string,hourly:ExchangeBar[],daily:ExchangeBar[],now=Date.now()):ExchangeVolume{
  if(hourly.length<100||daily.length<30)throw Error('Insufficient exchange history');
  if(now-hourly.at(-1)!.t>2*H||now-daily.at(-1)!.t>2*D)throw Error('Exchange candle history is stale');
  const groups=new Map<number,ExchangeBar[]>();
  for(const b of hourly){const t=Math.ceil(b.t/(4*H))*4*H;groups.set(t,[...(groups.get(t)??[]),b]);}
  const fourHourly=[...groups].filter(([t,b])=>t<=now&&b.length===4&&b[0].t===t-3*H&&b[3].t===t).map(([t,b])=>({t,o:b[0].o,h:Math.max(...b.map(x=>x.h)),l:Math.min(...b.map(x=>x.l)),c:b[3].c,v:b.reduce((sum,x)=>sum+x.v,0)}));
  if(fourHourly.length<21||now-fourHourly.at(-1)!.t>8*H)throw Error('Insufficient fresh four-hour candles');
  const last=fourHourly.at(-1)!,prior=fourHourly.slice(-21,-1),averageVolume=prior.reduce((s,b)=>s+b.v,0)/20;
  const relativeVolume=averageVolume>0?last.v/averageVolume:null;
  const baseDays=daily.filter(b=>b.t<=last.t-4*H).slice(-21);
  const mean=(b:ExchangeBar[])=>b.reduce((s,x)=>s+x.v,0)/b.length;
  const older=baseDays.slice(0,14),recent=baseDays.slice(14),contractionRatio=baseDays.length===21&&mean(older)>0?mean(recent)/mean(older):null;
  const rows=(b:ExchangeBar[])=>b.map(x=>[x.t,x.o,x.h,x.l,x.c]);
  const base=reviewCryptoBase(rows(hourly),rows(daily),last.c,now);
  const volumeExpansion=relativeVolume!==null&&relativeVolume>=1.5;
  return {coinId,product,source:'Coinbase',fetchedAt:new Date(now).toISOString(),volumeUnit:product.split('-')[0],hourly,fourHourly,daily,base,latestVolume:last.v,averageVolume,relativeVolume,contractionRatio,volumeExpansion,
    priceAndVolumeBreakout:base.stage==='BREAKOUT_PRICE_ONLY'&&volumeExpansion&&contractionRatio!==null&&contractionRatio<=0.7};
}
export async function fetchExchangeVolume(coinId:string,product:string,now=Date.now()):Promise<ExchangeVolume>{
  if(!/^[A-Z0-9]{1,30}-USD$/.test(product))throw Error('Unsupported exchange pair');
  const get=async(interval:number,count:number)=>{
    const end=Math.floor(now/interval)*interval,start=end-count*interval;
    const params=new URLSearchParams({granularity:String(interval/1000),start:new Date(start).toISOString(),end:new Date(end).toISOString()});
    const res=await fetch(`https://api.exchange.coinbase.com/products/${product}/candles?${params}`,{cache:'no-store',signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!res.ok)throw Error(`Coinbase candles unavailable (${res.status})`);
    return parseExchangeCandles(await res.json(),interval,start,end);
  };
  const [hourly,daily]=await Promise.all([get(H,240),get(D,90)]);
  return exchangeVolumeReview(coinId,product,hourly,daily,now);
}
