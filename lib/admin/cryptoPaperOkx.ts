import {fetchPaperQuote,parsePaperQuote,PaperMarketError,type CryptoPaperQuote} from './cryptoPaperMarket';
import {parseDailyVenue,type DailyPair} from './cryptoDailyVenues';
import {parseExchangeCandles,type ExchangeBar} from './cryptoExchangeVolume';
import type {VolumeMomentum} from './cryptoVolumeMomentum';
import type {PaperExitPath} from './portfolio-lab/paperExitPath';
import type {ArcaPortfolio} from './portfolio-lab/types';
const STEP=900000;
export type ConvertedPaperQuote=CryptoPaperQuote&{conversion:{pair:'USDT-USD';bid:number;ask:number;at:string;nativeBid:number;nativeAsk:number;nativeAt:string}};
export function supportsPaperPair(pair:DailyPair|null):boolean{
 return !!pair&&((pair.exchange==='gdax'&&pair.quote==='USD')||(pair.exchange==='okex'&&pair.quote==='USDT'))&&new RegExp(`^[A-Z0-9]{1,30}-${pair.quote}$`).test(pair.product)&&pair.product.split('-')[0]===pair.volumeUnit;
}
export function paperCostPortfolio(p:ArcaPortfolio,instrument:string):ArcaPortfolio{
 // Two estimated legs for OKX: asset/USDT plus USDT/USD. Never modify stored account settings.
 return instrument.startsWith('okx-usd-v1:')?{...p,settings:{...p.settings,feesPctEstimate:.10,slippagePctEstimate:.10}}:p;
}
export function parseOkxQuote(raw:unknown,product:string,now=Date.now()):CryptoPaperQuote{
 const b=raw as {code?:string;data?:Array<Record<string,string>>},r=b?.data?.[0];
 if(b?.code!=='0'||b.data?.length!==1||!r||r.instId!==product||r.instType!=='SPOT'||!Number.isFinite(Number(r.bidSz))||Number(r.bidSz)<=0||!Number.isFinite(Number(r.askSz))||Number(r.askSz)<=0||!/^\d+$/.test(r.ts??''))throw new PaperMarketError('OKX spot quote identity, size or timestamp invalid');
 return {...parsePaperQuote({bid:r.bidPx,ask:r.askPx,time:new Date(Number(r.ts)).toISOString()},product,now),source:'okx_spot_ticker'};
}
export function convertOkxQuote(native:CryptoPaperQuote,fx:CryptoPaperQuote,now=Date.now()):ConvertedPaperQuote{
 if(fx.product!=='USDT-USD')throw new PaperMarketError('USDT/USD conversion pair missing');
 // Independently validate both timestamps; never assume a one-dollar peg.
 parsePaperQuote({bid:native.bid,ask:native.ask,time:native.priceAt},native.product,now);
 parsePaperQuote({bid:fx.bid,ask:fx.ask,time:fx.priceAt},fx.product,now);
 if((fx.ask/fx.bid-1)*100>.5)throw new PaperMarketError('USDT/USD conversion spread above 0.5%');
 return {bid:native.bid*fx.bid,ask:native.ask*fx.ask,priceAt:new Date(Math.min(Date.parse(native.priceAt),Date.parse(fx.priceAt))).toISOString(),receivedAt:new Date(now).toISOString(),product:native.product,source:'okx_usdt_converted_to_usd',conversion:{pair:'USDT-USD',bid:fx.bid,ask:fx.ask,at:fx.priceAt,nativeBid:native.bid,nativeAsk:native.ask,nativeAt:native.priceAt}};
}
async function json(url:string){const r=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw new PaperMarketError(`OKX/FX provider HTTP ${r.status}`);return r.json();}
export async function fetchOkxUsdQuote(product:string):Promise<ConvertedPaperQuote>{
 if(!/^[A-Z0-9]{1,30}-USDT$/.test(product))throw new PaperMarketError('OKX USDT product required');
 const [raw,fx]=await Promise.all([json('https://www.okx.com/api/v5/market/ticker?'+new URLSearchParams({instId:product})),fetchPaperQuote('USDT-USD')]);
 return convertOkxQuote(parseOkxQuote(raw,product),fx);
}
export function usdSignal(signal:VolumeMomentum,quote:ConvertedPaperQuote):VolumeMomentum{
 const rate=(quote.conversion.bid+quote.conversion.ask)/2;
 if(rate<.98||rate>1.02)throw new PaperMarketError('USDT deviates over 2% from USD; new entries paused');
 return {...signal,...Object.fromEntries(['stop','target','maxEntry','entryFloor','close','trigger','atr'].map(k=>{const n=signal[k as keyof VolumeMomentum];return [k,typeof n==='number'?n*rate:n];}))};
}
/** Conservative USD path: low is a lower bound; high proves only a minimum reached high.
 * Multiplying two highs would invent a target when extremes happened at different times.
 * Possible stops may be charged conservatively; these are not exact synthetic OHLC/fills.
 */
export function convertedExitPath(symbol:string,native:ExchangeBar[],fx:ExchangeBar[]):PaperExitPath{
 const byTime=new Map(fx.map(b=>[b.t,b]));
 const candles=native.map(b=>{
  const f=byTime.get(b.t);if(!f)throw new PaperMarketError('Missing matching USDT/USD exit candle');
  // Opens/closes are bounds too: first/last trades on separate venues need not coincide.
  const open=b.o*f.l,close=b.c*f.l,low=b.l*f.l;
  const high=Math.max(b.h*f.l,b.l*f.h);
  return {openAt:b.t-STEP,closeAt:b.t,open,close,low,high};
 });
 return {symbol,market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles};
}
export async function fetchOkxUsdPath(symbol:string,product:string,from:string):Promise<PaperExitPath>{
 if(!/^[A-Z0-9]{1,30}-USDT$/.test(product))throw new PaperMarketError('OKX USDT product required');
 const end=Math.floor(Date.now()/STEP)*STEP,start=Math.floor(Date.parse(from)/STEP)*STEP;
 if(!Number.isFinite(start)||start>end||start<end-299*STEP)throw new PaperMarketError('OKX/FX exit history requires recovery or has invalid start');
 if(start===end)return {symbol,market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:[]};
 const [raw,fxRaw]=await Promise.all([
  json('https://www.okx.com/api/v5/market/history-candles?'+new URLSearchParams({instId:product,bar:'15m',after:String(end),limit:'300'})),
  json('https://api.exchange.coinbase.com/products/USDT-USD/candles?'+new URLSearchParams({granularity:'900',start:new Date(start).toISOString(),end:new Date(end).toISOString()}))
 ]);
 try{
  const native=parseDailyVenue('okex',raw,start,end,STEP),fx=parseExchangeCandles(fxRaw,STEP,start,end);
  if(native[0]?.t!==start+STEP||native.at(-1)?.t!==end||fx[0]?.t!==start+STEP||fx.at(-1)?.t!==end)throw Error('Incomplete OKX/FX exit history');
  return convertedExitPath(symbol,native,fx);
 }catch(e){throw new PaperMarketError(e instanceof Error?e.message:'OKX/FX history invalid');}
}
