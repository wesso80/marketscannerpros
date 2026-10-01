import type {Redis} from '@upstash/redis';
import {q} from '@/lib/db';
import {FORWARD_BOOK_KEY,type ForwardBook,type ForwardRow} from './cryptoForwardScore';
import type {JevStamp} from './cryptoJev';
import type {CatalystStamp} from './cryptoJevCatalyst';
import {JEV_LABELS,JEV_QUESTION_IDS,JEV_YES,jevFromReason,jevSideLabel,type JevQuestionId} from './cryptoJevEvidence';
import {createRecommendation,loadRecommendations,saveRecommendations,type Recommendation} from './cryptoRecommendations';
import {CAL_CORE,calibrateField as coreCalibrateField,splitAt,type CalibrationFieldBase,type CalibrationSide,type CalibrationStatus,type FieldDef} from './calibrationCore';
export type {CalibrationSide,CalibrationStatus};
/**
 * Calibration ledger: every recorded evidence field against the outcome already stored beside it.
 * Pure arithmetic over saved rows. Nothing here reads a provider, scores with Jev, opens a trade, or edits a rule.
 * The only side effect is a text Recommendation row when a field clears the fixed two-window test; a person decides what to do with it.
 * Thresholds and the 0.50 split are constants. Changing one changes a ruleVersion and restarts that field's sample.
 */
export const CALIBRATION_KEY='admin:crypto-markets:calibration:v1';
export const CALIBRATION_FILED_KEY='admin:crypto-markets:calibration:filed:v1';
export const CALIBRATION_DAY_KEY='admin:crypto-markets:calibration:day';
export const CAL={...CAL_CORE,weeklyCap:3,ttlSec:48*3600,cooldownMs:600000,sources:{paper:'crypto paper ledger (closed trades with R)',forward:'saved forward score (24h mark)'}} as const;
const PAPER_NAME='Crypto Markets Paper';
export type CalibrationField=CalibrationFieldBase<'paperR'|'forward24h'>;
export type CalibrationLedger={version:1;checkedAt:string;source:{closedTrades:number;withR:number;forwardRows:number;forwardFilled24h:number;splitAt:{paper:string|null;forward:string|null}};fields:CalibrationField[];note:string};
export type PaperObs={at:number;r:number;reason:Record<string,unknown>|null;jev:JevStamp|undefined;catalyst:CatalystStamp|undefined;venue:string;exit:string};
export type ForwardObs={at:number;day:number;h4:number|null;bucket:string;jev:JevStamp|undefined;catalyst:CatalystStamp|undefined};
const str=(v:unknown)=>typeof v==='string'&&v.trim()?v.trim():null;
const path=(o:Record<string,unknown>|null,...keys:string[])=>{let cur:unknown=o;for(const k of keys){if(!cur||typeof cur!=='object')return null;cur=(cur as Record<string,unknown>)[k];}return str(cur);};
const jevField=<O extends {jev:JevStamp|undefined}>(qid:JevQuestionId,file:string):FieldDef<O>=>({id:`jev.${qid}`,label:`Jev ${JEV_LABELS[qid]} at 0.50`,file,ruleVersion:'jev-shadow-v2',side:o=>jevSideLabel(qid,o.jev)});
const CATALYST_IDS=['listingNews','supplyEvent','exploitOrOutage','regulatoryNegative','narrativeOnly'] as const;
const CATALYST_LABELS:Record<typeof CATALYST_IDS[number],string>={listingNews:'listing news',supplyEvent:'supply event',exploitOrOutage:'exploit or outage',regulatoryNegative:'regulatory negative',narrativeOnly:'narrative only'};
/** `no headlines` is a real side: the coin had no coin-tagged news in the window. Unavailable and unstamped are informational. */
export function catalystSideLabel(qid:typeof CATALYST_IDS[number],c:CatalystStamp|null|undefined){
 if(!c)return 'NOT_RECORDED';
 if(c.status==='no-headlines')return 'no headlines';
 const p=c[qid];
 if(c.status!=='scored'||typeof p!=='number')return 'Catalyst unavailable';
 return `${CATALYST_LABELS[qid]} ${p>=JEV_YES?'≥':'<'}${JEV_YES.toFixed(2)}`;
}
export function catalystFromReason(reason:string|null|undefined):CatalystStamp|undefined{
 const c=reasonJson(reason)?.catalyst as CatalystStamp|undefined;
 return c&&typeof c==='object'&&typeof c.rule==='string'&&['scored','no-headlines','unavailable'].includes(c.status)?c:undefined;
}
const catalystField=<O extends {catalyst:CatalystStamp|undefined}>(qid:typeof CATALYST_IDS[number],file:string):FieldDef<O>=>({id:`catalyst.${qid}`,label:`Catalyst ${CATALYST_LABELS[qid]} at 0.50`,file,ruleVersion:'jev-catalyst-v2',side:o=>catalystSideLabel(qid,o.catalyst)});
/** Paper-ledger fields, read from the createdReason JSON saved with each entry. Adding a field is one line. */
export const PAPER_FIELDS:FieldDef<PaperObs>[]=[
 {id:'btcRegime.state',label:'BTC daily trend at entry',file:'lib/admin/cryptoPaperMarket.ts',ruleVersion:'btc-regime-v1',side:o=>path(o.reason,'btcRegime','state')??'NOT_RECORDED'},
 {id:'btcRegime.longTrend',label:'BTC 200-day regime at entry',file:'lib/admin/cryptoPaperMarket.ts',ruleVersion:'btc-200-v1',side:o=>path(o.reason,'btcRegime','longTrend')??'NOT_RECORDED'},
 {id:'shadowFilter.decision',label:'Shadow filter: skip when BTC daily is DOWN',file:'lib/admin/cryptoPaperMarket.ts',ruleVersion:'shadow-filter-v1',side:o=>path(o.reason,'shadowFilter','decision')??'NOT_RECORDED'},
 {id:'flow.state',label:'Liquidation / taker-flow state at entry',file:'lib/admin/cryptoFlow.ts',ruleVersion:'flow-v1',side:o=>path(o.reason,'flow','state')??'NOT_RECORDED'},
 {id:'flowStamp.stamp',label:'OKX taker-flow stamp at entry',file:'lib/admin/cryptoFlow.ts',ruleVersion:'flow-stamp-v1',side:o=>path(o.reason,'flowStamp','stamp')??'NOT_RECORDED'},
 {id:'relativeStrength.rule',label:'Relative-strength leader rule at entry',file:'lib/admin/cryptoPaperMarket.ts',ruleVersion:'rs-v1',side:o=>path(o.reason,'relativeStrength','rule')??'NOT_RECORDED'},
 {id:'derivatives.fundingState',label:'OKX perpetual funding state at entry',file:'lib/admin/cryptoPaperMarket.ts',ruleVersion:'funding-v1',side:o=>path(o.reason,'derivatives','fundingState')??'NOT_RECORDED'},
 {id:'signal.kind',label:'Setup kind',file:'lib/admin/cryptoVolumeMomentum.ts',ruleVersion:'momentum-v1',side:o=>path(o.reason,'signal','kind')??'NOT_RECORDED'},
 {id:'venue',label:'Venue',file:'lib/admin/cryptoPaperMarket.ts',ruleVersion:'venue-v1',side:o=>o.venue},
 ...JEV_QUESTION_IDS.map(qid=>jevField<PaperObs>(qid,'lib/admin/cryptoPaperMarket.ts')),
 ...CATALYST_IDS.map(qid=>catalystField<PaperObs>(qid,'lib/admin/cryptoPaperMarket.ts')),
];
/** Forward-score fields, read from the saved forward book. 24h mark is the outcome; 4h is shown beside it. */
export const FORWARD_FIELDS:FieldDef<ForwardObs>[]=[
 {id:'forward.bucket',label:'Forward bucket',file:'lib/admin/cryptoVolumeMomentum.ts',ruleVersion:'momentum-v1',side:o=>o.bucket},
 ...JEV_QUESTION_IDS.map(qid=>jevField<ForwardObs>(qid,'lib/admin/cryptoVolumeMomentum.ts')),
 ...CATALYST_IDS.map(qid=>catalystField<ForwardObs>(qid,'lib/admin/cryptoVolumeMomentum.ts')),
];
export function reasonJson(reason:string|null|undefined):Record<string,unknown>|null{
 const i=reason?.indexOf('{')??-1;if(!reason||i<0)return null;
 try{const parsed=JSON.parse(reason.slice(i));return parsed&&typeof parsed==='object'?parsed as Record<string,unknown>:null;}catch{return null;}
}
export type PaperSourceRow={r_multiple:string|number|null;entry_time:string|Date;exit_reason:string;instrument_type:string;created_reason:string|null};
export function paperObservations(rows:PaperSourceRow[]):PaperObs[]{
 const out:PaperObs[]=[];
 for(const row of rows){
  const r=row.r_multiple==null?NaN:Number(row.r_multiple),at=new Date(row.entry_time).getTime();
  if(!Number.isFinite(r)||!Number.isFinite(at))continue;
  out.push({at,r,reason:reasonJson(row.created_reason),jev:jevFromReason(row.created_reason),catalyst:catalystFromReason(row.created_reason),venue:row.instrument_type.startsWith('okx-usd-v1:')?'OKX USDT→USD':row.instrument_type.startsWith('coinbase:')?'Coinbase USD':'OTHER',exit:row.exit_reason});
 }
 return out;
}
export function forwardObservations(rows:ForwardRow[]):ForwardObs[]{
 const out:ForwardObs[]=[];
 for(const row of rows){
  const at=Date.parse(row.signalAt);
  if(row.day.status!=='filled'||!Number.isFinite(at))continue;
  out.push({at,day:row.day.changePct,h4:row.next4h.status==='filled'?row.next4h.changePct:null,bucket:row.bucket,jev:row.jev,catalyst:row.catalyst});
 }
 return out;
}
/** Crypto wrapper over the shared core; kept so existing callers and tests keep one import. */
export function calibrateField<O extends {at:number}>(def:FieldDef<O>,obs:O[],value:(o:O)=>number,unit:'R'|'%',outcome:CalibrationField['outcome']):CalibrationField{
 return coreCalibrateField(def,obs,value,unit,outcome);
}
export function buildCalibration(paper:PaperObs[],forward:ForwardObs[],meta:{closedTrades:number;forwardRows:number},now=Date.now()):CalibrationLedger{
 const fields=[
  ...PAPER_FIELDS.map(def=>calibrateField(def,paper,o=>o.r,'R','paperR')),
  ...FORWARD_FIELDS.map(def=>calibrateField(def,forward,o=>o.day,'%','forward24h')),
 ];
 const confirmed=fields.flatMap(f=>f.sides.filter(s=>s.status==='confirmed').map(s=>`${f.id} ${s.side}`));
 const note=!paper.length&&!forward.length?'No closed paper trades with R and no filled 24h forward marks yet. Nothing to calibrate.':`Lift is the side's mean minus the overall mean on the same rows: R for the paper ledger, % for the 24h forward mark. A side under ${CAL.minSide} rows is collecting. Confirmed needs the same sign of lift in both time halves (${CAL.minHalf}+ rows each) and at least ${CAL.minLiftR}R or ${CAL.minLiftPct}%. ${confirmed.length?`Confirmed: ${confirmed.join('; ')}.`:'Nothing is confirmed yet.'} Evidence only; nothing here changes a rule.`;
 return {version:1,checkedAt:new Date(now).toISOString(),source:{closedTrades:meta.closedTrades,withR:paper.length,forwardRows:meta.forwardRows,forwardFilled24h:forward.length,splitAt:{paper:splitAt(paper),forward:splitAt(forward)}},fields,note};
}
const fmt=(n:number|null,unit:'R'|'%')=>n==null?'n/a':`${n>=0?'+':''}${n.toFixed(2)}${unit}`;
export const filedKey=(field:CalibrationField,side:CalibrationSide)=>`${field.id}|${side.side}|${field.ruleVersion}|${side.status}`;
/**
 * Files one text Recommendation per newly confirmed (or newly contradicted after a filing) side, at most weeklyCap per rolling week.
 * Returns the new recommendation list and the keys that were filed. Nothing is applied.
 */
export function proposeFromLedger(ledger:CalibrationLedger,rows:Recommendation[],filed:Record<string,string>,now=Date.now()):{rows:Recommendation[];filed:Record<string,string>;filedNow:string[];skippedByCap:number}{
 const week=now-7*86400000;
 let budget=Math.max(0,CAL.weeklyCap-rows.filter(r=>r.setup.startsWith('calibration ·')&&Date.parse(r.createdAt)>week).length);
 let next=rows;const nextFiled={...filed},filedNow:string[]=[];let skippedByCap=0;
 for(const field of ledger.fields)for(const side of field.sides){
  if(side.informational)continue;
  const key=filedKey(field,side);
  const wasConfirmed=!!nextFiled[`${field.id}|${side.side}|${field.ruleVersion}|confirmed`];
  const due=(side.status==='confirmed'&&!nextFiled[key])||(side.status==='contradicted'&&wasConfirmed&&!nextFiled[key]);
  if(!due)continue;
  if(budget<=0){skippedByCap++;continue;}
  const sourceLabel=field.outcome==='paperR'?CAL.sources.paper:CAL.sources.forward;
  const text=side.status==='confirmed'
   ?`Over ${side.n} rows, ${field.label} = ${side.side} ran ${fmt(side.lift,field.unit)} against the overall mean (halves ${fmt(side.halfA.lift,field.unit)} on ${side.halfA.n} / ${fmt(side.halfB.lift,field.unit)} on ${side.halfB.n}; mean ${fmt(side.mean,field.unit)}, se ${side.se==null?'n/a':side.se.toFixed(2)}). Source: ${sourceLabel}, rule ${field.ruleVersion}, computed ${ledger.checkedAt}. Consider ${side.lift!=null&&side.lift<0?'skipping or halving size':'keeping or favouring'} entries on this side. The split is the fixed read, not a fitted threshold. Evidence from paper research; it is not a live result and nothing has been changed.`
   :`Retraction: ${field.label} = ${side.side} was filed as confirmed but its two time halves now disagree (${fmt(side.halfA.lift,field.unit)} / ${fmt(side.halfB.lift,field.unit)} over ${side.n} rows). Treat the earlier proposal as unproven. Source: ${sourceLabel}, rule ${field.ruleVersion}, computed ${ledger.checkedAt}.`;
  next=createRecommendation(next,{setup:`calibration · ${field.id} · ${side.side}`,evidenceCount:String(side.n),proposedRuleChange:text.slice(0,1000),file:field.file},now);
  nextFiled[key]=new Date(now).toISOString();filedNow.push(key);budget--;
 }
 return {rows:next,filed:nextFiled,filedNow,skippedByCap};
}
export async function loadCalibrationInputs(redis:Pick<Redis,'get'>){
 const rows=await q<PaperSourceRow>(`SELECT t.r_multiple,t.entry_time,t.exit_reason,t.instrument_type,o.created_reason FROM arca_trades t JOIN arca_portfolios pf ON pf.id=t.portfolio_id AND pf.workspace_id=t.workspace_id LEFT JOIN arca_positions p ON p.id=t.position_id AND p.workspace_id=t.workspace_id LEFT JOIN arca_simulated_orders o ON o.id=p.source_order_id AND o.workspace_id=t.workspace_id WHERE pf.name=$1 AND pf.mode='SIMULATED'`,[PAPER_NAME]);
 const book=await redis.get<ForwardBook>(FORWARD_BOOK_KEY);
 return {rows,forwardRows:book?.rows??[]};
}
/** Recomputes the ledger from saved rows, files any due proposals, and persists both. */
export async function runCryptoCalibration(redis:Redis,now=Date.now()){
 const {rows,forwardRows}=await loadCalibrationInputs(redis);
 const ledger=buildCalibration(paperObservations(rows),forwardObservations(forwardRows),{closedTrades:rows.length,forwardRows:forwardRows.length},now);
 const [recs,filed]=await Promise.all([loadRecommendations(redis),redis.get<Record<string,string>>(CALIBRATION_FILED_KEY)]);
 const proposals=proposeFromLedger(ledger,recs,filed??{},now);
 if(proposals.filedNow.length){await saveRecommendations(redis,proposals.rows);await redis.set(CALIBRATION_FILED_KEY,proposals.filed);}
 await redis.set(CALIBRATION_KEY,ledger,{ex:CAL.ttlSec});
 return {ledger,filedNow:proposals.filedNow,skippedByCap:proposals.skippedByCap};
}
/** Once per UTC day from the cron; a second call the same day reads the saved ledger. */
export async function runDailyCalibration(redis:Redis,now=Date.now()){
 const day=new Date(now).toISOString().slice(0,10);
 const fresh=await redis.set(`${CALIBRATION_DAY_KEY}:${day}`,'done',{nx:true,ex:36*3600});
 if(!fresh)return {ok:true,skipped:true,reason:'Calibration already ran today'};
 try{const out=await runCryptoCalibration(redis,now);return {ok:true,skipped:false,filed:out.filedNow.length,skippedByCap:out.skippedByCap,fields:out.ledger.fields.length};}
 catch(error){console.error('[crypto-calibration] failed',error);return {ok:false,skipped:false,error:'Calibration pass failed; saved ledger unchanged'};}
}
