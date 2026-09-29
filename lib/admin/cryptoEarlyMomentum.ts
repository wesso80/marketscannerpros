import {fourHourUrl,assessVolumeMomentum,type VolumeMomentum} from './cryptoVolumeMomentum';
import {parseDailyVenue,type DailyPair} from './cryptoDailyVenues';
const H=3600000;
export function hourlyMomentumUrl(pair:DailyPair,now:number):string {
 const url=new URL(fourHourUrl(pair,now)),end=Math.floor(now/H)*H,start=end-60*H;
 if(pair.exchange==='gdax'){url.searchParams.set('start',new Date(start).toISOString());url.searchParams.set('end',new Date(end).toISOString());}
 if(pair.exchange==='binance'){url.searchParams.set('interval','1h');url.searchParams.set('startTime',String(start));url.searchParams.set('endTime',String(end-1));}
 if(pair.exchange==='kucoin'){url.searchParams.set('type','1hour');url.searchParams.set('startAt',String(start/1000));url.searchParams.set('endAt',String(end/1000-1));}
 if(pair.exchange==='okex'){url.searchParams.set('bar','1H');url.searchParams.set('after',String(end));}
 return url.toString();
}
export async function fetchEarlyMomentum(pair:DailyPair,now:number):Promise<VolumeMomentum>{
 const r=await fetch(hourlyMomentumUrl(pair,now),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('Hourly exchange candles unavailable');
 const end=Math.floor(now/H)*H,bars=parseDailyVenue(pair.exchange,await r.json(),end-60*H,end,H);
 const assessed=assessVolumeMomentum(bars,now,H);
 // Explicitly remove entry levels: an hourly watch must never become paper permission.
 const {stop,target,maxEntry,entryFloor,...watch}=assessed;
 return {...watch,stage:watch.stage==='MOMENTUM_VOLUME'?'EARLY_WATCH':watch.stage,reason:watch.stage==='MOMENTUM_VOLUME'?'Hourly price and volume expansion; early research watch only, awaiting independent 4h confirmation':watch.reason};
}
