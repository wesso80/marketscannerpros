import type {FlowStamp} from './cryptoFlow';
import type {JevStamp} from './cryptoJev';
import type {CatalystStamp} from './cryptoJevCatalyst';
import type {ChartStamp} from './cryptoJevChart';
import type {ShadowStamp} from './cryptoShadowScore';
import type {ExchangeBar} from './cryptoExchangeVolume';
import {parseDailyVenue,selectDailyPair,type DailyPair} from './cryptoDailyVenues';
import type {DiscoveryRow,VenueEvidence} from './cryptoDiscovery';
import {createBaseScan} from './cryptoBaseScan';
const H=3600000,F=4*H;
export type VolumeMomentum={stage:'PENDING'|'EARLY_WATCH'|'MOMENTUM_VOLUME'|'VOLUME_WATCH'|'EXTENDED'|'NO_SIGNAL'|'UNAVAILABLE'|'EXCLUDED';reason:string;asOf:string|null;relativeVolume:number|null;changePct:number|null;trigger:number|null;close:number|null;atr:number|null;stop?:number;target?:number;maxEntry?:number;entryFloor?:number;sma20?:number;signal?:{t:number;o:number;h:number;l:number;c:number};kind:'BREAKOUT'|'CONTINUATION'|null;
 /** The 25 validated exchange candles the rule read, newest last, kept on named rows only so the chart can show price and volume. */
 bars?:{t:number;o:number;h:number;l:number;c:number;v:number}[]};
export type MomentumScanRow=VolumeMomentum&{id:string;symbol:string;pair:DailyPair|null;flowStamp?:FlowStamp;jev?:JevStamp;catalyst?:CatalystStamp;chart?:ChartStamp;shadow?:ShadowStamp};
export type MomentumScan={version:1;startedAt:string;updatedAt:string;discoveryAt:string;rows:MomentumScanRow[]};
export const blankMomentum=(reason='Waiting for completed 4h candles'):VolumeMomentum=>({stage:'PENDING',reason,asOf:null,relativeVolume:null,changePct:null,trigger:null,close:null,atr:null,kind:null});
export function createMomentumScan(rows:(DiscoveryRow&{venues:VenueEvidence[]})[],discoveryAt:string,now:number):MomentumScan{
 const screened=createBaseScan(rows,discoveryAt,now);
 return {version:1,startedAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),discoveryAt,rows:screened.rows.map(r=>{
  const pair=selectDailyPair(rows.find(x=>x.id===r.id)!.venues,now);
  return {...blankMomentum(),id:r.id,symbol:r.symbol,pair,stage:r.stage==='EXCLUDED'?'EXCLUDED':pair?'PENDING':'UNAVAILABLE',reason:r.stage==='EXCLUDED'?r.reason:pair?'Waiting for completed 4h candles':'No supported fresh pair'};
 })};
}
export function assessVolumeMomentum(bars:ExchangeBar[],now:number,interval=F):VolumeMomentum{
 const label=interval===H?'1h':'4h';
 const result=blankMomentum(),fail=(reason:string):VolumeMomentum=>({...result,stage:'UNAVAILABLE',reason});
 if(bars.length<25)return fail(`At least 25 completed ${label} candles required`);
 const b=bars.slice(-25),last=b.at(-1)!,prev=b.at(-2)!;
 if(last.t>now||now-last.t>interval+15*60000)return fail(`${label} candles stale or future dated`);
 for(let i=0;i<b.length;i++){
  const x=b[i];if(![x.t,x.o,x.h,x.l,x.c,x.v].every(Number.isFinite)||x.t%interval!==0||Math.min(x.o,x.h,x.l,x.c)<=0||x.v<0||x.h<Math.max(x.o,x.l,x.c)||x.l>Math.min(x.o,x.c)||(i>0&&x.t-b[i-1].t!==interval))return fail(`Invalid or missing ${label} candles`);
 }
 const mean=(a:number[])=>a.reduce((s,n)=>s+n,0)/a.length;
 const prior=b.slice(-21,-1),avgVolume=mean(prior.map(x=>x.v));
 if(avgVolume<=0)return fail('No usable volume baseline');
 const rv=last.v/avgVolume,change=(last.c/prev.c-1)*100,trigger=Math.max(...prior.map(x=>x.h));
 const sma=mean(b.slice(-20).map(x=>x.c)),oldSma=mean(b.slice(-21,-1).map(x=>x.c));
 // ATR baseline excludes the signal bar so a large breakout cannot inflate its own allowance.
 const tr=b.slice(1,-1).map((x,i)=>Math.max(x.h-x.l,Math.abs(x.h-b[i].c),Math.abs(x.l-b[i].c)));
 const atr=mean(tr.slice(-14));if(atr<=0)return fail('No usable range baseline');
  Object.assign(result,{asOf:new Date(last.t).toISOString(),relativeVolume:rv,changePct:change,trigger,close:last.c,atr,sma20:sma,signal:{t:last.t,o:last.o,h:last.h,l:last.l,c:last.c}});
 const rising=last.c>sma&&sma>oldSma,breakout=last.c>trigger,continuation=change>=1&&last.c>prev.h;
 const expanded=rv>=1.5;
 if(expanded&&rising&&(breakout||continuation)){
  result.kind=breakout?'BREAKOUT':'CONTINUATION';
  const stop=Math.min(...b.slice(-6).map(x=>x.l))-0.25*atr,risk=last.c-stop;
  if(stop<=0||risk<=0)return fail('Invalid structural stop');
  Object.assign(result,{stop,target:last.c+2*risk,maxEntry:Math.min(last.c+0.5*atr,(last.c+2*risk+1.5*stop)/2.5),entryFloor:breakout?trigger:prev.h});
  const stretched=last.c-sma>2.5*atr||last.c-trigger>atr||Math.max(last.h-last.l,Math.abs(last.h-prev.c),Math.abs(last.l-prev.c))>3*atr;
  result.stage=stretched?'EXTENDED':'MOMENTUM_VOLUME';
  result.reason=stretched?'Price and volume advanced, but the completed move exceeds the ATR chase limits':'Completed '+label+' '+(breakout?'20-bar breakout':'trend continuation')+' with at least 1.5× prior 20-bar volume; no base required';
 }else if(expanded){result.stage='VOLUME_WATCH';result.reason=`Elevated ${label} volume without the required upward price confirmation; not a buy signal`;}
 else{result.stage='NO_SIGNAL';result.reason=`No qualifying price-and-volume momentum setup on the latest completed ${label} candle`;}
 if(result.stage!=='NO_SIGNAL')result.bars=b.map(x=>({t:x.t,o:x.o,h:x.h,l:x.l,c:x.c,v:x.v}));
 return result;
}
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
/** The word "confirmed" is allowed only while the saved close or quote is inside the zone and the long stop is under that price. */
export function setupDisplayLabel(row:Pick<VolumeMomentum,'stage'|'stop'|'close'|'entryFloor'|'maxEntry'>,quote?:number|null):string{
 if(row.stage!=='MOMENTUM_VOLUME')return row.stage;
 const price=finite(quote)?quote:row.close;
 if(!finite(row.stop)||!finite(price)||!(row.stop<price))return 'invalid stop';
 if(!finite(row.entryFloor)||!finite(row.maxEntry)||price<row.entryFloor||price>row.maxEntry)return 'outside entry zone';
 return 'confirmed';
}
export function fourHourUrl(pair:DailyPair,now:number):string{
 if(!/^[A-Z0-9]{1,30}-(USD|USDT|USDC)$/.test(pair.product)||pair.product.split('-')[0]!==pair.volumeUnit||pair.product.split('-')[1]!==pair.quote)throw Error('Unsupported pair');
 const end=Math.floor(now/F)*F,start=end-60*F;
 if(pair.exchange==='gdax'){
  if(pair.quote!=='USD')throw Error('Unsupported quote');
  return `https://api.exchange.coinbase.com/products/${pair.product}/candles?`+new URLSearchParams({granularity:'3600',start:new Date(start).toISOString(),end:new Date(end).toISOString()});
 }
 if(pair.exchange==='binance')return 'https://data-api.binance.vision/api/v3/klines?'+new URLSearchParams({symbol:pair.product.replace('-',''),interval:'4h',startTime:String(start),endTime:String(end-1),limit:'60',timeZone:'0'});
 if(pair.exchange==='kucoin')return 'https://api.kucoin.com/api/v1/market/candles?'+new URLSearchParams({symbol:pair.product,type:'4hour',startAt:String(start/1000),endAt:String(end/1000-1)});
 if(pair.exchange==='okex')return 'https://www.okx.com/api/v5/market/history-candles?'+new URLSearchParams({instId:pair.product,bar:'4H',after:String(end),limit:'60'});
 throw Error('Unsupported venue');
}
export function parseFourHour(pair:DailyPair,raw:unknown,now:number):ExchangeBar[]{
 const end=Math.floor(now/F)*F,start=end-60*F;
 if(pair.exchange!=='gdax')return parseDailyVenue(pair.exchange,raw,start,end,F);
 const hourly=parseDailyVenue('gdax',raw,start,end,H),groups=new Map<number,ExchangeBar[]>();
 for(const b of hourly){const t=Math.ceil(b.t/F)*F;groups.set(t,[...(groups.get(t)??[]),b]);}
 return [...groups].filter(([t,b])=>b.length===4&&b[0].t===t-3*H&&b[3].t===t).map(([t,b])=>({t,o:b[0].o,h:Math.max(...b.map(x=>x.h)),l:Math.min(...b.map(x=>x.l)),c:b[3].c,v:b.reduce((s,x)=>s+x.v,0)}));
}
export async function fetchVolumeMomentum(pair:DailyPair,now:number):Promise<VolumeMomentum>{
 const r=await fetch(fourHourUrl(pair,now),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Exchange unavailable');
 return assessVolumeMomentum(parseFourHour(pair,await r.json(),now),now);
}
