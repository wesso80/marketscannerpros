import {parseExchangeCandles} from './cryptoExchangeVolume';
import type {PaperExitPath} from './portfolio-lab/paperExitPath';
import type {VolumeMomentum} from './cryptoVolumeMomentum';
export class PaperMarketError extends Error {}
export type CryptoPaperQuote={bid:number;ask:number;priceAt:string;receivedAt:string;product:string};
export function parsePaperQuote(raw:unknown,product:string,now=Date.now()):CryptoPaperQuote{
 const b=raw as Record<string,unknown>;const bid=Number(b?.bid),ask=Number(b?.ask),at=Date.parse(String(b?.time??''));
 if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<bid||!Number.isFinite(at)||at>now||now-at>60000)throw new PaperMarketError('Ticker has stale last-trade time or invalid bid/ask');
 return {bid,ask,priceAt:new Date(at).toISOString(),receivedAt:new Date(now).toISOString(),product};
}
export async function fetchPaperQuote(product:string):Promise<CryptoPaperQuote>{
 if(!/^[A-Z0-9]{1,30}-USD$/.test(product))throw Error('Coinbase USD required');
 const r=await fetch(`https://api.exchange.coinbase.com/products/${product}/ticker`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw new PaperMarketError(`Quote provider HTTP ${r.status}`);
 return parsePaperQuote(await r.json(),product);
}
export async function fetchPaperPath(symbol:string,product:string,from?:string):Promise<PaperExitPath>{
 if(!/^[A-Z0-9]{1,30}-USD$/.test(product))throw Error('Coinbase USD required');
 const step=900000,end=Math.floor(Date.now()/step)*step;
 const requested=from?Math.floor(Date.parse(from)/step)*step:end-299*step;
 if(!Number.isFinite(requested)||requested>end)throw new PaperMarketError('Invalid exit history start');
 if(requested<end-299*step)throw new PaperMarketError('Exit history requires recovery beyond the 299-candle window');
 const start=requested;
 if(start===end)return {symbol,market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:[]};
 const params=new URLSearchParams({granularity:'900',start:new Date(start).toISOString(),end:new Date(end).toISOString()});
 const r=await fetch(`https://api.exchange.coinbase.com/products/${product}/candles?${params}`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw new PaperMarketError(`Exit history provider HTTP ${r.status}`);
 let bars;try{bars=parseExchangeCandles(await r.json(),step,start,end);}catch(error){throw new PaperMarketError(error instanceof Error?error.message:'Exit candle validation failed');}
 return {symbol,market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:bars.map(b=>({openAt:b.t-step,closeAt:b.t,open:b.o,high:b.h,low:b.l,close:b.c}))};
}
export function planCryptoPaper(signal:VolumeMomentum,quote:CryptoPaperQuote,equity:number,cash:number,now=Date.now()){
 const fail=(reason:string)=>({ok:false as const,reason});
 if(signal.stage!=='MOMENTUM_VOLUME'||!signal.asOf||!Number.isFinite(Date.parse(signal.asOf))||now-Date.parse(signal.asOf)>4*3600000+900000||Date.parse(signal.asOf)>now)return fail('No current confirmed momentum setup');
 if(![signal.stop,signal.target,signal.maxEntry,signal.entryFloor,equity,cash,quote.ask,quote.bid].every(v=>typeof v==='number'&&Number.isFinite(v)))return fail('Missing plan or account inputs');
 if(quote.bid<=0||quote.ask<quote.bid||!Number.isFinite(Date.parse(quote.priceAt))||Date.parse(quote.priceAt)>now||now-Date.parse(quote.priceAt)>60000)return fail('Quote stale or invalid');
 if((quote.ask/quote.bid-1)*100>0.5)return fail('Spread above 0.5%');
 const fill=quote.ask*1.0005,stop=Number(signal.stop!.toFixed(8)),target=Number(signal.target!.toFixed(8)),fee=.0005;
 // Bound rounding error from the existing NUMERIC(18,8) ledger.
 if(Math.min(fill,stop,target)<0.0001||Math.max(fill,stop,target)>=1e10)return fail('Price outside supported paper precision');
 if(equity<=0||cash<=0||stop<=0||fill<=stop||fill>=target||fill>signal.maxEntry!||quote.ask<signal.entryFloor!)return fail('Current quote is outside the valid entry zone');
 const loss=fill-stop*(1-.0005)+fee*(fill+stop*(1-.0005));
 const reward=target*(1-.0005)-fill-fee*(fill+target*(1-.0005));
 if(loss<=0||reward/loss<1.5)return fail('Reward/risk below 1.5 after estimated costs');
 const quantity=Math.floor(Math.min(equity*.0025/loss,equity*.1/fill,cash/(fill*(1+fee)))*1e8)/1e8;
 if(quantity<=0||quantity>=1e12||quantity*fill<10)return fail('Insufficient size');
 return {ok:true as const,fill,stop,target,quantity,notional:quantity*fill,risk:quantity*loss,rewardRisk:reward/loss};
}
