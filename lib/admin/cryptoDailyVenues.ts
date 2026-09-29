import type {VenueEvidence} from './cryptoDiscovery';
import {parseExchangeCandles,type ExchangeBar} from './cryptoExchangeVolume';
export type DailyVenue='gdax'|'binance'|'kucoin'|'okex';
export type DailyPair={exchange:DailyVenue;product:string;quote:string;volumeUnit:string};
const D=86400000;
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
export function dailyVenueUrl(pair:DailyPair,now:number):string{
  if(!/^[A-Z0-9]{1,30}-(USD|USDT|USDC)$/.test(pair.product)||pair.product.split('-')[1]!==pair.quote||pair.product.split('-')[0]!==pair.volumeUnit)throw Error('Invalid discovered pair');
  const end=Math.floor(now/D)*D,start=end-30*D;
  if(pair.exchange==='gdax'){
    if(pair.quote!=='USD')throw Error('Unsupported Coinbase quote');
    return `https://api.exchange.coinbase.com/products/${pair.product}/candles?`+new URLSearchParams({granularity:'86400',start:new Date(start).toISOString(),end:new Date(end).toISOString()});
  }
  if(pair.exchange==='binance')return 'https://data-api.binance.vision/api/v3/klines?'+new URLSearchParams({symbol:pair.product.replace('-',''),interval:'1d',startTime:String(start),endTime:String(end-1),limit:'30',timeZone:'0'});
  if(pair.exchange==='kucoin')return 'https://api.kucoin.com/api/v1/market/candles?'+new URLSearchParams({symbol:pair.product,type:'1day',startAt:String(start/1000),endAt:String(end/1000-1)});
  if(pair.exchange==='okex')return 'https://www.okx.com/api/v5/market/history-candles?'+new URLSearchParams({instId:pair.product,bar:'1Dutc',after:String(end),limit:'30'});
  throw Error('Unsupported exchange');
}
export async function fetchDailyVenue(pair:DailyPair,now:number):Promise<ExchangeBar[]>{
  const res=await fetch(dailyVenueUrl(pair,now),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!res.ok)throw Error('Daily provider unavailable');
  const end=Math.floor(now/D)*D;
  return parseDailyVenue(pair.exchange,await res.json(),end-30*D,end);
}
