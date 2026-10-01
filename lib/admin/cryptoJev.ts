import {currentBtcRegime} from './cryptoBtcRegime';
import {fetchFlowStamp} from './cryptoFlow';
/**
 * Jev shadow (jev-shadow-v1). One request per named setup, three yes/no probabilities.
 * Evidence only: never blocks, never opens, never writes a recommendation.
 * A failed call is stored as unavailable and is not retried. No gateway key leaves the row unscored.
 * The same scored row is not sent again.
 */
export const JEV_RULE='jev-shadow-v2' as const;
export const JEV_STAGES=['MOMENTUM_VOLUME','VOLUME_WATCH','EXTENDED','EARLY_WATCH'] as const;
const GATEWAY='https://ai-gateway.vercel.sh/v1/evaluate';
const MODEL='typesafe-ai/jev';
/** Fixed questions. Review these words here. Changing them starts a new sample. */
export const JEV_QUESTIONS={
 chase:{type:'boolean' as const,instructions:'Is `distancePastLevelAtr` large enough that a new long would be chasing a completed move?',criteria:{true:'The completed move is already stretched past the level',false:'Price is still near the level'}},
 flowAgrees:{type:'boolean' as const,instructions:'Does `flowStamp` show buyers supporting a long?',criteria:{true:'The stamp is aggressive buying',false:'The stamp is divergence, unavailable, or does not show buyers'}},
 btcHeadwind:{type:'boolean' as const,instructions:'Does `btcTrend` argue against a new long?',criteria:{true:'The Bitcoin trend is a headwind for a new long',false:'The Bitcoin trend does not argue against a new long'}},
};
export type JevStamp={rule:typeof JEV_RULE;status:'scored'|'unavailable';chase:number|null;flowAgrees:number|null;btcHeadwind:number|null;btcTrend:string;flowStamp:string;model:string|null;checkedAt:string};
type JevRow={stage:string;asOf?:string|null;kind?:string|null;relativeVolume?:number|null;changePct?:number|null;trigger?:number|null;close?:number|null;atr?:number|null;pair?:{product:string}|null;flowStamp?:{stamp:string};jev?:JevStamp};
const round2=(n:number|null|undefined)=>typeof n==='number'&&Number.isFinite(n)?Math.round(n*100)/100:null;
export function unavailableJev(now=Date.now(),btcTrend='UNAVAILABLE',flowStamp='unavailable'):JevStamp{
 return {rule:JEV_RULE,status:'unavailable',chase:null,flowAgrees:null,btcHeadwind:null,btcTrend,flowStamp,model:null,checkedAt:new Date(now).toISOString()};
}
export function jevState(row:JevRow,btcTrend:string,flowStamp:string){
 const distance=typeof row.atr==='number'&&row.atr>0&&typeof row.close==='number'&&typeof row.trigger==='number'?round2((row.close-row.trigger)/row.atr):null;
 return {stage:row.stage,kind:row.kind??null,relativeVolume:round2(row.relativeVolume),changePct:round2(row.changePct),distancePastLevelAtr:distance,flowStamp,btcTrend};
}
function yes(answer:unknown):number|null{
 if(typeof answer==='number'&&Number.isFinite(answer)&&answer>=0&&answer<=1)return answer;
 if(!answer||typeof answer!=='object')return null;
 const record=answer as Record<string,unknown>;
 for(const key of ['noul','boolean','probability','p']){
  const n=record[key];
  if(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)return n;
 }
 return null;
}
async function ask(state:ReturnType<typeof jevState>):Promise<{chase:number;flowAgrees:number;btcHeadwind:number;model:string}|null>{
 const key=process.env.AI_GATEWAY_API_KEY?.trim();
 if(!key)return null;
 const r=await fetch(GATEWAY,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,state,questions:JEV_QUESTIONS}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)return null;
 const body=await r.json() as {model?:unknown;answers?:Record<string,unknown>};
 const answers=body.answers??(body as unknown as Record<string,unknown>);
 const chase=yes(answers.chase),flowAgrees=yes(answers.flowAgrees),btcHeadwind=yes(answers.btcHeadwind);
 if(chase==null||flowAgrees==null||btcHeadwind==null)return null;
 return {chase,flowAgrees,btcHeadwind,model:typeof body.model==='string'?body.model:MODEL};
}
/** Scores named setups that do not already have a stamp. Never throws and never changes a stage. */
export async function scoreJevRows<T extends JevRow>(rows:T[],btcTrend:string,now=Date.now()){
 if(!process.env.AI_GATEWAY_API_KEY?.trim())return;
 const due=rows.filter(r=>JEV_STAGES.includes(r.stage as typeof JEV_STAGES[number])&&r.asOf&&r.jev?.rule!==JEV_RULE);
 for(let i=0;i<due.length;i+=4){
  await Promise.all(due.slice(i,i+4).map(async row=>{
   const stage=row.stage;
   try{
    const flow=row.flowStamp?.stamp??(await fetchFlowStamp(row.pair?.product.split('-')[0]??'',now)).stamp;
    const scored=await ask(jevState(row,btcTrend,flow));
    row.jev=scored?{rule:JEV_RULE,status:'scored',...scored,btcTrend,flowStamp:flow,checkedAt:new Date(now).toISOString()}:unavailableJev(now,btcTrend,flow);
   }catch{row.jev=unavailableJev(now,btcTrend);}
   row.stage=stage;
  }));
 }
}
/** One Bitcoin read for the whole scan, then one Jev request per unscored named setup. */
export async function attachJevShadow<T extends JevRow>(rows:T[],now=Date.now()){
 let trend='UNAVAILABLE';
 try{trend=(await currentBtcRegime(now)).state||'UNAVAILABLE';}catch{trend='UNAVAILABLE';}
 try{await scoreJevRows(rows,trend,now);}catch{for(const row of rows)if(!row.jev&&JEV_STAGES.includes(row.stage as typeof JEV_STAGES[number])&&row.asOf)row.jev=unavailableJev(now,trend);}
}
