import type {Redis} from '@upstash/redis';
import {q} from '@/lib/db';
import {FORWARD_BOOK_KEY,type ForwardBook,type ForwardRow} from './cryptoForwardScore';
import type {JevStamp} from './cryptoJev';
import type {CatalystStamp} from './cryptoJevCatalyst';
import type {ChartStamp} from './cryptoJevChart';
import {JEV_LABELS,JEV_QUESTION_IDS,jevFromReason,jevSideLabel,CATALYST_IDS,CATALYST_LABELS,catalystSideLabel,CHART_IDS,CHART_LABELS,chartSideLabel,chartFromReason,type JevQuestionId} from './cryptoJevEvidence';
import {persistShadowWeights,shadowSideLabel,SHADOW_WEIGHTS_KEY,type ShadowStamp} from './cryptoShadowScore';
export {catalystSideLabel};
import {createRecommendation,loadRecommendations,saveRecommendations,type Recommendation} from './cryptoRecommendations';
import {CAL_CORE,INFORMATIONAL_SIDES,calibrateField as coreCalibrateField,splitAt,type CalibrationFieldBase,type CalibrationSide,type CalibrationStatus,type FieldDef} from './calibrationCore';
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
/** Read only: the saved backtest state. Kept as a string so this module never imports the backtest engine. */
const BACKTEST_KEY='admin:crypto-markets:backtest:v1';
export const CAL={...CAL_CORE,weeklyCap:3,ttlSec:48*3600,cooldownMs:600000,sources:{paper:'crypto paper ledger (closed trades with R)',forward:'saved forward score (24h mark)',base:'base-breakout sleeve (closed trades with R)',backtest:'saved momentum backtest (replayed trades with a real stop/target/time exit)'}} as const;
const PAPER_NAME='Crypto Markets Paper',BASE_NAME='Crypto Markets Paper Base';
export type CalibrationField=CalibrationFieldBase<'paperR'|'forward24h'|'baseR'|'backtestR'>;
export type CalibrationLedger={version:1;checkedAt:string;source:{closedTrades:number;withR:number;forwardRows:number;forwardFilled24h:number;baseTrades?:number;baseWithR?:number;backtestTrades?:number;backtestGraded?:number;backtestWindow?:string|null;splitAt:{paper:string|null;forward:string|null;base?:string|null;backtest?:string|null}};fields:CalibrationField[];note:string};
export type PaperObs={at:number;r:number;reason:Record<string,unknown>|null;jev:JevStamp|undefined;catalyst:CatalystStamp|undefined;chart:ChartStamp|undefined;shadow:ShadowStamp|undefined;venue:string;exit:string};
export type ForwardObs={at:number;day:number;h4:number|null;bucket:string;jev:JevStamp|undefined;catalyst:CatalystStamp|undefined;chart:ChartStamp|undefined;shadow:ShadowStamp|undefined};
/** One replayed backtest trade with a real exit. Marked-at-horizon rows are not outcomes and are left out. */
export type BacktestObs={at:number;r:number;kind:string;btcRegime:string;btc200:string;exit:string;jev:JevStamp|undefined;chart:ChartStamp|undefined};
const str=(v:unknown)=>typeof v==='string'&&v.trim()?v.trim():null;
const path=(o:Record<string,unknown>|null,...keys:string[])=>{let cur:unknown=o;for(const k of keys){if(!cur||typeof cur!=='object')return null;cur=(cur as Record<string,unknown>)[k];}return str(cur);};
const jevField=<O extends {jev:JevStamp|undefined}>(qid:JevQuestionId,file:string):FieldDef<O>=>({id:`jev.${qid}`,label:`Jev ${JEV_LABELS[qid]} at 0.50`,file,ruleVersion:'jev-shadow-v2',side:o=>jevSideLabel(qid,o.jev)});
export function catalystFromReason(reason:string|null|undefined):CatalystStamp|undefined{
 const c=reasonJson(reason)?.catalyst as CatalystStamp|undefined;
 return c&&typeof c==='object'&&typeof c.rule==='string'&&['scored','no-headlines','unavailable'].includes(c.status)?c:undefined;
}
export function shadowFromReason(reason:string|null|undefined):ShadowStamp|undefined{
 const s=reasonJson(reason)?.shadow as ShadowStamp|undefined;
 return s&&typeof s==='object'&&typeof s.weightsVersion==='string'&&typeof s.score==='number'?s:undefined;
}
const catalystField=<O extends {catalyst:CatalystStamp|undefined}>(qid:typeof CATALYST_IDS[number],file:string):FieldDef<O>=>({id:`catalyst.${qid}`,label:`Catalyst ${CATALYST_LABELS[qid]} at 0.50`,file,ruleVersion:'jev-catalyst-v2',side:o=>catalystSideLabel(qid,o.catalyst)});
const chartField=<O extends {chart:ChartStamp|undefined}>(qid:typeof CHART_IDS[number],file:string):FieldDef<O>=>({id:`chart.${qid}`,label:`Chart ${CHART_LABELS[qid]} at 0.50`,file,ruleVersion:'jev-chart-v1',side:o=>chartSideLabel(qid,o.chart)});
/** Graded only against the weights version current at calibration time; stamps from older weights are shown as informational. */
const shadowField=<O extends {shadow:ShadowStamp|undefined}>(file:string,version:()=>string|null):FieldDef<O>=>({id:'shadow.sign',label:'Composite shadow score, sign',file,ruleVersion:'shadow-score-v1',side:o=>shadowSideLabel(o.shadow,version())});
let currentShadowVersion:string|null=null;
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
 ...CHART_IDS.map(qid=>chartField<PaperObs>(qid,'lib/admin/cryptoJevChart.ts')),
 shadowField<PaperObs>('lib/admin/cryptoShadowScore.ts',()=>currentShadowVersion),
];
/** Forward-score fields, read from the saved forward book. 24h mark is the outcome; 4h is shown beside it. */
export const FORWARD_FIELDS:FieldDef<ForwardObs>[]=[
 {id:'forward.bucket',label:'Forward bucket',file:'lib/admin/cryptoVolumeMomentum.ts',ruleVersion:'momentum-v1',side:o=>o.bucket},
 ...JEV_QUESTION_IDS.map(qid=>jevField<ForwardObs>(qid,'lib/admin/cryptoVolumeMomentum.ts')),
 ...CATALYST_IDS.map(qid=>catalystField<ForwardObs>(qid,'lib/admin/cryptoVolumeMomentum.ts')),
 ...CHART_IDS.map(qid=>chartField<ForwardObs>(qid,'lib/admin/cryptoJevChart.ts')),
 shadowField<ForwardObs>('lib/admin/cryptoShadowScore.ts',()=>currentShadowVersion),
];
/** Base-breakout sleeve fields: the same stamps plus the base's own shape, graded on that ledger's R only. */
export const BASE_FIELDS:FieldDef<PaperObs>[]=[
 {id:'btcRegime.state',label:'BTC daily trend at entry',file:'lib/admin/cryptoPaperBase.ts',ruleVersion:'btc-regime-v1',side:o=>path(o.reason,'btcRegime','state')??'NOT_RECORDED'},
 {id:'base.width',label:'Daily base width (≤10% vs wider)',file:'lib/admin/cryptoPaperBase.ts',ruleVersion:'base-shape-v1',side:o=>{const w=Number((o.reason?.base as Record<string,unknown>|undefined)?.widthPct);return Number.isFinite(w)?w<=10?'width ≤10%':'width >10%':'NOT_RECORDED';}},
 {id:'base.extension',label:'Entry extension above base high (≤1.5% vs more)',file:'lib/admin/cryptoPaperBase.ts',ruleVersion:'base-shape-v1',side:o=>{const e=Number(o.reason?.extensionPct);return Number.isFinite(e)?e<=1.5?'extension ≤1.5%':'extension >1.5%':'NOT_RECORDED';}},
 {id:'venue',label:'Venue',file:'lib/admin/cryptoPaperBase.ts',ruleVersion:'venue-v1',side:o=>o.venue},
 ...JEV_QUESTION_IDS.map(qid=>jevField<PaperObs>(qid,'lib/admin/cryptoPaperBase.ts')),
 ...CHART_IDS.map(qid=>chartField<PaperObs>(qid,'lib/admin/cryptoJevChart.ts')),
 ...CATALYST_IDS.map(qid=>catalystField<PaperObs>(qid,'lib/admin/cryptoPaperBase.ts')),
];
/** Backtest fields: the live rule's own tags plus the Jev reads replayed on each signal. flowAgrees is omitted: no historical flow stamp exists. */
export const BACKTEST_FIELDS:FieldDef<BacktestObs>[]=[
 {id:'signal.kind',label:'Setup kind',file:'lib/admin/cryptoVolumeMomentum.ts',ruleVersion:'momentum-v1',side:o=>o.kind},
 {id:'btcRegime.state',label:'BTC daily trend at signal',file:'lib/admin/cryptoBacktest.ts',ruleVersion:'btc-regime-v1',side:o=>o.btcRegime||'NOT_RECORDED'},
 {id:'btcRegime.longTrend',label:'BTC 200-day regime at signal',file:'lib/admin/cryptoBacktest.ts',ruleVersion:'btc-200-v1',side:o=>o.btc200||'NOT_RECORDED'},
 ...(['chase','btcHeadwind'] as const).map(qid=>jevField<BacktestObs>(qid,'lib/admin/cryptoBacktestJev.ts')),
 ...CHART_IDS.map(qid=>chartField<BacktestObs>(qid,'lib/admin/cryptoJevChart.ts')),
];
export type BacktestSourceTrade={signalAt:string;kind:string;btcRegime:string;btc200?:string;fixed:{status:string;marked?:true;r:number|null;exit:string|null};jev?:JevStamp;chart?:ChartStamp};
export function backtestObservations(trades:BacktestSourceTrade[]):BacktestObs[]{
 const out:BacktestObs[]=[];
 for(const t of trades){
  const at=Date.parse(t.signalAt);
  if(t.fixed.status!=='CLOSED'||t.fixed.marked||typeof t.fixed.r!=='number'||!Number.isFinite(t.fixed.r)||!Number.isFinite(at))continue;
  out.push({at,r:t.fixed.r,kind:t.kind,btcRegime:t.btcRegime,btc200:t.btc200??'',exit:t.fixed.exit??'',jev:t.jev,chart:t.chart});
 }
 return out;
}
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
  out.push({at,r,reason:reasonJson(row.created_reason),jev:jevFromReason(row.created_reason),catalyst:catalystFromReason(row.created_reason),chart:chartFromReason(row.created_reason),shadow:shadowFromReason(row.created_reason),venue:row.instrument_type.startsWith('okx-usd-v1:')?'OKX USDT→USD':row.instrument_type.startsWith('coinbase:')?'Coinbase USD':'OTHER',exit:row.exit_reason});
 }
 return out;
}
export function forwardObservations(rows:ForwardRow[]):ForwardObs[]{
 const out:ForwardObs[]=[];
 for(const row of rows){
  const at=Date.parse(row.signalAt);
  if(row.day.status!=='filled'||!Number.isFinite(at))continue;
  out.push({at,day:row.day.changePct,h4:row.next4h.status==='filled'?row.next4h.changePct:null,bucket:row.bucket,jev:row.jev,catalyst:row.catalyst,chart:row.chart,shadow:row.shadow});
 }
 return out;
}
/** Crypto wrapper over the shared core; kept so existing callers and tests keep one import. */
export function calibrateField<O extends {at:number}>(def:FieldDef<O>,obs:O[],value:(o:O)=>number,unit:'R'|'%',outcome:CalibrationField['outcome']):CalibrationField{
 return coreCalibrateField(def,obs,value,unit,outcome,new Set([...INFORMATIONAL_SIDES,'Shadow older weights']));
}
/** `shadowVersion` is the weights version in force when the rows were stamped; stamps from other versions are not graded. */
export function buildCalibration(paper:PaperObs[],forward:ForwardObs[],meta:{closedTrades:number;forwardRows:number;shadowVersion?:string|null;baseTrades?:number;backtestTrades?:number;backtestWindow?:string|null},now=Date.now(),base:PaperObs[]=[],backtest:BacktestObs[]=[]):CalibrationLedger{
 currentShadowVersion=meta.shadowVersion??null;
 const fields=[
  ...PAPER_FIELDS.map(def=>calibrateField(def,paper,o=>o.r,'R','paperR')),
  ...FORWARD_FIELDS.map(def=>calibrateField(def,forward,o=>o.day,'%','forward24h')),
  ...BASE_FIELDS.map(def=>calibrateField(def,base,o=>o.r,'R','baseR')),
  ...BACKTEST_FIELDS.map(def=>calibrateField(def,backtest,o=>o.r,'R','backtestR')),
 ];
 const confirmed=fields.flatMap(f=>f.sides.filter(s=>s.status==='confirmed').map(s=>`${f.id} ${s.side}`));
 const note=!paper.length&&!forward.length&&!base.length&&!backtest.length?'No closed paper trades with R and no filled 24h forward marks yet. Nothing to calibrate.':`Lift is the side's mean minus the overall mean on the same rows: R for the paper ledgers and the backtest, % for the 24h forward mark. A side under ${CAL.minSide} rows is collecting. Confirmed needs the same sign of lift in both time halves (${CAL.minHalf}+ rows each) and at least ${CAL.minLiftR}R or ${CAL.minLiftPct}%. ${confirmed.length?`Confirmed: ${confirmed.join('; ')}.`:'Nothing is confirmed yet.'} Backtest sides are graded on one replayed window; a side confirmed there is a hypothesis for the paper ledger, not a live result. Evidence only; nothing here changes a rule.`;
 return {version:1,checkedAt:new Date(now).toISOString(),source:{closedTrades:meta.closedTrades,withR:paper.length,forwardRows:meta.forwardRows,forwardFilled24h:forward.length,baseTrades:meta.baseTrades??0,baseWithR:base.length,backtestTrades:meta.backtestTrades??0,backtestGraded:backtest.length,backtestWindow:meta.backtestWindow??null,splitAt:{paper:splitAt(paper),forward:splitAt(forward),base:splitAt(base),backtest:splitAt(backtest)}},fields,note};
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
  const sourceLabel=field.outcome==='paperR'?CAL.sources.paper:field.outcome==='baseR'?CAL.sources.base:field.outcome==='backtestR'?CAL.sources.backtest:CAL.sources.forward;
  const text=side.status==='confirmed'
   ?`Over ${side.n} rows, ${field.label} = ${side.side} ran ${fmt(side.lift,field.unit)} against the overall mean (halves ${fmt(side.halfA.lift,field.unit)} on ${side.halfA.n} / ${fmt(side.halfB.lift,field.unit)} on ${side.halfB.n}; mean ${fmt(side.mean,field.unit)}, se ${side.se==null?'n/a':side.se.toFixed(2)}). Source: ${sourceLabel}, rule ${field.ruleVersion}, computed ${ledger.checkedAt}. Consider ${side.lift!=null&&side.lift<0?'skipping or halving size':'keeping or favouring'} entries on this side. The split is the fixed read, not a fitted threshold. Evidence from paper research; it is not a live result and nothing has been changed.`
   :`Retraction: ${field.label} = ${side.side} was filed as confirmed but its two time halves now disagree (${fmt(side.halfA.lift,field.unit)} / ${fmt(side.halfB.lift,field.unit)} over ${side.n} rows). Treat the earlier proposal as unproven. Source: ${sourceLabel}, rule ${field.ruleVersion}, computed ${ledger.checkedAt}.`;
  next=createRecommendation(next,{setup:`calibration · ${field.id} · ${side.side}`,evidenceCount:String(side.n),proposedRuleChange:text.slice(0,1000),file:field.file},now);
  nextFiled[key]=new Date(now).toISOString();filedNow.push(key);budget--;
 }
 return {rows:next,filed:nextFiled,filedNow,skippedByCap};
}
export async function loadCalibrationInputs(redis:Pick<Redis,'get'>){
 const sql=`SELECT t.r_multiple,t.entry_time,t.exit_reason,t.instrument_type,o.created_reason FROM arca_trades t JOIN arca_portfolios pf ON pf.id=t.portfolio_id AND pf.workspace_id=t.workspace_id LEFT JOIN arca_positions p ON p.id=t.position_id AND p.workspace_id=t.workspace_id LEFT JOIN arca_simulated_orders o ON o.id=p.source_order_id AND o.workspace_id=t.workspace_id WHERE pf.name=$1 AND pf.mode='SIMULATED'`;
 const [rows,baseRows]=await Promise.all([q<PaperSourceRow>(sql,[PAPER_NAME]),q<PaperSourceRow>(sql,[BASE_NAME]).catch(()=>[] as PaperSourceRow[])]);
 const [book,backtest]=await Promise.all([redis.get<ForwardBook>(FORWARD_BOOK_KEY),redis.get<{from:string;to:string;trades:BacktestSourceTrade[]}>(BACKTEST_KEY).catch(()=>null)]);
 return {rows,forwardRows:book?.rows??[],baseRows,backtestTrades:backtest?.trades??[],backtestWindow:backtest?`${backtest.from.slice(0,10)} → ${backtest.to.slice(0,10)}`:null};
}
/** Recomputes the ledger from saved rows, files any due proposals, derives shadow weights from confirmed sides, and persists all three. */
export async function runCryptoCalibration(redis:Redis,now=Date.now()){
 const {rows,forwardRows,baseRows,backtestTrades,backtestWindow}=await loadCalibrationInputs(redis);
 const previous=await redis.get<{version:string}>(SHADOW_WEIGHTS_KEY).catch(()=>null);
 const ledger=buildCalibration(paperObservations(rows),forwardObservations(forwardRows),{closedTrades:rows.length,forwardRows:forwardRows.length,shadowVersion:previous?.version??null,baseTrades:baseRows.length,backtestTrades:backtestTrades.length,backtestWindow},now,paperObservations(baseRows),backtestObservations(backtestTrades));
 const [recs,filed]=await Promise.all([loadRecommendations(redis),redis.get<Record<string,string>>(CALIBRATION_FILED_KEY)]);
 const proposals=proposeFromLedger(ledger,recs,filed??{},now);
 if(proposals.filedNow.length){await saveRecommendations(redis,proposals.rows);await redis.set(CALIBRATION_FILED_KEY,proposals.filed);}
 await redis.set(CALIBRATION_KEY,ledger,{ex:CAL.ttlSec});
 const shadow=await persistShadowWeights(redis,ledger,now);
 return {ledger,filedNow:proposals.filedNow,skippedByCap:proposals.skippedByCap,shadow};
}
/** Once per UTC day from the cron; a second call the same day reads the saved ledger. */
export async function runDailyCalibration(redis:Redis,now=Date.now()){
 const day=new Date(now).toISOString().slice(0,10);
 const fresh=await redis.set(`${CALIBRATION_DAY_KEY}:${day}`,'done',{nx:true,ex:36*3600});
 if(!fresh)return {ok:true,skipped:true,reason:'Calibration already ran today'};
 try{const out=await runCryptoCalibration(redis,now);return {ok:true,skipped:false,filed:out.filedNow.length,skippedByCap:out.skippedByCap,fields:out.ledger.fields.length};}
 catch(error){console.error('[crypto-calibration] failed',error);return {ok:false,skipped:false,error:'Calibration pass failed; saved ledger unchanged'};}
}
