import type { DiscoveryRow } from './cryptoDiscovery';
const HOUR=3600000, DAY=24*HOUR;
type Bar={t:number;o:number;h:number;l:number;c:number};
const mean=(v:number[])=>v.reduce((a,b)=>a+b,0)/v.length;
/** CoinGecko timestamps are candle CLOSE times. Forming candles are excluded, never rounded into a close. */
function candles(raw:number[][], interval:number, now:number):Bar[] {
  const unique=new Map<number,Bar>();
  for(const row of raw) {
    if(row.length<5 || !row.slice(0,5).every(Number.isFinite)) throw new Error('Invalid candle values');
    const [t,o,h,l,c]=row;
    if(t>Math.floor(now/interval)*interval) continue;
    if(t<=0 || t%interval!==0 || Math.min(o,h,l,c)<=0 || h<Math.max(o,l,c) || l>Math.min(o,h,c)) throw new Error('Invalid candle time or OHLC geometry');
    const prior=unique.get(t);
    if(prior && (prior.o!==o || prior.h!==h || prior.l!==l || prior.c!==c)) throw new Error('Conflicting candles at the same close time');
    unique.set(t,{t,o,h,l,c});
  }
  const bars=[...unique.values()].sort((a,b)=>a.t-b.t);
  for(let i=1;i<bars.length;i++) if(bars[i].t-bars[i-1].t!==interval) throw new Error('Candle history has missing periods');
  return bars;
}
export function completedFourHourBars(hourly:Bar[],now:number):Bar[] {
  const groups=new Map<number,Bar[]>();
  for(const b of hourly) {const end=Math.ceil(b.t/(4*HOUR))*4*HOUR;(groups.get(end)??(groups.set(end,[]),groups.get(end)!)).push(b);}
  return [...groups].filter(([end,b])=>end<=Math.floor(now/(4*HOUR))*4*HOUR && b.length===4 && b[0].t===end-3*HOUR && b[3].t===end)
    .map(([t,b])=>({t,o:b[0].o,h:Math.max(...b.map(v=>v.h)),l:Math.min(...b.map(v=>v.l)),c:b[3].c}));
}
export type MomentumReview={version:'crypto-momentum.v1';mode:'RESEARCH_ONLY';coinId:string;symbol:string;reviewedAt:string;
  status:'BLOCKED'|'WATCH'|'EXTENDED'|'BREAKOUT_CONFIRMED'|'PULLBACK_CONFIRMED';reasons:string[];
  evidence:{hourlyAsOf:string|null;fourHourAsOf:string|null;dailyAsOf:string|null;quoteAsOf:string|null;hourlyBars:number;dailyBars:number;dailyTrend:boolean;fourHourTrend:boolean;volumeConfirmation:'UNAVAILABLE'};
  levels:null|{entry:number;stop:number;target:number;targetBasis:'MODEL_2R';currentRewardRisk:number;trigger:number;maxEntry:number;hourlyAtr:number};
  exitRule:string;};
export function reviewCryptoMomentum(coin:DiscoveryRow, hourlyRaw:number[][],dailyRaw:number[][],now=Date.now()):MomentumReview {
  const result:MomentumReview={version:'crypto-momentum.v1',mode:'RESEARCH_ONLY',coinId:coin.id,symbol:coin.symbol,reviewedAt:new Date(now).toISOString(),
    status:'BLOCKED',reasons:[],evidence:{hourlyAsOf:null,fourHourAsOf:null,dailyAsOf:null,quoteAsOf:coin.observedAt,hourlyBars:0,dailyBars:0,dailyTrend:false,fourHourTrend:false,volumeConfirmation:'UNAVAILABLE'},levels:null,
    exitRule:'Research proposal: hard stop at the structural level; model target at 2R; review after 48 hours without progress. Fees, slippage, fills and account limits remain untested here.'};
  const at=Date.parse(coin.observedAt??'');
  if(coin.stage==='EXCLUDED' || !Number.isFinite(coin.price) || coin.price<=0 || !Number.isFinite(at) || at>now || now-at>15*60000) {
    result.reasons.push('Discovery price or eligibility is unavailable/stale');return result;
  }
  let hourly:Bar[],daily:Bar[];
  try {hourly=candles(hourlyRaw,HOUR,now);daily=candles(dailyRaw,DAY,now);} catch(e) {result.reasons.push((e as Error).message);return result;}
  const four=completedFourHourBars(hourly,now), last=hourly.at(-1), lastDay=daily.at(-1),lastFour=four.at(-1);
  result.evidence.hourlyBars=hourly.length;result.evidence.dailyBars=daily.length;
  result.evidence.hourlyAsOf=last?new Date(last.t).toISOString():null;
  result.evidence.fourHourAsOf=lastFour?new Date(lastFour.t).toISOString():null;
  result.evidence.dailyAsOf=lastDay?new Date(lastDay.t).toISOString():null;
  if(hourly.length<100 || daily.length<25 || four.length<24 || !last || !lastDay || !lastFour) {result.reasons.push('Insufficient completed history (100 hourly, 25 daily, 24 four-hour bars)');return result;}
  if(now-last.t>2*HOUR || now-lastDay.t>2*DAY || now-lastFour.t>8*HOUR) {result.reasons.push('Completed candle history is stale');return result;}
  const d20=mean(daily.slice(-20).map(b=>b.c)), dPrior=mean(daily.slice(-23,-3).map(b=>b.c));
  const f20=mean(four.slice(-20).map(b=>b.c)), fPrior=mean(four.slice(-23,-3).map(b=>b.c));
  result.evidence.dailyTrend=lastDay.c>d20 && d20>dPrior;
  result.evidence.fourHourTrend=lastFour.c>f20 && f20>fPrior;
  const ranges=hourly.slice(-14).map((b,i)=>Math.max(b.h-b.l,Math.abs(b.h-hourly[hourly.length-15+i].c),Math.abs(b.l-hourly[hourly.length-15+i].c)));
  const atr=mean(ranges);
  if(!(atr>0)) {result.reasons.push('Hourly ATR unavailable');return result;}
  const prior=hourly.slice(-21,-1),prev=hourly[hourly.length-2];
  const high=Math.max(...prior.map(b=>b.h));
  const pullbackMean=mean(hourly.slice(-22,-2).map(b=>b.c));
  const breakout=last.c>high;
  const pullback=prev.l<=pullbackMean+0.25*atr && prev.c>=pullbackMean && last.c>prev.h;
  if(!result.evidence.dailyTrend || !result.evidence.fourHourTrend) {result.status='WATCH';result.reasons.push('Daily and four-hour trends are not both rising');return result;}
  if(!breakout && !pullback) {result.status='WATCH';result.reasons.push('No completed hourly breakout or pullback reclaim');return result;}
  const trigger=breakout?high:prev.h;
  const stop=Math.min(...hourly.slice(-6).map(b=>b.l))-0.25*atr;
  const risk=last.c-stop, target=last.c+2*risk;
  const maxEntry=Math.min(trigger+0.5*atr,(target+1.5*stop)/2.5);
  if(!(stop>0 && risk>0 && coin.price>stop)) {result.reasons.push('Price through stop or invalid structural risk');return result;}
  const rr=(target-coin.price)/(coin.price-stop);
  result.levels={entry:coin.price,stop,target,targetBasis:'MODEL_2R',currentRewardRisk:rr,trigger,maxEntry,hourlyAtr:atr};
  if(coin.price>maxEntry || last.c-trigger>0.5*atr || rr<1.5) {result.status='EXTENDED';result.reasons.push('Entry is beyond the 0.5 ATR chase limit or below 1.5R');return result;}
  if(coin.price<trigger) {result.status='WATCH';result.reasons.push('Price has fallen below the confirmed trigger');return result;}
  result.status=breakout?'BREAKOUT_CONFIRMED':'PULLBACK_CONFIRMED';
  result.reasons.push('Price pattern confirmed only; candle-volume confirmation and paper-entry approval are not supplied by this review');
  return result;
}
