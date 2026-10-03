import type {Redis} from '@upstash/redis';
import type {JevStamp} from './cryptoJev';
import type {CatalystStamp} from './cryptoJevCatalyst';
import {catalystSideLabel,jevSideLabel,type CatalystQuestionKey,type JevQuestionId} from './cryptoJevEvidence';
import {CAL_CORE} from './calibrationCore';
import type {CalibrationLedger} from './cryptoCalibration';
/**
 * Composite shadow score (shadow-score-v1). Weights are read from the calibration ledger: one weight per CONFIRMED side,
 * equal to that side's lift in multiples of the confirmation floor (0.25R or 1%), clipped at ±2. Nothing is fitted here.
 * Hard gate: fewer than two distinct confirmed fields → not available, no row is scored. When available, a setup's score
 * is the sum of the weights of the confirmed sides it currently sits on; it is stamped at scan time with the weights
 * version, so the ledger can grade it out of sample later. Evidence only: never blocks, never opens, never sizes.
 */
export const SHADOW_SCORE_RULE='shadow-score-v1' as const;
export const SHADOW_WEIGHTS_KEY='admin:crypto-markets:shadow-weights:v1';
export const SHADOW_WEIGHTS_ACTIVE=`${SHADOW_WEIGHTS_KEY}:active`;
export const SHADOW_WORKSPACE_COUNT_KEY=`${SHADOW_WEIGHTS_KEY}:workspaces`;
export const SHADOW_STAMP_ATTEMPT_KEY='admin:crypto-markets:shadow-score:last-attempt:v1';
export const shadowWeightsKey=(workspaceId:string)=>`${SHADOW_WEIGHTS_KEY}:${workspaceId}`;
export type ShadowStampOutcome='stamped'|'already-current'|'pointer-missing'|'pointer-none'|'weights-missing'|'weights-unavailable'|'no-named-rows';
export type ShadowStampAttempt={at:string;stamped:number;available:boolean;pointer:string|null;weightsVersion:string|null;named:number;outcome:ShadowStampOutcome};
export type ShadowWorkspaceCount={count:number;at:string;pointer:string};
export const SHADOW={minConfirmedFields:2,clip:2} as const;
export type ShadowWeight={field:string;label:string;side:string;unit:'R'|'%';lift:number;weight:number;n:number;outcome:string};
export type ShadowWeights={rule:typeof SHADOW_SCORE_RULE;version:string;computedAt:string;ledgerCheckedAt:string;available:boolean;reason:string;weights:ShadowWeight[];confirmedFields:number};
export type ShadowStamp={rule:typeof SHADOW_SCORE_RULE;weightsVersion:string;score:number;matched:Array<{field:string;side:string;weight:number}>;evaluable:number;skipped:string[];checkedAt:string};
export type ShadowContext={btcState?:string|null;btcLongTrend?:string|null};
type ScoreRow={stage:string;kind?:string|null;jev?:JevStamp;catalyst?:CatalystStamp;flowStamp?:{stamp:string};pair?:{exchange?:string}|null};
const hash=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);};
/** From a saved ledger: confirmed, non-informational sides become weights. Pure. */
export function deriveShadowWeights(ledger:CalibrationLedger|null,now=Date.now()):ShadowWeights{
 const weights:ShadowWeight[]=[];
 for(const f of ledger?.fields??[])for(const s of f.sides){
  // The shadow score is stamped on momentum rows; the base-breakout sleeve and the backtest are different ledgers and stay out of it.
  if(f.outcome==='baseR'||f.outcome==='backtestR'||s.informational||s.status!=='confirmed'||s.lift==null)continue;
  const floor=f.unit==='R'?CAL_CORE.minLiftR:CAL_CORE.minLiftPct;
  const weight=Math.max(-SHADOW.clip,Math.min(SHADOW.clip,s.lift/floor));
  weights.push({field:f.id,label:f.label,side:s.side,unit:f.unit,lift:s.lift,weight:Math.round(weight*100)/100,n:s.n,outcome:f.outcome});
 }
 weights.sort((a,b)=>a.field.localeCompare(b.field)||a.side.localeCompare(b.side));
 const confirmedFields=new Set(weights.map(w=>w.field)).size;
 const available=confirmedFields>=SHADOW.minConfirmedFields;
 const version=hash(JSON.stringify(weights.map(w=>[w.field,w.side,w.weight])));
 const reason=!ledger?'No calibration ledger saved yet.':available?`${weights.length} confirmed sides across ${confirmedFields} fields.`:`${confirmedFields} confirmed field${confirmedFields===1?'':'s'}; the score needs at least ${SHADOW.minConfirmedFields}. Nothing is fitted until then.`;
 return {rule:SHADOW_SCORE_RULE,version,computedAt:new Date(now).toISOString(),ledgerCheckedAt:ledger?.checkedAt??'',available,reason,weights,confirmedFields};
}
/** Which side of each weighted field a live setup sits on. Entry-time-only fields (RS, funding, venue, shadow filter) cannot be read before entry and are skipped. */
export function rowSide(field:string,row:ScoreRow,ctx:ShadowContext):string|null{
 if(field.startsWith('jev.'))return jevSideLabel(field.slice(4) as JevQuestionId,row.jev);
 if(field.startsWith('catalyst.'))return catalystSideLabel(field.slice(9) as CatalystQuestionKey,row.catalyst);
 if(field==='signal.kind')return row.kind??'NOT_RECORDED';
 if(field==='forward.bucket')return row.stage;
 if(field==='flowStamp.stamp')return row.flowStamp?.stamp??'NOT_RECORDED';
 if(field==='btcRegime.state')return ctx.btcState??'NOT_RECORDED';
 if(field==='btcRegime.longTrend')return ctx.btcLongTrend??'NOT_RECORDED';
 return null;
}
export function scoreRow(row:ScoreRow,weights:ShadowWeights,ctx:ShadowContext={},now=Date.now()):ShadowStamp|null{
 if(!weights.available)return null;
 const matched:ShadowStamp['matched']=[],skipped=new Set<string>();let evaluable=0;
 const fields=new Set(weights.weights.map(w=>w.field));
 for(const field of fields){const side=rowSide(field,row,ctx);if(side==null)skipped.add(field);else evaluable++;}
 for(const w of weights.weights){const side=rowSide(w.field,row,ctx);if(side!=null&&side===w.side)matched.push({field:w.field,side:w.side,weight:w.weight});}
 const score=Math.round(matched.reduce((s,m)=>s+m.weight,0)*100)/100;
 return {rule:SHADOW_SCORE_RULE,weightsVersion:weights.version,score,matched,evaluable,skipped:[...skipped].sort(),checkedAt:new Date(now).toISOString()};
}
export async function persistShadowWeights(redis:Pick<Redis,'set'>,ledger:CalibrationLedger,workspaceId:string,now=Date.now()){
 const weights=deriveShadowWeights(ledger,now);
 await redis.set(shadowWeightsKey(workspaceId),weights,{ex:7*86400});
 return weights;
}
/**
 * Shared scans stamp only when the active pointer is exactly one workspace id.
 * `none` (written when the crypto paper workspace count is not exactly 1) or a missing pointer scores nothing.
 * That is deliberate: the scan is shared, and stamping one workspace's weights onto it while several ledgers exist would mix evidence.
 * It is also why a workspace can show available weights and still have zero current stamps. The learning status line prints the pointer.
 */
export async function loadShadowWeights(redis:Pick<Redis,'get'>){
 const active=await redis.get<string>(SHADOW_WEIGHTS_ACTIVE);
 if(typeof active!=='string'||!active||active==='none')return null;
 return redis.get<ShadowWeights>(shadowWeightsKey(active));
}
/** Writes the pointer and the workspace count together. Count other than 1 stores the pointer `none` and stamps nothing. */
export async function publishShadowPointer(redis:Pick<Redis,'set'>,workspaceIds:string[],now=Date.now()){
 const pointer=workspaceIds.length===1?workspaceIds[0]:'none';
 const at=new Date(now).toISOString();
 await redis.set(SHADOW_WEIGHTS_ACTIVE,pointer,{ex:7*86400});
 await redis.set(SHADOW_WORKSPACE_COUNT_KEY,{count:workspaceIds.length,at,pointer} satisfies ShadowWorkspaceCount,{ex:7*86400});
 return pointer;
}
const NAMED=new Set(['MOMENTUM_VOLUME','VOLUME_WATCH','EXTENDED','EARLY_WATCH']);
async function rememberStampAttempt(redis:Pick<Redis,'get'>,attempt:ShadowStampAttempt){
 const writer=redis as Pick<Redis,'get'>&{set?:(key:string,value:ShadowStampAttempt,opts?:{ex:number})=>Promise<unknown>};
 if(typeof writer.set!=='function')return;
 try{await writer.set(SHADOW_STAMP_ATTEMPT_KEY,attempt,{ex:14*86400});}catch{/* measurement only */}
}
/** Stamps named rows that lack a stamp under the current weights version. Never throws, never changes a stage. Records the attempt when the client can set a key. */
export async function attachShadowScore<T extends ScoreRow&{asOf?:string|null;shadow?:ShadowStamp}>(redis:Pick<Redis,'get'>,rows:T[],ctx:ShadowContext,now=Date.now()){
 let pointer:string|null=null;
 let weights:ShadowWeights|null=null;
 try{
  const active=await redis.get<string>(SHADOW_WEIGHTS_ACTIVE);
  pointer=typeof active==='string'&&active?active:null;
  if(pointer&&pointer!=='none')weights=await redis.get<ShadowWeights>(shadowWeightsKey(pointer));
 }catch{pointer=null;weights=null;}
 const named=rows.filter(r=>NAMED.has(r.stage)&&r.asOf).length;
 let stamped=0;
 if(weights?.available){
  for(const row of rows){
   if(!NAMED.has(row.stage)||!row.asOf||row.shadow?.weightsVersion===weights.version)continue;
   const stage=row.stage;
   try{const s=scoreRow(row,weights,ctx,now);if(s){row.shadow=s;stamped++;}}catch{/* evidence only */}
   row.stage=stage;
  }
 }
 const outcome:ShadowStampOutcome=!pointer?'pointer-missing':pointer==='none'?'pointer-none':!weights?'weights-missing':!weights.available?'weights-unavailable':!named?'no-named-rows':stamped>0?'stamped':'already-current';
 await rememberStampAttempt(redis,{at:new Date(now).toISOString(),stamped,available:!!weights?.available,pointer,weightsVersion:weights?.version??null,named,outcome});
 return {stamped,available:!!weights?.available};
}
/** Batch helper: reads the saved BTC regime for context, then stamps. Never throws. */
export async function attachShadowScoreWithContext<T extends ScoreRow&{asOf?:string|null;shadow?:ShadowStamp}>(redis:Pick<Redis,'get'>,rows:T[],now=Date.now()){
 let ctx:ShadowContext={};
 try{const {savedBtcRegime}=await import('./cryptoBtcRegime');const r=await savedBtcRegime();ctx={btcState:r?.state??null,btcLongTrend:r?.longTrend??null};}catch{ctx={};}
 return attachShadowScore(redis,rows,ctx,now).catch(()=>({stamped:0,available:false}));
}
/** Ledger side for a stored stamp: sign split, no thresholds to fit. Older weights versions are shown but not graded. */
export function shadowSideLabel(stamp:ShadowStamp|null|undefined,currentVersion:string|null){
 if(!stamp)return 'NOT_RECORDED';
 if(currentVersion&&stamp.weightsVersion!==currentVersion)return 'Shadow older weights';
 return stamp.score>0?'shadow score >0':stamp.score<0?'shadow score <0':'shadow score 0';
}
