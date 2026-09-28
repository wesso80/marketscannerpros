import {momentumChart} from './cryptoMomentum';
export type BaseReview={stage:'UNAVAILABLE'|'WATCH'|'BASE'|'BREAKOUT_PRICE_ONLY'|'EXTENDED'|'FAILED_BREAKOUT';reason:string;high:number|null;low:number|null;widthPct:number|null;maGapPct:number|null;slopePct:number|null;asOf:string|null;volumeConfirmed:false};
/** Experimental price-only base. No volume, regime or trade permission is inferred. */
export function reviewCryptoBase(hourly:number[][],daily:number[][],price:number,now=Date.now()):BaseReview {
  const result:BaseReview={stage:'UNAVAILABLE',reason:'Insufficient completed history',high:null,low:null,widthPct:null,maGapPct:null,slopePct:null,asOf:null,volumeConfirmed:false};
  const chart=momentumChart(hourly,daily,now),last=chart.fourHourly.at(-1),prev=chart.fourHourly.at(-2);
  if(chart.error){result.reason=chart.error;return result;}
  if(!last||!prev||!Number.isFinite(price)||price<=0)return result;
  // Freeze the base before the confirmation candle starts; exclude overlapping daily candles.
  const days=chart.daily.filter(b=>b.t<=last.t-4*3600000).slice(-24);
  if(days.length<24)return result;
  if(now-last.t>8*3600000||now-days.at(-1)!.t>2*86400000){result.reason='Base history is stale';return result;}
  const base=days.slice(-21),avg=(v:number[])=>v.reduce((a,b)=>a+b,0)/v.length;
  const high=Math.max(...base.map(b=>b.h)),low=Math.min(...base.map(b=>b.l));
  const slow=avg(days.slice(-20).map(b=>b.c)),fast=avg(days.slice(-5).map(b=>b.c)),prior=avg(days.slice(-23,-3).map(b=>b.c));
  const width=(high-low)/low*100,gap=Math.abs(fast/slow-1)*100,slope=Math.abs(slow/prior-1)*100;
  Object.assign(result,{high,low,widthPct:width,maGapPct:gap,slopePct:slope,asOf:new Date(last.t).toISOString()});
  if(width>15||gap>3||slope>3){result.stage='WATCH';result.reason='No tight, flat 21-day price base';return result;}
  if(price<low||last.c<low){result.stage='FAILED_BREAKOUT';result.reason='Price fell below the base';return result;}
  if(last.c>high&&prev.c<=high){
    if(price<high){result.stage='FAILED_BREAKOUT';result.reason='4h close broke out but quote fell back into the base';return result;}
    if(price>high*1.03||last.c>high*1.03){result.stage='EXTENDED';result.reason='More than 3% above the base ceiling; do not chase';return result;}
    result.stage='BREAKOUT_PRICE_ONLY';result.reason='Completed 4h close crossed the prior base high; candle volume and regime confirmation are still required';return result;
  }
  if(price>high||last.c>high){result.stage='EXTENDED';result.reason='Above the base without a new 4h crossing';return result;}
  result.stage='BASE';result.reason='21-day range ≤15%, SMA5/20 gap ≤3%, SMA20 three-day change ≤3%; volume contraction unverified';return result;
}
