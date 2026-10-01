import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
const q=vi.fn();
vi.mock('@/lib/db',()=>({q:(...a:unknown[])=>q(...a)}));
import {AUDIT,TRANSCRIPT_AUDIT_DDL,aggregateAudits,auditLatestSummary,auditQuestions,ddlStatements,deriveAudit,summaryClaims,type AuditClaim,type TranscriptAudit} from '@/lib/admin/transcriptJevAudit';
import {buildTranscriptBuffer,type TranscriptSummary} from '@/lib/earnings/transcripts';
const savedKey=process.env.AI_GATEWAY_API_KEY;
const summary:TranscriptSummary={oneLiner:'Strong quarter on cloud.',keyThemes:['Cloud grew 30%','Margins expanded'],guidanceChanges:['FY revenue raised to $10B'],redFlags:[],tone:'bullish',surpriseDirection:'beat'};
const segments=[{speaker:'CEO',title:'Chief Executive',content:'Cloud revenue grew thirty percent. Margins expanded two points.',sentiment:null},{speaker:'Analyst',title:'Bank',content:'Thanks, great quarter.',sentiment:null}];
beforeEach(()=>{q.mockReset();process.env.AI_GATEWAY_API_KEY='jev-key';});
afterEach(()=>{vi.unstubAllGlobals();if(savedKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=savedKey;});
it('the table the audit creates is exactly the checked-in migration',()=>{
 const norm=(s:string)=>s.replace(/\r\n/g,'\n');
 expect(norm(TRANSCRIPT_AUDIT_DDL)).toBe(norm(readFileSync('migrations/110_transcript_jev_audits.sql','utf8')));
 expect(ddlStatements()).toHaveLength(2);
});
it('flattens a summary into stable claim ids and builds one support question per claim plus three structural checks',()=>{
 const claims=summaryClaims(summary);
 expect(claims.map(c=>[c.id,c.kind])).toEqual([['claim_0','oneLiner'],['claim_1','theme'],['claim_2','theme'],['claim_3','guidance']]);
 const qs=auditQuestions(claims,summary);
 expect(Object.keys(qs)).toEqual(['claim_0','claim_1','claim_2','claim_3','guidanceStated','surpriseStated','toneMatches']);
 expect(qs.claim_3.instructions).toMatchObject({claim:'FY revenue raised to $10B',claimKind:'guidance'});
 expect(qs.toneMatches.instructions).toMatchObject({statedTone:'bullish'});
 const many=summaryClaims({...summary,keyThemes:Array.from({length:40},(_,i)=>`t${i}`)});
 expect(many).toHaveLength(AUDIT.maxClaims);
});
it('derived flags are code: invented guidance means a non-empty list the transcript does not support',()=>{
 const claims:AuditClaim[]=[{id:'claim_0',kind:'oneLiner',text:'a',supported:.9},{id:'claim_1',kind:'theme',text:'b',supported:.2},{id:'claim_2',kind:'guidance',text:'c',supported:.1}];
 expect(deriveAudit(claims,summary,.1,.9)).toEqual({claimsUnsupported:2,minSupport:.1,meanSupport:(0.9+0.2+0.1)/3,guidanceInvented:true,surpriseInvented:false});
 expect(deriveAudit(claims,{...summary,guidanceChanges:[],surpriseDirection:'unknown'},.1,.1)).toMatchObject({guidanceInvented:false,surpriseInvented:false});
 expect(deriveAudit([],summary,.9,.9)).toMatchObject({claimsUnsupported:0,minSupport:null,meanSupport:null});
});
it('audits the latest summary once against the same transcript buffer the summariser read, and stores the result',async()=>{
 q.mockImplementation(async(sql:string)=>{
  if(sql.startsWith('SELECT s.id'))return [{id:'77',symbol:'MSFT',quarter:'2026Q3',version:2,summary,audited:false}];
  if(sql.startsWith('SELECT transcript'))return [{transcript:segments}];
  return [];
 });
 const fetch=vi.fn(async()=>({ok:true,json:async()=>({model:'jev-1.13.0',answers:{claim_0:{probability:.9},claim_1:{probability:.95},claim_2:{probability:.85},claim_3:{probability:.08},guidanceStated:{probability:.1},surpriseStated:{probability:.2},toneMatches:{probability:.8}},usage:{input_tokens:900}})}));
 vi.stubGlobal('fetch',fetch);
 const out=await auditLatestSummary('msft','2026Q3',Date.UTC(2026,9,1));
 expect(out.ok).toBe(true);
 expect(out.audit).toMatchObject({summaryId:77,version:2,status:'scored',claimsTotal:4,claimsUnsupported:1,guidanceInvented:true,surpriseInvented:true,toneMatches:.8,model:'jev-1.13.0',inputTokens:900});
 const body=JSON.parse((fetch.mock.calls[0] as unknown as [string,{body:string}])[1].body);
 expect(body.state.transcript).toBe(buildTranscriptBuffer(segments));
 expect(body.state).not.toHaveProperty('summary');
 expect(Object.keys(body.questions)).toHaveLength(7);
 const insert=q.mock.calls.find(c=>String(c[0]).startsWith('INSERT INTO transcript_jev_audits'))!;
 expect(insert[1].slice(0,6)).toEqual([77,'MSFT','2026Q3',2,'jev-transcript-audit-v1','scored']);
 expect(String(q.mock.calls[0][0])).toMatch(/CREATE TABLE IF NOT EXISTS transcript_jev_audits/);
});
it('an already-audited version is not sent again; a failed call is stored as unavailable with its reason',async()=>{
 q.mockImplementation(async(sql:string)=>sql.startsWith('SELECT s.id')?[{id:'77',symbol:'MSFT',quarter:'2026Q3',version:2,summary,audited:true}]:sql.startsWith('SELECT * FROM transcript_jev_audits')?[{summary_id:'77',symbol:'MSFT',quarter:'2026Q3',version:2,rule:'r',status:'scored',claims:[],claims_total:0,claims_unsupported:0,min_support:null,mean_support:null,guidance_stated:'0.5',guidance_invented:false,surprise_stated:null,surprise_invented:null,tone_matches:null,transcript_chars:10,model:'m',input_tokens:1,reason:null,checked_at:'2026-10-01T00:00:00Z'}]:[]);
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const again=await auditLatestSummary('MSFT','2026Q3');
 expect(again).toMatchObject({ok:true,reason:'already-audited'});
 expect(again.audit?.guidanceStated).toBe(.5);
 expect(fetch).not.toHaveBeenCalled();
 q.mockImplementation(async(sql:string)=>sql.startsWith('SELECT s.id')?[{id:'78',symbol:'MSFT',quarter:'2026Q4',version:1,summary,audited:false}]:sql.startsWith('SELECT transcript')?[{transcript:segments}]:[]);
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:500,json:async()=>({})})));
 const failed=await auditLatestSummary('MSFT','2026Q4');
 expect(failed).toMatchObject({ok:false,reason:'http-500'});
 expect(failed.audit).toMatchObject({status:'unavailable',claimsTotal:4,claimsUnsupported:null});
 delete process.env.AI_GATEWAY_API_KEY;
 expect(await auditLatestSummary('MSFT','2026Q4')).toEqual({ok:false,reason:'no-key'});
});
it('the aggregate counts unsupported claims by kind and invented fields across audits',()=>{
 const base:TranscriptAudit={summaryId:1,symbol:'A',quarter:'q',version:1,rule:'r',status:'scored',claims:[{id:'claim_0',kind:'oneLiner',text:'',supported:.9},{id:'claim_1',kind:'guidance',text:'',supported:.1}],claimsTotal:2,claimsUnsupported:1,minSupport:.1,meanSupport:.5,guidanceStated:.1,guidanceInvented:true,surpriseStated:.9,surpriseInvented:false,toneMatches:.3,transcriptChars:1,model:'m',inputTokens:1,reason:null,checkedAt:''};
 const agg=aggregateAudits([base,{...base,summaryId:2,status:'unavailable',claims:[]}]);
 expect(agg).toMatchObject({audits:2,scored:1,unavailable:1,claims:2,unsupportedClaims:1,guidanceInvented:1,surpriseInvented:0,toneMismatch:1,meanSupport:.5});
 expect(agg.unsupportedByKind.guidance).toEqual({claims:1,unsupported:1});
});
it('the audit never edits a summary and never reaches public code',()=>{
 const src=readFileSync('lib/admin/transcriptJevAudit.ts','utf8');
 expect(src).not.toMatch(/UPDATE earnings_transcript_summaries|DELETE FROM earnings|openai/i);
 expect(readFileSync('lib/earnings/transcripts.ts','utf8')).not.toMatch(/transcriptJevAudit|jevClient/);
 expect(readFileSync('app/api/admin/transcripts/route.ts','utf8')).toMatch(/requireAdmin/);
});
