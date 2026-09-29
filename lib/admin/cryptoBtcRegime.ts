import {getRedis} from '@/lib/redis';
import {fetchCoinbaseCandles} from './cryptoPaperMarket';
import type {ExchangeBar} from './cryptoExchangeVolume';
const D=86400000,KEY='admin:crypto-markets:btc-regime:v1';
/** Recorded on every paper entry during beta; it tags trades for comparison and never blocks them. */
export type BtcRegime={state:'UP'|'DOWN'|'MIXED'|'UNAVAILABLE';asOf:string|null;close:number|null;sma20:number|null;sma50:number|null;source:'coinbase:BTC-USD 1d';checkedAt:string;reason:string};
const unavailable=(reason:string,now:number):BtcRegime=>({state:'UNAVAILABLE',asOf:null,close:null,sma20:null,sma50:null,source:'coinbase:BTC-USD 1d',checkedAt:new Date(now).toISOString(),reason});
export function assessBtcRegime(bars:ExchangeBar[],now=Date.now()):BtcRegime{
 const end=Math.floor(now/D)*D;
 if(bars.length<50)return unavailable('Fewer than 50 completed BTC daily candles',now);
 if(bars.at(-1)!.t!==end)return unavailable('Latest completed BTC daily candle missing',now);
 const mean=(n:number)=>bars.slice(-n).reduce((s,b)=>s+b.c,0)/n;
 const close=bars.at(-1)!.c,sma20=mean(20),sma50=mean(50);
 const state=close>sma50&&sma20>sma50?'UP':close<sma50&&sma20<sma50?'DOWN':'MIXED';
 const reason=state==='UP'?'BTC daily close above its 50-day average, 20-day above 50-day':state==='DOWN'?'BTC daily close below its 50-day average, 20-day below 50-day':'BTC daily close and 20-day average disagree about the 50-day trend';
 return {state,asOf:new Date(end).toISOString(),close,sma20,sma50,source:'coinbase:BTC-USD 1d',checkedAt:new Date(now).toISOString(),reason};
}
/** Saved regime only; page loads must not request provider data. */
export async function savedBtcRegime():Promise<BtcRegime|null>{
 const r=await getRedis()?.get<BtcRegime>(KEY).catch(()=>null);
 return r&&typeof r.state==='string'&&typeof r.checkedAt==='string'?r:null;
}
/** Reuses the regime for the current UTC day; a failed check is returned as UNAVAILABLE, never guessed. */
export async function currentBtcRegime(now=Date.now()):Promise<BtcRegime>{
 const saved=await savedBtcRegime(),end=Math.floor(now/D)*D;
 if(saved&&saved.state!=='UNAVAILABLE'&&saved.asOf===new Date(end).toISOString())return saved;
 let regime:BtcRegime;
 try{regime=assessBtcRegime(await fetchCoinbaseCandles('BTC-USD',end-60*D,end,D),now);}
 catch(e){regime=unavailable(`BTC daily candles unavailable: ${e instanceof Error?e.message:'request failed'}`,now);}
 await getRedis()?.set(KEY,regime,{ex:2*D/1000}).catch(()=>undefined);
 return regime;
}
