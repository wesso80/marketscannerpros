import type {VenueEvidence} from './cryptoDiscovery';
import {parseExchangeCandles,type ExchangeBar} from './cryptoExchangeVolume';
export type DailyVenue='gdax'|'binance'|'kucoin'|'okex';
export type DailyPair={exchange:DailyVenue;product:string;quote:string;volumeUnit:string};
const D=86400000;
/** One response per call. Coinbase rejects more than 300 candles; this repo pages Coinbase at 299. Binance klines allow 1000. KuCoin returns at most 1500. OKX history-candles returns at most 100 (see cryptoPaperOkx). */
export function dailyCandleCap(exchange:DailyVenue):number{
  if(exchange==='gdax')return 300;
  if(exchange==='binance')return 1000;
  if(exchange==='kucoin')return 1500;
  return 100;
}
/** Prior-window compression needs two lengths. 180 covers 90 plus the prior 90. OKX stays at its 100-row cap, so its 90-day window is not scored. */
export const COMPRESSION_FETCH_DAYS=180;
export function compressionFetchDays(exchange:DailyVenue):number{
  return Math.min(COMPRESSION_FETCH_DAYS,dailyCandleCap(exchange));
}
export function selectDailyPair(venues:VenueEvidence[],now:number):DailyPair|null{
  const eligible=venues.filter(v=>['gdax','binance','kucoin','okex'].includes(v.exchange)&&/^[A-Z0-9]{1,30}\/(USD|USDT|USDC)$/.test(v.pair)&&Number.isFinite(Date.parse(v.observedAt))&&Date.parse(v.observedAt)<=now&&now-Date.parse(v.observedAt)<=900000&&Number.isFinite(v.volumeUsd)&&v.volumeUsd>=250000&&Number.isFinite(v.spreadPct)&&v.spreadPct>=0&&v.spreadPct<=0.5&&(v.exchange!=='gdax'||v.pair.endsWith('/USD')));
  // Retain Coinbase where available; otherwise choose the largest qualified pair.
  eligible.sort((a,b)=>Number(b.exchange==='gdax')-Number(a.exchange==='gdax')||b.volumeUsd-a.volumeUsd||a.exchange.localeCompare(b.exchange)||a.pair.localeCompare(b.pair));
  const v=eligible[0];if(!v)return null;const [base,quote]=v.pair.split('/');
  return {exchange:v.exchange as DailyVenue,product:v.pair.replace('/','-'),quote,volumeUnit:base};
}
const number=(v:unknown):number=>{
  if((typeof v!=='number'&&typeof v!=='string')||(typeof v==='string'&&!v.trim()))throw Error('Missing numeric candle value');
  const n=Number(v);if(!Number.isFinite(n))throw Error('Invalid numeric candle value');return n;
};
/** Normalize base-asset volume and bucket starts into the shared Coinbase-shaped validator. */
export function parseDailyVenue(exchange:DailyVenue,raw:unknown,start:number,end:number,interval=D,allowGaps=false):ExchangeBar[]{
  if(exchange==='gdax')return parseExchangeCandles(raw,interval,start,end,allowGaps);
  let rows:unknown=raw;
  if(exchange==='kucoin'||exchange==='okex'){
    if(!raw||typeof raw!=='object'||!('code' in raw)||!('data' in raw)||raw.code!==(exchange==='kucoin'?'200000':'0'))throw Error('Provider rejected candles');
    rows=raw.data;
  }
  if(!Array.isArray(rows))throw Error('No candle array');
  const normalized:number[][]=[];
  for(const row of rows){
    if(!Array.isArray(row))throw Error('Invalid candle row');
    if(exchange==='binance'){
      if(row.length<7)throw Error('Incomplete Binance candle');
      const t=number(row[0]);if(t<start||t+interval>end)continue;
      if(number(row[6])!==t+interval-1)throw Error('Unexpected Binance candle close time');
      normalized.push([t/1000,number(row[3]),number(row[2]),number(row[1]),number(row[4]),number(row[5])]);
    }else if(exchange==='kucoin'){
      if(row.length<7)throw Error('Incomplete KuCoin candle');
      const t=number(row[0]);if(t*1000<start||t*1000+interval>end)continue;
      normalized.push([t,number(row[4]),number(row[3]),number(row[1]),number(row[2]),number(row[5])]);
    }else{
      if(row.length<9)throw Error('Incomplete OKX candle');
      if(row[8]!=='0'&&row[8]!=='1')throw Error('Unknown OKX candle completion');
      if(row[8]==='0')continue;
      const t=number(row[0]);if(t<start||t+interval>end)continue;
      normalized.push([t/1000,number(row[3]),number(row[2]),number(row[1]),number(row[4]),number(row[5])]);
    }
  }
  return parseExchangeCandles(normalized,interval,start,end,allowGaps);
}
export function dailyVenueUrl(pair:DailyPair,now:number,days=30):string{
  if(!/^[A-Z0-9]{1,30}-(USD|USDT|USDC)$/.test(pair.product)||pair.product.split('-')[1]!==pair.quote||pair.product.split('-')[0]!==pair.volumeUnit)throw Error('Invalid discovered pair');
  if(!Number.isInteger(days)||days<1||days>dailyCandleCap(pair.exchange))throw Error('Unsupported candle span');
  const end=Math.floor(now/D)*D,start=end-days*D;
  if(pair.exchange==='gdax'){
    if(pair.quote!=='USD')throw Error('Unsupported Coinbase quote');
    return `https://api.exchange.coinbase.com/products/${pair.product}/candles?`+new URLSearchParams({granularity:'86400',start:new Date(start).toISOString(),end:new Date(end).toISOString()});
  }
  if(pair.exchange==='binance')return 'https://data-api.binance.vision/api/v3/klines?'+new URLSearchParams({symbol:pair.product.replace('-',''),interval:'1d',startTime:String(start),endTime:String(end-1),limit:String(days),timeZone:'0'});
  if(pair.exchange==='kucoin')return 'https://api.kucoin.com/api/v1/market/candles?'+new URLSearchParams({symbol:pair.product,type:'1day',startAt:String(start/1000),endAt:String(end/1000-1)});
  if(pair.exchange==='okex')return 'https://www.okx.com/api/v5/market/history-candles?'+new URLSearchParams({instId:pair.product,bar:'1Dutc',after:String(end),limit:String(days)});
  throw Error('Unsupported exchange');
}
/** One provider call. The default span is the original 30 days. */
export async function loadDailyVenue(pair:DailyPair,now:number,days=30):Promise<{raw:unknown;end:number}>{
  const res=await fetch(dailyVenueUrl(pair,now,days),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!res.ok)throw Error('Daily provider unavailable');
  return {raw:await res.json(),end:Math.floor(now/D)*D};
}
export async function fetchDailyVenue(pair:DailyPair,now:number,days=30):Promise<ExchangeBar[]>{
  const {raw,end}=await loadDailyVenue(pair,now,days);
  return parseDailyVenue(pair.exchange,raw,end-days*D,end);
}
