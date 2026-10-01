import type {Redis} from '@upstash/redis';
import {askJev,JevFailure,jevConfigured} from './jevClient';
import {CHART_QUESTIONS,CHART_RULE,chartState,unavailableChart,type ChartStamp} from './cryptoJevChart';
import {JEV_QUESTIONS,JEV_RULE,jevState,unavailableJev,type JevStamp} from './cryptoJev';
import type {VolumeMomentum} from './cryptoVolumeMomentum';
/**
 * Jev on the backtest: the same chart-confirmer and shadow questions the live scan asks, put to every replayed
 * signal whose outcome is already known. The inputs are the compact states derived at signal time from the candles
 * the rule read (never raw candles, never anything after the signal). Answers are cached per (coin, signal candle)
 * for 30 days so re-running a window costs nothing. Evidence only: the stamps grade the questions, they never change a
 * backtest result. The historical taker-flow stamp does not exist, so `flowAgrees` is asked with flowStamp unavailable
 * and will read low; it is kept so the three live questions stay comparable, not because it carries information here.
 */
export const BACKTEST_JEV_CACHE='admin:crypto-markets:backtest-jev:v1';
export const BACKTEST_JEV_TTL_SEC=30*86400;
/** Trades stamped per call; two Jev requests each, four trades in flight. Keeps a route call well inside its time budget. */
export const BACKTEST_JEV_PER_CALL=40;
export type BacktestJevInput={chart:ReturnType<typeof chartState>;jev:ReturnType<typeof jevState>};
export type BacktestJevStamps={jev?:JevStamp;chart?:ChartStamp};
type StampRow={id:string;jevInput?:BacktestJevInput;jev?:JevStamp;chart?:ChartStamp};
/** Captured at signal time inside the replay so the stamping pass needs no candles. */
export function backtestJevInput(sig:VolumeMomentum,btcTrend:string):BacktestJevInput{
 return {chart:chartState(sig),jev:jevState(sig,btcTrend,'unavailable')};
}
const cacheKey=(id:string)=>`${BACKTEST_JEV_CACHE}:${id}`;
async function askBoth(input:BacktestJevInput,now:number):Promise<BacktestJevStamps>{
 const at=new Date(now).toISOString();
 const jevCall=askJev(input.jev,JEV_QUESTIONS).then(r=>({rule:JEV_RULE,status:'scored' as const,chase:r.answers.chase.probability,flowAgrees:r.answers.flowAgrees.probability,btcHeadwind:r.answers.btcHeadwind.probability,btcTrend:input.jev.btcTrend,flowStamp:'unavailable',model:r.model,checkedAt:at,...(r.inputTokens!=null?{inputTokens:r.inputTokens}:{})}) as JevStamp)
  .catch(e=>unavailableJev(now,input.jev.btcTrend,'unavailable',e instanceof JevFailure?e.reason:'error'));
 const chartCall=!input.chart?Promise.resolve(unavailableChart(now,'no-bars',0))
  :askJev(input.chart,CHART_QUESTIONS).then(r=>({rule:CHART_RULE,status:'scored' as const,cleanBase:r.answers.cleanBase.probability,strongClose:r.answers.strongClose.probability,volumeExpansion:r.answers.volumeExpansion.probability,overheadSupply:r.answers.overheadSupply.probability,bars:input.chart!.bars,model:r.model,checkedAt:at,...(r.inputTokens!=null?{inputTokens:r.inputTokens}:{})}) as ChartStamp)
   .catch(e=>unavailableChart(now,e instanceof JevFailure?e.reason:'error',input.chart?.bars??0));
 const [jev,chart]=await Promise.all([jevCall,chartCall]);
 return {jev,chart};
}
const isDue=(t:StampRow)=>!!t.jevInput&&(t.jev?.rule!==JEV_RULE||t.chart?.rule!==CHART_RULE);
/**
 * Stamps up to `limit` unstamped trades, cache first. Returns how many were stamped and how many remain.
 * Unavailable stamps caused by a transport failure or an unparseable answer are not cached, so the next call retries them; no-key stamps are not cached either.
 */
export async function stampBacktestJev<T extends StampRow>(redis:Pick<Redis,'get'|'set'>,trades:T[],now=Date.now(),limit=BACKTEST_JEV_PER_CALL):Promise<{stamped:number;fromCache:number;remaining:number;skipped:string|null}>{
 const due=trades.filter(isDue);
 if(!due.length)return {stamped:0,fromCache:0,remaining:0,skipped:null};
 const batch=due.slice(0,Math.max(1,limit));
 let stamped=0,fromCache=0;
 const cached=await Promise.all(batch.map(t=>redis.get<BacktestJevStamps>(cacheKey(t.id)).catch(()=>null)));
 const live:T[]=[];
 batch.forEach((t,i)=>{const c=cached[i];if(c?.jev?.rule===JEV_RULE&&c.chart?.rule===CHART_RULE){t.jev=c.jev;t.chart=c.chart;stamped++;fromCache++;}else live.push(t);});
 if(live.length&&!jevConfigured()){
  for(const t of live){t.jev=unavailableJev(now,t.jevInput!.jev.btcTrend,'unavailable','no-key');t.chart=unavailableChart(now,'no-key',t.jevInput!.chart?.bars??0);}
  return {stamped,fromCache,remaining:trades.filter(isDue).length,skipped:'AI_GATEWAY_API_KEY is not set; stamps recorded as no-key and not cached'};
 }
 for(let i=0;i<live.length;i+=4){
  await Promise.all(live.slice(i,i+4).map(async t=>{
   const s=await askBoth(t.jevInput!,now);
   t.jev=s.jev;t.chart=s.chart;stamped++;
   const uncached=(r?:string)=>!!r&&/^(http-|timeout|error|parse)/.test(r);
   if(!uncached(s.jev?.reason)&&!uncached(s.chart?.reason))await redis.set(cacheKey(t.id),s,{ex:BACKTEST_JEV_TTL_SEC}).catch(()=>undefined);
  }));
 }
 return {stamped,fromCache,remaining:trades.filter(isDue).length,skipped:null};
}
export function backtestJevCoverage(trades:StampRow[]){
 const c={trades:trades.length,withInput:0,jevScored:0,chartScored:0,chartNoBars:0,unavailable:0,unstamped:0};
 for(const t of trades){
  if(t.jevInput)c.withInput++;
  const stamped=t.jev?.rule===JEV_RULE&&t.chart?.rule===CHART_RULE;
  if(!stamped){c.unstamped++;continue;}
  if(t.jev!.status==='scored')c.jevScored++;
  if(t.chart!.status==='scored')c.chartScored++;else if(t.chart!.reason==='no-bars')c.chartNoBars++;
  if(t.jev!.status!=='scored'&&t.chart!.status!=='scored')c.unavailable++;
 }
 return c;
}
