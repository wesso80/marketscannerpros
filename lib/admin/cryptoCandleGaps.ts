import type {ExchangeBar} from './cryptoExchangeVolume';
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
