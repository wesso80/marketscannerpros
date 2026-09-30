import type {ExchangeBar} from './cryptoExchangeVolume';
import type {PaperExitCandle} from './portfolio-lab/paperExitPath';
/** Longest run of missing 15m candles treated as "no trades" (2h). Longer gaps may be outages and still fail closed. */
export const NO_TRADE_MAX_BARS=8;
export type FilledBar=ExchangeBar&{filled?:true};
/**
 * Exchanges omit candles for intervals with no trades. Inside a bounded run, price cannot have traded elsewhere on
 * this venue, so each missing candle is a flat bar at the prior real close with zero volume, flagged `filled`.
 * Only gaps between two real candles are filled: never before the first or after the last real candle.
 */
export function fillNoTradeGaps(bars:ExchangeBar[],step:number,maxBars=NO_TRADE_MAX_BARS):FilledBar[]{
 const out:FilledBar[]=[];
 for(const b of [...bars].sort((a,c)=>a.t-c.t)){
  const prev=out.at(-1);
  if(prev){
   const missing=(b.t-prev.t)/step-1;
   if(!Number.isInteger(missing)||missing<0)throw Error('Misaligned exchange candles');
   if(missing>maxBars)throw Error(`Missing ${missing} consecutive candles; longer than the ${maxBars}-candle no-trade limit`);
   for(let k=1;k<=missing;k++)out.push({t:prev.t+k*step,o:prev.c,h:prev.c,l:prev.c,c:prev.c,v:0,filled:true});
  }
  out.push(b);
 }
 return out;
}
/** Last real trade candle (close time and close) and the checkpoint the path starts after. */
export type TrailingAnchor={closeAt:number;close:number;from:number};
/**
 * Trailing no-trade candles: a quiet coin may have no trades (so no candles) after its last real candle. Only when a
 * FRESH quote shows the market is live, and for at most maxBars candles (2h) counted from the last REAL trade candle,
 * the missing candles up to the last completed boundary are flat at the last real close. No trades means the venue
 * price could not have touched a stop or target in that time; the live quote is still checked separately.
 * When the path since the checkpoint is empty (no trades since the previous cycle, which may itself have filled
 * candles), the anchor supplies the last real candle and only candles after the checkpoint are returned.
 * Otherwise nothing is filled (fail closed).
 */
export function fillTrailingNoTrade(candles:PaperExitCandle[],end:number,quoteFresh:boolean,step=900000,maxBars=NO_TRADE_MAX_BARS,anchor?:TrailingAnchor){
 const useAnchor=!candles.length&&!!anchor&&anchor.closeAt<=anchor.from;
 const last=candles.at(-1)??(useAnchor?anchor:undefined);if(!quoteFresh||!last||last.closeAt>=end)return {candles,filled:0};
 const missing=(end-last.closeAt)/step;if(!Number.isInteger(missing)||missing<1||missing>maxBars)return {candles,filled:0};
 const add=Array.from({length:missing},(_,k)=>({openAt:last.closeAt+k*step,closeAt:last.closeAt+(k+1)*step,open:last.close,high:last.close,low:last.close,close:last.close}))
  .filter(c=>!useAnchor||c.closeAt>anchor!.from);
 if(useAnchor&&(!add.length||(anchor!.from-last.closeAt)%step!==0))return {candles,filled:0};
 return {candles:[...candles,...add],filled:add.length};
}
