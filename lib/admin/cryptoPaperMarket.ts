import {parseExchangeCandles,type ExchangeBar} from './cryptoExchangeVolume';
import {fillNoTradeGaps,NO_TRADE_MAX_BARS,type FilledBar,type TrailingAnchor} from './cryptoCandleGaps';
import type {PaperExitPath} from './portfolio-lab/paperExitPath';
import type {VolumeMomentum} from './cryptoVolumeMomentum';
export class PaperMarketError extends Error {}
export type CryptoPaperQuote={bid:number;ask:number;priceAt:string;receivedAt:string;product:string;source?:string;sequence?:number};
export function parsePaperQuote(raw:unknown,product:string,now=Date.now()):CryptoPaperQuote{
 const b=raw as Record<string,unknown>;const bid=Number(b?.bid),ask=Number(b?.ask),at=Date.parse(String(b?.time??''));
 if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<bid||!Number.isFinite(at)||at>now||now-at>60000)throw new PaperMarketError('Ticker has stale last-trade time or invalid bid/ask');
 return {bid,ask,priceAt:new Date(at).toISOString(),receivedAt:new Date(now).toISOString(),product};
}
/** Coinbase book time timestamps the quote snapshot; ticker time timestamps its last trade. */
export function parsePaperBook(raw:unknown,product:string,now=Date.now()):CryptoPaperQuote{
 const b=raw as {bids?:unknown[][];asks?:unknown[][];time?:string;sequence?:number;auction_mode?:boolean};
 const bid=b?.bids?.[0],ask=b?.asks?.[0];
 if(b?.auction_mode===true)throw new PaperMarketError('Order book is in auction mode');
 if(!bid||!ask||!Number.isFinite(Number(bid[1]))||Number(bid[1])<=0||!Number.isFinite(Number(ask[1]))||Number(ask[1])<=0||!Number.isFinite(b.sequence))throw new PaperMarketError('Order book is empty or invalid');
 const at=Date.parse(b.time??'');
 if(!Number.isFinite(at)||at>now||now-at>60000)throw new PaperMarketError('Order book timestamp is missing, future or stale');
 const quote=parsePaperQuote({bid:bid[0],ask:ask[0],time:b.time},product,now);
 return {...quote,source:'coinbase_order_book',sequence:b.sequence};
}
export async function fetchPaperQuote(product:string):Promise<CryptoPaperQuote>{
 if(!/^[A-Z0-9]{1,30}-USD$/.test(product))throw Error('Coinbase USD required');
 const r=await fetch(`https://api.exchange.coinbase.com/products/${product}/book?level=1`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw new PaperMarketError(`Quote provider HTTP ${r.status}`);
 return parsePaperBook(await r.json(),product);
}
/** Exit catch-up bound: seven days of 15m candles. Older gaps still require manual recovery. */
export const PAPER_RECOVERY_CANDLES=672;
const COINBASE_PAGE=299;
/**
 * Pages Coinbase candles oldest-first so a missed interval is replayed in full, never truncated.
 * fillGaps>0: also reads that many candles before `start` as an anchor, fills bounded no-trade gaps between real
 * candles (see fillNoTradeGaps), then returns only candles closing after `start`.
 */
/** anchor (optional, with fillGaps): receives the last REAL candle in the fetched window, including the pre-start look-back. */
export async function fetchCoinbaseCandles(product:string,start:number,end:number,step=900000,fillGaps=0,anchor?:{last?:ExchangeBar}):Promise<FilledBar[]>{
 const bars:FilledBar[]=[],from0=start-fillGaps*step;
 for(let from=from0;from<end;from+=COINBASE_PAGE*step){
  const to=Math.min(end,from+COINBASE_PAGE*step);
  const params=new URLSearchParams({granularity:String(step/1000),start:new Date(from).toISOString(),end:new Date(to).toISOString()});
  const r=await fetch(`https://api.exchange.coinbase.com/products/${product}/candles?${params}`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw new PaperMarketError(`Exit history provider HTTP ${r.status}`);
  let page;try{page=parseExchangeCandles(await r.json(),step,from,to,fillGaps>0);}catch(error){throw new PaperMarketError(error instanceof Error?error.message:'Exit candle validation failed');}
  // Each page must join the previous one exactly; a missing boundary candle is a gap, not a skip.
  if(!fillGaps&&bars.length&&page.length&&page[0].t-bars.at(-1)!.t!==step)throw new PaperMarketError('Missing exit candles between history pages');
  bars.push(...page);
 }
 if(!fillGaps)return bars;
 if(anchor)anchor.last=bars.at(-1);
 try{return fillNoTradeGaps(bars,step,fillGaps).filter(b=>b.t>start);}catch(error){throw new PaperMarketError(error instanceof Error?error.message:'Exit candle gap');}
}
export async function fetchPaperPath(symbol:string,product:string,from?:string):Promise<PaperExitPath&{trailingAnchor?:TrailingAnchor}>{
 if(!/^[A-Z0-9]{1,30}-USD$/.test(product))throw Error('Coinbase USD required');
 const step=900000,end=Math.floor(Date.now()/step)*step;
 const requested=from?Math.floor(Date.parse(from)/step)*step:end-COINBASE_PAGE*step;
 if(!Number.isFinite(requested)||requested>end)throw new PaperMarketError('Invalid exit history start');
 if(requested<end-PAPER_RECOVERY_CANDLES*step)throw new PaperMarketError('Exit history requires recovery beyond the seven-day catch-up window');
 const start=requested;
 if(start===end)return {symbol,market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:[]};
 const anchor:{last?:ExchangeBar}={};
 const bars=await fetchCoinbaseCandles(product,start,end,step,NO_TRADE_MAX_BARS,anchor);
 // The last real trade candle may sit before the checkpoint when a quiet coin had no trades since the previous cycle.
 const trailingAnchor=anchor.last?{closeAt:anchor.last.t,close:anchor.last.c,from:start}:undefined;
 return {symbol,market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:bars.map(b=>({openAt:b.t-step,closeAt:b.t,open:b.o,high:b.h,low:b.l,close:b.c})),filledBars:bars.filter(b=>b.filled).length,trailingAnchor};
}
/** maxNotional: optional liquidity cap in USD; riskScale (0,1]: correlation reduction of the 0.25% risk budget. The smallest size wins. */
/**
 * Target rule (paper and backtest share this planner): the target is anchored to the actual fill, TARGET_R x the
 * fill-to-stop distance above it. Before 2026-09-30 it was the signal candle's close + 2R, so a later live fill gave
 * 1.8-2.5R at the target while the backtest (filled at the next hourly open) clustered near 1.95R.
 */
export const TARGET_RULE={id:'fill-2R-v1',targetR:2};
export function planCryptoPaper(signal:VolumeMomentum,quote:CryptoPaperQuote,equity:number,cash:number,now=Date.now(),costRate=.0005,maxNotional=Infinity,riskScale=1){
 const fail=(reason:string)=>({ok:false as const,reason});
 if(signal.stage!=='MOMENTUM_VOLUME'||!signal.asOf||!Number.isFinite(Date.parse(signal.asOf))||now-Date.parse(signal.asOf)>4*3600000+900000||Date.parse(signal.asOf)>now)return fail('No current confirmed momentum setup');
 if(![signal.stop,signal.target,signal.maxEntry,signal.entryFloor,equity,cash,quote.ask,quote.bid].every(v=>typeof v==='number'&&Number.isFinite(v)))return fail('Missing plan or account inputs');
 if(quote.bid<=0||quote.ask<quote.bid||!Number.isFinite(Date.parse(quote.priceAt))||Date.parse(quote.priceAt)>now||now-Date.parse(quote.priceAt)>60000)return fail('Quote stale or invalid');
 if((quote.ask/quote.bid-1)*100>0.5)return fail('Spread above 0.5%');
 if(costRate!==.0005&&costRate!==.001)return fail('Unsupported paper costs');
 const fill=quote.ask*(1+costRate),stop=Number(signal.stop!.toFixed(8)),target=Number((fill+TARGET_RULE.targetR*(fill-stop)).toFixed(8)),fee=costRate;
 // Bound rounding error from the existing NUMERIC(18,8) ledger.
 if(Math.min(fill,stop,target)<0.0001||Math.max(fill,stop,target)>=1e10)return fail('Price outside supported paper precision');
 if(equity<=0||cash<=0||stop<=0||fill<=stop||fill>=target||fill>signal.maxEntry!||quote.ask<signal.entryFloor!)return fail('Current quote is outside the valid entry zone');
 const loss=fill-stop*(1-costRate)+fee*(fill+stop*(1-costRate));
 const reward=target*(1-costRate)-fill-fee*(fill+target*(1-costRate));
 if(loss<=0||reward/loss<1.5)return fail('Reward/risk below 1.5 after estimated costs');
 if(!(riskScale>0&&riskScale<=1))return fail('Invalid risk scale');
 const unbounded=Math.min(equity*.0025*riskScale/loss,equity*.1/fill,cash/(fill*(1+fee))),liquidityCapped=maxNotional/fill<unbounded;
 const quantity=Math.floor(Math.min(unbounded,maxNotional/fill)*1e8)/1e8;
 if(quantity<=0||quantity>=1e12||quantity*fill<10)return fail('Insufficient size');
 return {ok:true as const,fill,stop,target,signalTarget:signal.target!,targetRule:TARGET_RULE.id,quantity,notional:quantity*fill,risk:quantity*loss,rewardRisk:reward/loss,liquidityCapped};
}
