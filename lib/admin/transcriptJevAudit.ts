import {q} from '@/lib/db';
import {buildTranscriptBuffer,type TranscriptSegment,type TranscriptSummary} from '@/lib/earnings/transcripts';
import {askJev,JevFailure,jevConfigured,type JevBooleanQuestion} from './jevClient';
/**
 * Transcript summary audit (jev-transcript-audit-v1). After GPT writes a summary, Jev reads the SAME transcript buffer
 * and answers, for every claim in the summary, whether the transcript supports it; plus whether guidance and a
 * beat/miss were actually stated. One request per summary version; all questions evaluated in parallel.
 * This is a guardrail, not a predictor: nothing here edits the summary, and a low score is shown, not acted on.
 */
export const TRANSCRIPT_AUDIT_RULE='jev-transcript-audit-v1' as const;
export const AUDIT={maxClaims:24,claimChars:400,supportYes:0.5} as const;
export const TRANSCRIPT_AUDIT_DDL=`-- Jev audit of GPT earnings-call summaries (admin research only). One row per summary version.
-- Each claim in the summary is checked against the same transcript buffer the summariser read. Guardrail only; nothing edits the summary.
CREATE TABLE IF NOT EXISTS transcript_jev_audits (
  summary_id        BIGINT PRIMARY KEY REFERENCES earnings_transcript_summaries(id) ON DELETE CASCADE,
  symbol            TEXT NOT NULL,
  quarter           TEXT NOT NULL,
  version           INTEGER NOT NULL,
  rule              TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('scored','unavailable')),
  claims            JSONB NOT NULL DEFAULT '[]'::jsonb,
  claims_total      INTEGER NOT NULL DEFAULT 0,
  claims_unsupported INTEGER,
  min_support       DOUBLE PRECISION,
  mean_support      DOUBLE PRECISION,
  guidance_stated   DOUBLE PRECISION,
  guidance_invented BOOLEAN,
  surprise_stated   DOUBLE PRECISION,
  surprise_invented BOOLEAN,
  tone_matches      DOUBLE PRECISION,
  transcript_chars  INTEGER,
  model             TEXT,
  input_tokens      INTEGER,
  reason            TEXT,
  checked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS transcript_jev_audits_symbol_idx ON transcript_jev_audits (symbol, quarter, version DESC);
`;
export function ddlStatements(sql=TRANSCRIPT_AUDIT_DDL):string[]{return sql.replace(/--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);}
let ensured:Promise<void>|null=null;
export function ensureAuditTable(){
 if(!ensured)ensured=(async()=>{for(const s of ddlStatements())await q(s);})().catch(e=>{ensured=null;throw e;});
 return ensured;
}
export type ClaimKind='oneLiner'|'theme'|'guidance'|'redFlag';
export type AuditClaim={id:string;kind:ClaimKind;text:string;supported:number|null};
export type TranscriptAudit={summaryId:number;symbol:string;quarter:string;version:number;rule:string;status:'scored'|'unavailable';claims:AuditClaim[];claimsTotal:number;claimsUnsupported:number|null;minSupport:number|null;meanSupport:number|null;guidanceStated:number|null;guidanceInvented:boolean|null;surpriseStated:number|null;surpriseInvented:boolean|null;toneMatches:number|null;transcriptChars:number|null;model:string|null;inputTokens:number|null;reason:string|null;checkedAt:string};
/** Flattens the summary into checkable claims, in a fixed order so claim ids are stable per version. */
export function summaryClaims(summary:TranscriptSummary):Omit<AuditClaim,'supported'>[]{
 const out:Omit<AuditClaim,'supported'>[]=[];
 const add=(kind:ClaimKind,text:unknown)=>{if(typeof text==='string'&&text.trim()&&out.length<AUDIT.maxClaims)out.push({id:`claim_${out.length}`,kind,text:text.trim().slice(0,AUDIT.claimChars)});};
 add('oneLiner',summary.oneLiner);
 for(const t of summary.keyThemes??[])add('theme',t);
 for(const g of summary.guidanceChanges??[])add('guidance',g);
 for(const r of summary.redFlags??[])add('redFlag',r);
 return out;
}
const SUPPORT_Q='Is `claim` directly supported by what the speakers say in `transcript`? Supported means the transcript states it or clearly implies it. Not supported means the claim adds a fact, number, name, or intent that the transcript does not contain, or contradicts it.';
export function auditQuestions(claims:Omit<AuditClaim,'supported'>[],summary:TranscriptSummary){
 const questions:Record<string,JevBooleanQuestion>={};
 for(const c of claims)questions[c.id]={type:'boolean',instructions:{claim:c.text,claimKind:c.kind,question:SUPPORT_Q},criteria:{true:'The transcript contains this, in substance',false:'The transcript does not contain this, or says otherwise'}};
 questions.guidanceStated={type:'boolean',instructions:'Does `transcript` contain explicit forward-looking guidance from management: a numeric or clearly directional outlook for a future period?',criteria:{true:'Management gives an outlook for a coming period',false:'No forward outlook is given, or only vague optimism'}};
 questions.surpriseStated={type:'boolean',instructions:'Does `transcript` explicitly compare reported results with expectations, consensus, or prior guidance (a beat, a miss, or in line)?',criteria:{true:'Someone on the call states results versus expectations',false:'Results are reported without any comparison to expectations'}};
 questions.toneMatches={type:'boolean',instructions:{statedTone:summary.tone,question:'Does the overall tone of management language in `transcript` match `statedTone`?'},criteria:{true:'The stated tone is a fair reading of how management speaks',false:'Management language reads differently from the stated tone'}};
 return questions;
}
export function auditState(symbol:string,quarter:string,transcript:string){return {symbol,quarter,transcript};}
/** Derived flags are code, not model output: an invented item is a non-empty summary field the transcript does not support. */
export function deriveAudit(claims:AuditClaim[],summary:TranscriptSummary,guidanceStated:number,surpriseStated:number){
 const supports=claims.map(c=>c.supported).filter((n):n is number=>typeof n==='number');
 return {
  claimsUnsupported:supports.filter(p=>p<AUDIT.supportYes).length,
  minSupport:supports.length?Math.min(...supports):null,
  meanSupport:supports.length?supports.reduce((s,n)=>s+n,0)/supports.length:null,
  guidanceInvented:(summary.guidanceChanges?.length??0)>0&&guidanceStated<AUDIT.supportYes,
  surpriseInvented:summary.surpriseDirection!=='unknown'&&surpriseStated<AUDIT.supportYes,
 };
}
type SummaryRow={id:number|string;symbol:string;quarter:string;version:number;summary:TranscriptSummary};
async function latestUnaudited(symbol:string,quarter:string){
 const rows=await q<SummaryRow&{audited:boolean}>(`SELECT s.id,s.symbol,s.quarter,s.version,s.summary,(a.summary_id IS NOT NULL) AS audited FROM earnings_transcript_summaries s LEFT JOIN transcript_jev_audits a ON a.summary_id=s.id WHERE s.symbol=$1 AND s.quarter=$2 ORDER BY s.version DESC LIMIT 1`,[symbol.toUpperCase(),quarter]);
 return rows[0]??null;
}
/** Audits the latest summary version for a symbol/quarter once. Never throws; returns the stored audit or a reason. */
export async function auditLatestSummary(symbol:string,quarter:string,now=Date.now()):Promise<{ok:boolean;reason?:string;audit?:TranscriptAudit}>{
 try{
  await ensureAuditTable();
  const row=await latestUnaudited(symbol,quarter);
  if(!row)return {ok:false,reason:'no-summary'};
  if(row.audited)return {ok:true,reason:'already-audited',audit:(await getAudit(Number(row.id)))??undefined};
  if(!jevConfigured())return {ok:false,reason:'no-key'};
  const t=await q<{transcript:TranscriptSegment[]}>(`SELECT transcript FROM earnings_transcripts WHERE symbol=$1 AND quarter=$2`,[symbol.toUpperCase(),quarter]);
  if(!t[0])return {ok:false,reason:'no-transcript'};
  const buffer=buildTranscriptBuffer(t[0].transcript);
  const claims=summaryClaims(row.summary);
  const base={summaryId:Number(row.id),symbol:row.symbol,quarter:row.quarter,version:row.version,rule:TRANSCRIPT_AUDIT_RULE,transcriptChars:buffer.length,checkedAt:new Date(now).toISOString()};
  let audit:TranscriptAudit;
  try{
   const {model,answers,inputTokens}=await askJev(auditState(row.symbol,row.quarter,buffer),auditQuestions(claims,row.summary),{timeoutMs:45000});
   const scored:AuditClaim[]=claims.map(c=>({...c,supported:answers[c.id]?.probability??null}));
   const g=answers.guidanceStated.probability,s=answers.surpriseStated.probability,tone=answers.toneMatches.probability;
   audit={...base,status:'scored',claims:scored,claimsTotal:scored.length,...deriveAudit(scored,row.summary,g,s),guidanceStated:g,surpriseStated:s,toneMatches:tone,model,inputTokens:inputTokens??null,reason:null};
  }catch(e){
   audit={...base,status:'unavailable',claims:claims.map(c=>({...c,supported:null})),claimsTotal:claims.length,claimsUnsupported:null,minSupport:null,meanSupport:null,guidanceStated:null,guidanceInvented:null,surpriseStated:null,surpriseInvented:null,toneMatches:null,model:null,inputTokens:null,reason:e instanceof JevFailure?e.reason:'error'};
  }
  await q(`INSERT INTO transcript_jev_audits (summary_id,symbol,quarter,version,rule,status,claims,claims_total,claims_unsupported,min_support,mean_support,guidance_stated,guidance_invented,surprise_stated,surprise_invented,tone_matches,transcript_chars,model,input_tokens,reason,checked_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) ON CONFLICT (summary_id) DO NOTHING`,
   [audit.summaryId,audit.symbol,audit.quarter,audit.version,audit.rule,audit.status,JSON.stringify(audit.claims),audit.claimsTotal,audit.claimsUnsupported,audit.minSupport,audit.meanSupport,audit.guidanceStated,audit.guidanceInvented,audit.surpriseStated,audit.surpriseInvented,audit.toneMatches,audit.transcriptChars,audit.model,audit.inputTokens,audit.reason,audit.checkedAt]);
  return {ok:audit.status==='scored',reason:audit.reason??undefined,audit};
 }catch(e){console.error('[transcript-audit] failed',e);return {ok:false,reason:'error'};}
}
type AuditRow={summary_id:number|string;symbol:string;quarter:string;version:number;rule:string;status:'scored'|'unavailable';claims:AuditClaim[];claims_total:number;claims_unsupported:number|null;min_support:number|string|null;mean_support:number|string|null;guidance_stated:number|string|null;guidance_invented:boolean|null;surprise_stated:number|string|null;surprise_invented:boolean|null;tone_matches:number|string|null;transcript_chars:number|null;model:string|null;input_tokens:number|null;reason:string|null;checked_at:Date|string};
const num=(v:number|string|null)=>v==null?null:Number(v);
function fromRow(r:AuditRow):TranscriptAudit{
 return {summaryId:Number(r.summary_id),symbol:r.symbol,quarter:r.quarter,version:r.version,rule:r.rule,status:r.status,claims:r.claims??[],claimsTotal:r.claims_total,claimsUnsupported:r.claims_unsupported,minSupport:num(r.min_support),meanSupport:num(r.mean_support),guidanceStated:num(r.guidance_stated),guidanceInvented:r.guidance_invented,surpriseStated:num(r.surprise_stated),surpriseInvented:r.surprise_invented,toneMatches:num(r.tone_matches),transcriptChars:r.transcript_chars,model:r.model,inputTokens:r.input_tokens,reason:r.reason,checkedAt:new Date(r.checked_at).toISOString()};
}
export async function getAudit(summaryId:number):Promise<TranscriptAudit|null>{
 await ensureAuditTable();
 const rows=await q<AuditRow>(`SELECT * FROM transcript_jev_audits WHERE summary_id=$1`,[summaryId]);
 return rows[0]?fromRow(rows[0]):null;
}
export type AuditAggregate={audits:number;scored:number;unavailable:number;claims:number;unsupportedClaims:number;unsupportedByKind:Record<ClaimKind,{claims:number;unsupported:number}>;guidanceInvented:number;surpriseInvented:number;toneMismatch:number;meanSupport:number|null};
/** Desk-wide view across every audit: how often the summariser adds what the transcript does not say. Counts, not verdicts. */
export function aggregateAudits(audits:TranscriptAudit[]):AuditAggregate{
 const byKind:AuditAggregate['unsupportedByKind']={oneLiner:{claims:0,unsupported:0},theme:{claims:0,unsupported:0},guidance:{claims:0,unsupported:0},redFlag:{claims:0,unsupported:0}};
 let claims=0,unsupported=0,supportSum=0,supportN=0,guidanceInvented=0,surpriseInvented=0,toneMismatch=0,scored=0;
 for(const a of audits){
  if(a.status!=='scored')continue;
  scored++;
  if(a.guidanceInvented)guidanceInvented++;
  if(a.surpriseInvented)surpriseInvented++;
  if(a.toneMatches!=null&&a.toneMatches<AUDIT.supportYes)toneMismatch++;
  for(const c of a.claims){
   if(typeof c.supported!=='number')continue;
   claims++;byKind[c.kind].claims++;supportSum+=c.supported;supportN++;
   if(c.supported<AUDIT.supportYes){unsupported++;byKind[c.kind].unsupported++;}
  }
 }
 return {audits:audits.length,scored,unavailable:audits.length-scored,claims,unsupportedClaims:unsupported,unsupportedByKind:byKind,guidanceInvented,surpriseInvented,toneMismatch,meanSupport:supportN?supportSum/supportN:null};
}
export async function auditAggregate():Promise<AuditAggregate>{
 await ensureAuditTable();
 const rows=await q<AuditRow>(`SELECT * FROM transcript_jev_audits ORDER BY checked_at DESC LIMIT 2000`);
 return aggregateAudits(rows.map(fromRow));
}
