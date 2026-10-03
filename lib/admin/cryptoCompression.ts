import type {ExchangeBar} from './cryptoExchangeVolume';
/**
 * Research-only compression flag. It does not place orders or change paper entries, ranking, or gates.
 * A window is quiet when its range is at most 15% wide (the daily base scan's width rule), its mean daily
 * range and ATR are both below the prior window of the same length, and the latest third of its volume is
 * at most 0.70× the earlier two-thirds. For 21 days that split is the base scan's 7-day versus 14-day
 * contraction; fetchDailyBase passes that contraction in so the 21-day volume figure is the scan's own.
 * Score weights: width 30, daily-range shrink 20, ATR shrink 20, volume dry-up 20, length 10.
 * The flag is the longest quiet window. Rank is that window's score.
 */
export const COMPRESSION_WINDOWS=[21,45,90] as const;
export type CompressionWindowDays=(typeof COMPRESSION_WINDOWS)[number];
export const COMPRESSION_STRONG_SCORE=60;
export const COMPRESSION_WIDTH_MAX_PCT=15;
export const COMPRESSION_VOLUME_MAX_RATIO=0.7;
const D=86400000;
export const COMPRESSION_RULE='Quiet when range width is at most 15%, mean daily range and ATR are both below the prior window of the same length, and the latest third of volume is at most 0.70× the earlier two-thirds. The 21-day split is the daily base scan 7-day versus 14-day contraction. Weights: width 30, range shrink 20, ATR shrink 20, volume 20, length 10. The flag is the longest quiet window and the rank is that score. A quiet score of 60 or more is highlighted. Research only. It does not place orders or change paper entries.';
export type CompressionWindowStatus='quiet'|'not quiet'|'not enough data';
export type CompressionWindow={days:CompressionWindowDays;status:CompressionWindowStatus;score:number|null;widthPct:number|null;rangeRatio:number|null;atrRatio:number|null;volumeRatio:number|null};
export type CompressionFlag={status:CompressionWindowStatus;window:CompressionWindowDays|null;score:number|null;strong:boolean;reason:string;fetchedDays:number|null;availableDays:number;asOf:string|null;windows:CompressionWindow[]};
export type CompressionBase21={widthPct:number|null;contraction:number|null;asOf:string|null};
export type CompressionContext={fetchedDays?:number;base21?:CompressionBase21};
export type CompressionSourceRow={id:string;symbol:string;exchange?:string|null;product?:string|null;stage?:string;compression?:CompressionFlag|null};
export type CompressionRow=CompressionFlag&{id:string;symbol:string;exchange:string|null;product:string|null};
export type CompressionCaps={gdax:number;binance:number;kucoin:number;okex:number};
const mean=(xs:number[])=>xs.reduce((s,v)=>s+v,0)/xs.length;
const clamp01=(n:number)=>Math.min(1,Math.max(0,n));
const round1=(n:number)=>Math.round(n*10)/10;
function blankWindow(days:CompressionWindowDays):CompressionWindow{
  return {days,status:'not enough data',score:null,widthPct:null,rangeRatio:null,atrRatio:null,volumeRatio:null};
}
export function notEnoughCompression(reason:string,fetchedDays:number|null=null):CompressionFlag{
  return {status:'not enough data',window:null,score:null,strong:false,reason,fetchedDays,availableDays:0,asOf:null,windows:COMPRESSION_WINDOWS.map(blankWindow)};
}
export function compressionPoints(input:{widthPct:number;rangeRatio:number;atrRatio:number;volumeRatio:number;days:CompressionWindowDays}):number{
  const raw=clamp01(1-input.widthPct/COMPRESSION_WIDTH_MAX_PCT)*30
    +clamp01(1-input.rangeRatio)*20
    +clamp01(1-input.atrRatio)*20
    +clamp01((COMPRESSION_VOLUME_MAX_RATIO-input.volumeRatio)/COMPRESSION_VOLUME_MAX_RATIO)*20
    +(input.days/90)*10;
  return round1(raw);
}
export function isQuietWindow(input:{widthPct:number;rangeRatio:number;atrRatio:number;volumeRatio:number}):boolean{
  return input.widthPct<=COMPRESSION_WIDTH_MAX_PCT&&input.rangeRatio<1&&input.atrRatio<1&&input.volumeRatio<=COMPRESSION_VOLUME_MAX_RATIO&&[input.widthPct,input.rangeRatio,input.atrRatio,input.volumeRatio].every(Number.isFinite);
}
function validBar(b:ExchangeBar):boolean{
  return !!b&&[b.t,b.o,b.h,b.l,b.c,b.v].every(Number.isFinite)&&Math.min(b.o,b.h,b.l,b.c)>0&&b.v>=0&&b.h>=Math.max(b.o,b.c,b.l)&&b.l<=Math.min(b.o,b.c)&&b.t%D===0;
}
/** Latest contiguous completed run. Missing days stop the run. Nothing is filled in. Same freshness window as assessDailyBase. */
export function completedDailyRun(bars:ExchangeBar[],now:number):ExchangeBar[]{
  const sorted=[...bars].filter(validBar).sort((a,b)=>a.t-b.t);
  if(!sorted.length)return [];
  const last=sorted[sorted.length-1];
  if(sorted.some((b,i)=>i<sorted.length-1&&b.t===last.t))return [];
  if(last.t>now||now-last.t>D+2*3600000)return [];
  let start=sorted.length-1;
  while(start>0&&sorted[start].t-sorted[start-1].t===D)start--;
  return sorted.slice(start);
}
function trueRanges(bars:ExchangeBar[],prevClose:number|null):number[]{
  return bars.map((b,i)=>{
    const prev=i===0?prevClose:bars[i-1].c,span=b.h-b.l;
    if(prev==null||!Number.isFinite(prev))return span;
    return Math.max(span,Math.abs(b.h-prev),Math.abs(b.l-prev));
  });
}
/** Latest third versus the earlier two-thirds. 21 days is 7 versus 14, the same split as assessDailyBase. Zero volume is not a score. */
export function windowVolumeRatio(current:ExchangeBar[]):number|null{
  const recentN=current.length/3;
  if(!Number.isInteger(recentN)||recentN<1)return null;
  const older=current.slice(0,current.length-recentN),recent=current.slice(-recentN);
  const avg=(xs:ExchangeBar[])=>mean(xs.map(b=>b.v));
  const o=avg(older),r=avg(recent);
  if(!(o>0)||!(r>0))return null;
  return r/o;
}
function scoreWindow(run:ExchangeBar[],days:CompressionWindowDays,base21?:CompressionBase21):CompressionWindow{
  const need=days*2;
  if(run.length<need)return blankWindow(days);
  const prior=run.slice(-need,-days),current=run.slice(-days);
  let widthPct=(Math.max(...current.map(b=>b.h))/Math.min(...current.map(b=>b.l))-1)*100;
  const priorRange=mean(prior.map(b=>b.h-b.l)),currentRange=mean(current.map(b=>b.h-b.l));
  if(!(priorRange>0)||!(currentRange>=0))return blankWindow(days);
  const rangeRatio=currentRange/priorRange;
  const seed=run.length>need?run[run.length-need-1].c:null;
  const priorAtr=mean(trueRanges(prior,seed)),currentAtr=mean(trueRanges(current,prior[prior.length-1].c));
  if(!(priorAtr>0)||!(currentAtr>=0))return blankWindow(days);
  const atrRatio=currentAtr/priorAtr;
  let volumeRatio=windowVolumeRatio(current);
  if(days===21&&base21&&base21.asOf===new Date(run[run.length-1].t).toISOString()){
    if(!(typeof base21.widthPct==='number'&&Number.isFinite(base21.widthPct))||!(typeof base21.contraction==='number'&&base21.contraction>0))return blankWindow(days);
    widthPct=base21.widthPct;volumeRatio=base21.contraction;
  }
  if(volumeRatio==null||![widthPct,rangeRatio,atrRatio,volumeRatio].every(Number.isFinite))return blankWindow(days);
  const factors={widthPct,rangeRatio,atrRatio,volumeRatio};
  return {days,status:isQuietWindow(factors)?'quiet':'not quiet',score:compressionPoints({...factors,days}),...factors};
}
export function scoreCompression(bars:ExchangeBar[],now:number,context:CompressionContext={}):CompressionFlag{
  const run=completedDailyRun(bars??[],now);
  const windows=COMPRESSION_WINDOWS.map(days=>scoreWindow(run,days,context.base21));
  const fetchedDays=context.fetchedDays??null;
  const asOf=run.length?new Date(run[run.length-1].t).toISOString():null;
  const quiet=windows.filter(w=>w.status==='quiet');
  const scored=windows.filter(w=>w.score!=null);
  const chosen=quiet.at(-1)??[...scored].sort((a,b)=>b.score!-a.score!||b.days-a.days)[0];
  if(!chosen||chosen.score==null){
    const cap=run.length>0&&fetchedDays!=null&&fetchedDays<180?` This request returns at most ${fetchedDays} daily candles, so a 90-day window is not scored.`:'';
    return {status:'not enough data',window:null,score:null,strong:false,fetchedDays,availableDays:run.length,asOf,windows,reason:`not enough data: ${run.length} contiguous completed daily candles. A 21-day score needs 42, 45 needs 90, and 90 needs 180.${cap}`};
  }
  const strong=chosen.status==='quiet'&&chosen.score>=COMPRESSION_STRONG_SCORE;
  const reason=chosen.status==='quiet'
    ?`Quiet ${chosen.days}-day base. Range ${chosen.widthPct!.toFixed(2)}%, daily range ${chosen.rangeRatio!.toFixed(2)}× the prior window, ATR ${chosen.atrRatio!.toFixed(2)}×, volume ${chosen.volumeRatio!.toFixed(2)}×. Research only.`
    :`No quiet window. Highest score is the ${chosen.days}-day window. Research only.`;
  return {status:chosen.status,window:chosen.days,score:chosen.score,strong,reason,fetchedDays,availableDays:run.length,asOf,windows};
}
export function sortCompressionRows<T extends {id:string;symbol:string;score:number|null;window:number|null}>(rows:T[],desc=true):T[]{
  return [...rows].sort((a,b)=>{
    if(a.score==null&&b.score==null)return a.symbol.localeCompare(b.symbol)||a.id.localeCompare(b.id);
    if(a.score==null)return 1;
    if(b.score==null)return -1;
    if(a.score!==b.score)return desc?b.score-a.score:a.score-b.score;
    return (b.window??0)-(a.window??0)||a.symbol.localeCompare(b.symbol)||a.id.localeCompare(b.id);
  });
}
export function compressionBoard(rows:CompressionSourceRow[]|null|undefined):CompressionRow[]{
  return sortCompressionRows((rows??[]).map(row=>{
    const flag=row.compression??notEnoughCompression(!row.product?'No supported trading pair':row.stage==='EXCLUDED'?'Excluded by discovery or pegged-asset screening':row.stage==='PENDING'?'Waiting for completed daily candles':'Completed daily candles for this coin are not stored yet');
    return {id:row.id,symbol:row.symbol,exchange:row.exchange??null,product:row.product??null,...flag};
  }));
}
export function compressionNote(caps:CompressionCaps):string{
  return `Every discovered coin is scored, including coins that fail the 21-day base scan. One daily-candle request per coin, inside the existing base-scan batch (five pairs per manual batch, twenty per 15-minute cycle). The request asks for 180 completed UTC days. Coinbase allows ${caps.gdax} candles per call, Binance ${caps.binance}, and KuCoin ${caps.kucoin}, so 180 fits in that one call. OKX history-candles returns at most ${caps.okex} rows, so OKX pairs can be scored on 21 and 45 days only; 90 days shows not enough data. The batch previously requested 30 days and the base scan reads 24. Those candles were not stored, so a pair fetched before this change shows not enough data until the batch requests it again. A window is scored only when that many completed days plus an equal prior window are present and contiguous. Missing days are not filled.`;
}
