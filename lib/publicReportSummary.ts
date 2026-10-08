import { q } from '@/lib/db';
import { publicRequestFingerprint } from './publicQuotaAccess';
/** At most one automatic attempt per report/day. Never replay prose against changed evidence.
 * Pending/failed/different-input attempts return no AI text; current deterministic evidence still renders. */
export async function reportSummary(subject:string,resource:string,prompt:string,generate:()=>Promise<string|null>):Promise<string|null>{
 const fingerprint=publicRequestFingerprint(prompt);
 const inserted=await q<{day:string}>(`INSERT INTO public_report_summaries(subject_key,quota_day,resource_key,fingerprint,state)
 VALUES($1,(now() AT TIME ZONE 'America/New_York')::date,$2,$3,'pending') ON CONFLICT DO NOTHING RETURNING quota_day::text AS day`,[subject,resource,fingerprint]);
 if(!inserted.length){
  const rows=await q<{narrative:string|null}>(`SELECT narrative FROM public_report_summaries WHERE subject_key=$1
   AND quota_day=(now() AT TIME ZONE 'America/New_York')::date AND resource_key=$2 AND fingerprint=$3 AND state='ready'`,[subject,resource,fingerprint]);
  return rows[0]?.narrative??null;
 }
 let narrative:string|null=null;try{narrative=await generate();}catch{/* uncertain outcomes do not trigger retries */}
 if(narrative && Buffer.byteLength(narrative)>65536)narrative=null;
 await q(`UPDATE public_report_summaries SET state=$4,narrative=$5 WHERE subject_key=$1 AND quota_day=$2 AND resource_key=$3 AND state='pending'`,[subject,inserted[0].day,resource,narrative?'ready':'unavailable',narrative]);
 return narrative;
}
