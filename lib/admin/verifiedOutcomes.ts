export type OutcomeCohort = 'all' | 'verified' | 'unverified';
export type EvidenceStatus = 'verified' | 'unknown' | 'inconsistent';
export interface ProvenanceSummary {cohort:OutcomeCohort;total:number;verified:number;unknown:number;inconsistent:number;selected:number}
export interface EvidenceRecord {
 provenance?: Record<string,unknown>|null;
 direction?:unknown;signalAt?:unknown;entryPrice?:unknown;observedPrice?:unknown;observedAt?:unknown;processedAt?:unknown;outcome?:unknown;pctMove?:unknown;
}
/** Optional migration columns are read through row JSON; old schemas return null, not a query error. */
export const EVIDENCE_SQL = `jsonb_build_object(
 'provenance',to_jsonb(ai_signal_log)->'outcome_provenance',
 'direction',trade_bias,'signalAt',signal_at,'entryPrice',price_at_signal,
 'observedPrice',price_after_24h,'observedAt',to_jsonb(ai_signal_log)->'price_after_24h_at',
 'processedAt',outcome_measured_at,'outcome',outcome,'pctMove',pct_move_24h) AS provenance_evidence`;
export function parseCohort(value:string|null):OutcomeCohort {return value==='verified'||value==='unverified'?value:'all';}
const number=(value:unknown)=>value===null||value===undefined||value===''||typeof value==='boolean'?NaN:Number(value);
const time=(value:unknown)=>typeof value==='string'||value instanceof Date?new Date(value).getTime():NaN;
const close=(a:unknown,b:unknown,tolerance=0.00011)=>Number.isFinite(number(a))&&Number.isFinite(number(b))&&Math.abs(number(a)-number(b))<=tolerance;
const sameTime=(a:unknown,b:unknown)=>Number.isFinite(time(a))&&time(a)===time(b);
/** Verifies recorded method and consistency, NOT predictive skill or correctness of provider prices. */
export function evidenceStatus(e:EvidenceRecord|undefined|null):EvidenceStatus {
 const p=e?.provenance;
 if(!e||!p||typeof p!=='object'||Array.isArray(p))return 'unknown';
 if(p.writer!=='label-ai-outcomes'||p.method!=='first-completed-close-v1'||p.horizon!=='24h')return 'unknown';
 const direction=String(e.direction??'').trim().toUpperCase();
 const observed=time(e.observedAt),signal=time(e.signalAt),processed=time(e.processedAt);
 const move=number(e.pctMove),entry=number(e.entryPrice),exit=number(e.observedPrice);
 const signed=direction==='SHORT'?-move:move;
 const expected=signed>=1?'correct':signed<=-1?'wrong':'neutral';
 if(!['LONG','SHORT'].includes(direction)||p.direction!==direction||p.thresholdPct!==1||
    !['intraday','daily'].includes(String(p.barSource))||entry<=0||exit<=0||!Number.isFinite(entry)||!Number.isFinite(exit)||
    !Number.isFinite(move)||Math.abs(move)>100||!close(move,(number(p.observedPrice)-number(p.entryPrice))/number(p.entryPrice)*100)||
    p.outcome!==e.outcome||e.outcome!==expected||!close(p.entryPrice,entry,0.000000011)||!close(p.observedPrice,exit,0.000000011)||!close(p.pctMove,move)||
    !sameTime(p.signalAt,e.signalAt)||!sameTime(p.observedAt,e.observedAt)||!sameTime(p.processedAt,e.processedAt)||
    !(observed>=signal+86400000)||!(processed>=observed))return 'inconsistent';
 return 'verified';
}
export function selectOutcomeCohort<T extends {provenance_evidence?:EvidenceRecord}>(rows:T[],cohort:OutcomeCohort):{rows:T[];summary:ProvenanceSummary}{
 const summary:ProvenanceSummary={cohort,total:rows.length,verified:0,unknown:0,inconsistent:0,selected:0};
 const selected=rows.filter(row=>{const status=evidenceStatus(row.provenance_evidence);summary[status]++;return cohort==='all'||(cohort==='verified'?status==='verified':status!=='verified');});
 summary.selected=selected.length;return {rows:selected,summary};
}
