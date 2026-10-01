import {currentBtcRegime} from './cryptoBtcRegime';
import {fetchFlowStamp} from './cryptoFlow';
import {askJev,JevFailure,jevConfigured} from './jevClient';
/**
 * Jev shadow (jev-shadow-v2). One request per named setup, three yes/no probabilities.
 * Evidence only: never blocks, never opens, never writes a recommendation.
 * A failed call is stored as unavailable with its reason and is not retried on a later scan. No gateway key leaves the row unscored.
 * The same scored row is not sent again.
 */
export const JEV_RULE='jev-shadow-v2' as const;
export const JEV_STAGES=['MOMENTUM_VOLUME','VOLUME_WATCH','EXTENDED','EARLY_WATCH'] as const;
/** Fixed questions. Review these words here. Changing them starts a new sample. */
export const JEV_QUESTIONS={
 chase:{type:'boolean' as const,instructions:'Is `distancePastLevelAtr` large enough that a new long would be chasing a completed move?',criteria:{true:'The completed move is already stretched past the level',false:'Price is still near the level'}},
 flowAgrees:{type:'boolean' as const,instructions:'Does `flowStamp` show buyers supporting a long?',criteria:{true:'The stamp is aggressive buying',false:'The stamp is divergence, unavailable, or does not show buyers'}},
 btcHeadwind:{type:'boolean' as const,instructions:'Does `btcTrend` argue against a new long?',criteria:{true:'The Bitcoin trend is a headwind for a new long',false:'The Bitcoin trend does not argue against a new long'}},
};
/** reason is set only when status is unavailable: no-key, http-<status>, timeout, parse, or error. inputTokens is the gateway's usage figure when returned. */
export type JevStamp={rule:typeof JEV_RULE;status:'scored'|'unavailable';chase:number|null;flowAgrees:number|null;btcHeadwind:number|null;btcTrend:string;flowStamp:string;model:string|null;checkedAt:string;reason?:string;inputTokens?:number};
type JevRow={stage:string;asOf?:string|null;kind?:string|null;relativeVolume?:number|null;changePct?:number|null;trigger?:number|null;close?:number|null;atr?:number|null;pair?:{product:string}|null;flowStamp?:{stamp:string};jev?:JevStamp};
const round2=(n:number|null|undefined)=>typeof n==='number'&&Number.isFinite(n)?Math.round(n*100)/100:null;
export function unavailableJev(now=Date.now(),btcTrend='UNAVAILABLE',flowStamp='unavailable',reason?:string):JevStamp{
 return {rule:JEV_RULE,status:'unavailable',chase:null,flowAgrees:null,btcHeadwind:null,btcTrend,flowStamp,model:null,checkedAt:new Date(now).toISOString(),...(reason?{reason}:{})};
}
export function jevState(row:JevRow,btcTrend:string,flowStamp:string){
 const distance=typeof row.atr==='number'&&row.atr>0&&typeof row.close==='number'&&typeof row.trigger==='number'?round2((row.close-row.trigger)/row.atr):null;
 return {stage:row.stage,kind:row.kind??null,relativeVolume:round2(row.relativeVolume),changePct:round2(row.changePct),distancePastLevelAtr:distance,flowStamp,btcTrend};
}
async function ask(state:ReturnType<typeof jevState>):Promise<{chase:number;flowAgrees:number;btcHeadwind:number;model:string;inputTokens?:number}>{
 const {model,answers,inputTokens}=await askJev(state,JEV_QUESTIONS);
 return {chase:answers.chase.probability,flowAgrees:answers.flowAgrees.probability,btcHeadwind:answers.btcHeadwind.probability,model,...(inputTokens!=null?{inputTokens}:{})};
}
/** Scores named setups that do not already have a stamp. Never throws and never changes a stage. */
export async function scoreJevRows<T extends JevRow>(rows:T[],btcTrend:string,now=Date.now()){
 if(!jevConfigured())return;
 const due=rows.filter(r=>JEV_STAGES.includes(r.stage as typeof JEV_STAGES[number])&&r.asOf&&r.jev?.rule!==JEV_RULE);
 for(let i=0;i<due.length;i+=4){
  await Promise.all(due.slice(i,i+4).map(async row=>{
   const stage=row.stage;
   let flow='unavailable';
   try{
    flow=row.flowStamp?.stamp??(await fetchFlowStamp(row.pair?.product.split('-')[0]??'',now)).stamp;
    const scored=await ask(jevState(row,btcTrend,flow));
    row.jev={rule:JEV_RULE,status:'scored',...scored,btcTrend,flowStamp:flow,checkedAt:new Date(now).toISOString()};
   }catch(e){row.jev=unavailableJev(now,btcTrend,flow,e instanceof JevFailure?e.reason:'error');}
   row.stage=stage;
  }));
 }
}
/** One Bitcoin read for the whole scan, then one Jev request per unscored named setup. */
export async function attachJevShadow<T extends JevRow>(rows:T[],now=Date.now()){
 let trend='UNAVAILABLE';
 try{trend=(await currentBtcRegime(now)).state||'UNAVAILABLE';}catch{trend='UNAVAILABLE';}
 try{await scoreJevRows(rows,trend,now);}catch{for(const row of rows)if(!row.jev&&JEV_STAGES.includes(row.stage as typeof JEV_STAGES[number])&&row.asOf)row.jev=unavailableJev(now,trend,'unavailable','error');}
}
