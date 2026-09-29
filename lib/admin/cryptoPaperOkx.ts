import {fetchPaperQuote,fetchCoinbaseCandles,parsePaperQuote,PaperMarketError,PAPER_RECOVERY_CANDLES,type CryptoPaperQuote} from './cryptoPaperMarket';
import {fillNoTradeGaps,NO_TRADE_MAX_BARS} from './cryptoCandleGaps';
import {parseDailyVenue,type DailyPair} from './cryptoDailyVenues';
import type {ExchangeBar} from './cryptoExchangeVolume';
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
/** OKX history-candles returns at most 100 rows; walk the `after` cursor back to the checkpoint. */
async function fetchOkxCandles(product:string,start:number,end:number):Promise<ExchangeBar[]>{
 // Reads NO_TRADE_MAX_BARS candles before `start` as an anchor so a no-trade run right after the checkpoint can be filled.
 const bars=new Map<number,ExchangeBar>(),lower=start-NO_TRADE_MAX_BARS*STEP;let cursor=end;
 for(let page=0;page<Math.ceil((PAPER_RECOVERY_CANDLES+NO_TRADE_MAX_BARS)/100)+1&&cursor>lower;page++){
  const raw=await json('https://www.okx.com/api/v5/market/history-candles?'+new URLSearchParams({instId:product,bar:'15m',after:String(cursor),limit:'100'}));
  const rows:unknown[]=Array.isArray(raw?.data)?raw.data:[];
  for(const b of parseDailyVenue('okex',raw,lower,end,STEP,true)){const prior=bars.get(b.t);if(prior&&JSON.stringify(prior)!==JSON.stringify(b))throw Error('Conflicting OKX exit candles');bars.set(b.t,b);}
  const oldest=Math.min(...rows.map(r=>Array.isArray(r)?Number(r[0]):NaN));
  if(!rows.length||!Number.isFinite(oldest)||oldest>=cursor)break;
  cursor=oldest;
 }
 return fillNoTradeGaps([...bars.values()],STEP).filter(b=>b.t>start);
}
export async function fetchOkxUsdPath(symbol:string,product:string,from:string):Promise<PaperExitPath>{
 if(!/^[A-Z0-9]{1,30}-USDT$/.test(product))throw new PaperMarketError('OKX USDT product required');
 const end=Math.floor(Date.now()/STEP)*STEP,start=Math.floor(Date.parse(from)/STEP)*STEP;
 if(!Number.isFinite(start)||start>end||start<end-PAPER_RECOVERY_CANDLES*STEP)throw new PaperMarketError('OKX/FX exit history requires recovery beyond the seven-day catch-up window or has invalid start');
 if(start===end)return {symbol,market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:[]};
 try{
  const [native,fx]=await Promise.all([fetchOkxCandles(product,start,end),fetchCoinbaseCandles('USDT-USD',start,end,STEP,NO_TRADE_MAX_BARS)]);
  if(native[0]?.t!==start+STEP||native.at(-1)?.t!==end||fx[0]?.t!==start+STEP||fx.at(-1)?.t!==end)throw Error('Incomplete OKX/FX exit history');
  return {...convertedExitPath(symbol,native,fx),filledBars:native.filter(b=>(b as {filled?:true}).filled).length+fx.filter(b=>b.filled).length};
 }catch(e){throw e instanceof PaperMarketError?e:new PaperMarketError(e instanceof Error?e.message:'OKX/FX history invalid');}
}
