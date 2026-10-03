import {askJev,JevFailure,jevConfigured} from './jevClient';
/**
 * Chart confirmer (jev-chart-v1). The four reads a person makes on the setup chart, put in code: the base before the
 * signal, the signal candle's close, its volume, and overhead supply. Jev is given numbers derived from the same 25
 * completed candles the rule read (never an image, never raw candles) and returns four probabilities.
 * Evidence only: never blocks, never opens, never writes a recommendation. A row without stored bars is unavailable
 * (no-bars), never guessed. The same scored row is not sent again; a failed call is recorded with its reason.
 */
export const CHART_RULE='jev-chart-v1' as const;
export const CHART_STAGES=['MOMENTUM_VOLUME','VOLUME_WATCH','EXTENDED','EARLY_WATCH'] as const;
/** Fewer completed bars than this and the base read is not meaningful. 21 = 20 prior + the signal candle. */
export const CHART_MIN_BARS=21;
/** Fixed questions. Review these words here. Changing them starts a new sample. */
export const CHART_QUESTIONS={
 cleanBase:{type:'boolean' as const,instructions:'Do `priorRangeAtr`, `priorSlopePct`, `priorClosesAboveSma20` and `priorVolumeTrend` describe a tight, quiet base in the 20 candles before the signal?',criteria:{true:'A narrow, flat, quiet range: a base that a breakout can leave cleanly',false:'A wide, trending, or noisy range: no base to break out of'}},
 strongClose:{type:'boolean' as const,instructions:'Does the signal candle close with conviction, judged by `closePosition` (0 = at the low, 1 = at the high), `bodyShare` and `rangeAtr`?',criteria:{true:'Closes near its high with a real body',false:'Closes mid-range or near its low, or is mostly wick'}},
 volumeExpansion:{type:'boolean' as const,instructions:'Is the signal volume a clear expansion, judged by `relativeVolume` against the 20-candle average and `volumeVsPrevious` against the previous candle?',criteria:{true:'Volume clearly expanded on the signal candle',false:'Volume is ordinary or the ratio is weak'}},
 overheadSupply:{type:'boolean' as const,instructions:'Do `priorHighsAboveClose` and `nearestHighAboveCloseAtr` show recent highs sitting just above the close that could cap follow-through?',criteria:{true:'Recent highs sit within reach above the close',false:'Nothing from the last 20 candles sits above the close, or it is far away'}},
};
export type ChartQuestionId=keyof typeof CHART_QUESTIONS;
/** reason is set only when status is unavailable: no-bars, no-key, http-<status>, timeout, parse, or error. */
export type ChartStamp={rule:typeof CHART_RULE;status:'scored'|'unavailable';cleanBase:number|null;strongClose:number|null;volumeExpansion:number|null;overheadSupply:number|null;bars:number;model:string|null;checkedAt:string;reason?:string;inputTokens?:number};
export type ChartBar={t:number;o:number;h:number;l:number;c:number;v:number};
type ChartRow={stage:string;asOf?:string|null;kind?:string|null;relativeVolume?:number|null;atr?:number|null;bars?:ChartBar[];chart?:ChartStamp};
const round2=(n:number|null|undefined)=>typeof n==='number'&&Number.isFinite(n)?Math.round(n*100)/100:null;
const mean=(xs:number[])=>xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:NaN;
export function unavailableChart(now=Date.now(),reason?:string,bars=0):ChartStamp{
 return {rule:CHART_RULE,status:'unavailable',cleanBase:null,strongClose:null,volumeExpansion:null,overheadSupply:null,bars,model:null,checkedAt:new Date(now).toISOString(),...(reason?{reason}:{})};
}
/** Numbers only, all in ATR or ratios so Jev reads the shape, not the price level. null when the bars cannot support the read. */
export function chartState(row:ChartRow){
 const bars=row.bars??[];
 const atr=typeof row.atr==='number'&&row.atr>0?row.atr:null;
 if(bars.length<CHART_MIN_BARS||!atr)return null;
 const signal=bars[bars.length-1],prior=bars.slice(-CHART_MIN_BARS,-1),previous=bars[bars.length-2];
 const ok=(b:ChartBar)=>[b.o,b.h,b.l,b.c].every(Number.isFinite)&&b.h>=b.l&&b.l>0;
 if(!ok(signal)||!prior.every(ok))return null;
 const range=signal.h-signal.l;
 const priorHigh=Math.max(...prior.map(b=>b.h)),priorLow=Math.min(...prior.map(b=>b.l));
 const sma20=mean(prior.map(b=>b.c)),firstHalf=mean(prior.slice(0,10).map(b=>b.c)),secondHalf=mean(prior.slice(10).map(b=>b.c));
 const vols=prior.map(b=>b.v).filter(v=>Number.isFinite(v)&&v>=0);
 const volumeTrend=vols.length===prior.length?mean(vols.slice(-5))/Math.max(1e-12,mean(vols.slice(0,15))):null;
 const volumeVsPrevious=Number.isFinite(signal.v)&&Number.isFinite(previous.v)&&previous.v>0?signal.v/previous.v:null;
 const above=prior.filter(b=>b.h>signal.c).map(b=>b.h);
 return {
  stage:row.stage,kind:row.kind??null,bars:bars.length,
  priorRangeAtr:round2((priorHigh-priorLow)/atr),
  priorSlopePct:round2(firstHalf>0?(secondHalf/firstHalf-1)*100:null),
  priorClosesAboveSma20:prior.filter(b=>b.c>sma20).length,
  priorVolumeTrend:round2(volumeTrend),
  closePosition:round2(range>0?(signal.c-signal.l)/range:null),
  bodyShare:round2(range>0?Math.abs(signal.c-signal.o)/range:null),
  rangeAtr:round2(range/atr),
  relativeVolume:round2(row.relativeVolume),
  volumeVsPrevious:round2(volumeVsPrevious),
  priorHighsAboveClose:above.length,
  nearestHighAboveCloseAtr:round2(above.length?(Math.min(...above)-signal.c)/atr:null),
 };
}
async function ask(state:NonNullable<ReturnType<typeof chartState>>){
 const {model,answers,inputTokens}=await askJev(state,CHART_QUESTIONS,{module:'jev-chart'});
 return {cleanBase:answers.cleanBase.probability,strongClose:answers.strongClose.probability,volumeExpansion:answers.volumeExpansion.probability,overheadSupply:answers.overheadSupply.probability,model,...(inputTokens!=null?{inputTokens}:{})};
}
/** Scores named setups with stored bars that do not already carry this rule's stamp. Never throws and never changes a stage. */
export async function scoreChartRows<T extends ChartRow>(rows:T[],now=Date.now()){
 const due=rows.filter(r=>CHART_STAGES.includes(r.stage as typeof CHART_STAGES[number])&&r.asOf&&r.chart?.rule!==CHART_RULE);
 for(const row of due)if(!row.bars||row.bars.length<CHART_MIN_BARS)row.chart=unavailableChart(now,'no-bars',row.bars?.length??0);
 const scorable=due.filter(r=>r.chart?.rule!==CHART_RULE);
 if(!scorable.length)return;
 if(!jevConfigured()){for(const row of scorable)row.chart=unavailableChart(now,'no-key',row.bars?.length??0);return;}
 for(let i=0;i<scorable.length;i+=4){
  await Promise.all(scorable.slice(i,i+4).map(async row=>{
   const stage=row.stage,bars=row.bars?.length??0;
   try{
    const state=chartState(row);
    if(!state)throw new JevFailure('no-bars');
    row.chart={rule:CHART_RULE,status:'scored',...await ask(state),bars,checkedAt:new Date(now).toISOString()};
   }catch(e){row.chart=unavailableChart(now,e instanceof JevFailure?e.reason:'error',bars);}
   row.stage=stage;
  }));
 }
}
/** One Jev request per unscored named setup that stored its candles. Rows without bars are marked no-bars. */
export async function attachChartConfirmer<T extends ChartRow>(rows:T[],now=Date.now()){
 try{await scoreChartRows(rows,now);}catch{for(const row of rows)if(!row.chart&&CHART_STAGES.includes(row.stage as typeof CHART_STAGES[number])&&row.asOf)row.chart=unavailableChart(now,'error',row.bars?.length??0);}
}
