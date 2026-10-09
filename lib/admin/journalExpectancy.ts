import { q } from '@/lib/db';
import { adminErrorText } from '@/lib/admin/errorResponse';

export type JournalExpectancyItem = {
 key:string; sample:number; validRCount:number; missingRCount:number; invalidRCount:number;
 conflicts:number; sourceCounts:{rMultiple:number;dynamicR:number;normalizedR:number};
 winRate:number|null; avgR:number; totalR:number; profitFactor:number|null; note:string;
};
export type JournalExpectancyDashboard = {
 generatedAt:string; status:'available'|'unavailable'; sampleTrades:number|null;
 validRCount:number|null; missingRCount:number|null; invalidRCount:number|null; conflicts:number|null;
 bestSymbols:JournalExpectancyItem[]; weakestSymbols:JournalExpectancyItem[];
 bestPlaybooks:JournalExpectancyItem[]; weakestPlaybooks:JournalExpectancyItem[]; notes:string[];
};
// Single snapshot: uncapped totals and both groupings; no missing-R zero substitution.
export const JOURNAL_EXPECTANCY_SQL = `WITH basis AS (
 SELECT symbol, COALESCE(NULLIF(strategy,''),NULLIF(setup,''),NULLIF(trade_type,''),'Unclassified') AS playbook,
 COALESCE(r_multiple::numeric,dynamic_r::numeric,normalized_r::numeric) AS raw_r,
 CASE WHEN r_multiple IS NOT NULL THEN 'r_multiple' WHEN dynamic_r IS NOT NULL THEN 'dynamic_r'
 WHEN normalized_r IS NOT NULL THEN 'normalized_r' ELSE NULL END AS r_source,
 pl::numeric AS pnl, outcome
 FROM journal_entries WHERE workspace_id = $1 AND is_open=FALSE
 AND COALESCE(exit_date,trade_date)>=CURRENT_DATE-INTERVAL '90 days'
), measured AS (
 SELECT *, CASE WHEN raw_r::text NOT IN ('NaN','Infinity','-Infinity') THEN raw_r ELSE NULL END AS valid_r FROM basis
)
SELECT CASE WHEN GROUPING(symbol)=0 THEN 'symbol' WHEN GROUPING(playbook)=0 THEN 'playbook' ELSE 'overall' END AS kind,
 CASE WHEN GROUPING(symbol)=0 THEN COALESCE(symbol,'Unknown') WHEN GROUPING(playbook)=0 THEN playbook ELSE 'ALL' END AS key,
 COUNT(*)::int AS sample, COUNT(valid_r)::int AS valid_r_count,
 COUNT(*) FILTER(WHERE raw_r IS NULL)::int AS missing_r_count,
 COUNT(*) FILTER(WHERE raw_r IS NOT NULL AND valid_r IS NULL)::int AS invalid_r_count,
 COUNT(*) FILTER(WHERE valid_r>0)::int AS wins,
 COUNT(*) FILTER(WHERE valid_r IS NOT NULL AND r_source='r_multiple')::int AS r_multiple_count,
 COUNT(*) FILTER(WHERE valid_r IS NOT NULL AND r_source='dynamic_r')::int AS dynamic_r_count,
 COUNT(*) FILTER(WHERE valid_r IS NOT NULL AND r_source='normalized_r')::int AS normalized_r_count,
 COUNT(*) FILTER(WHERE valid_r IS NOT NULL AND ((pnl::text NOT IN ('NaN','Infinity','-Infinity') AND SIGN(pnl)<>SIGN(valid_r))
 OR (outcome='win' AND valid_r<=0) OR (outcome='loss' AND valid_r>=0)))::int AS conflicts,
 AVG(valid_r)::float AS avg_r, SUM(valid_r)::float AS total_r,
 SUM(GREATEST(valid_r,0)) FILTER(WHERE valid_r IS NOT NULL)::float AS gross_win_r,
 ABS(SUM(LEAST(valid_r,0)) FILTER(WHERE valid_r IS NOT NULL))::float AS gross_loss_r
FROM measured GROUP BY GROUPING SETS ((symbol),(playbook),())`;
type Row = Record<string,unknown>;
const count=(r:Row,key:string)=>Number(r[key]??0);
export function unavailableJournalExpectancy(note:string):JournalExpectancyDashboard {
 return {generatedAt:new Date().toISOString(),status:'unavailable',sampleTrades:null,validRCount:null,missingRCount:null,invalidRCount:null,conflicts:null,bestSymbols:[],weakestSymbols:[],bestPlaybooks:[],weakestPlaybooks:[],notes:[note]};
}
export function journalExpectancyFromRows(rows:Row[]):JournalExpectancyDashboard {
 const overall=rows.find(r=>r.kind==='overall');
 if(!overall) return unavailableJournalExpectancy('Journal expectancy unavailable: aggregate totals were not returned.');
 function items(kind:string):JournalExpectancyItem[] {
  return rows.filter(r=>r.kind===kind && count(r,'valid_r_count')>=2 && r.avg_r!=null && Number.isFinite(Number(r.avg_r))).map(r=>{
   const sample=count(r,'sample'),validRCount=count(r,'valid_r_count'),missingRCount=count(r,'missing_r_count'),invalidRCount=count(r,'invalid_r_count');
   const avgR=Number(r.avg_r),totalR=Number(r.total_r);
   const sourceCounts={rMultiple:count(r,'r_multiple_count'),dynamicR:count(r,'dynamic_r_count'),normalizedR:count(r,'normalized_r_count')};
   const conflicts=count(r,'conflicts');
   return {key:String(r.key),sample,validRCount,missingRCount,invalidRCount,conflicts,sourceCounts,
    winRate:count(r,'wins')/validRCount,avgR,totalR,profitFactor:count(r,'gross_loss_r')>0?count(r,'gross_win_r')/count(r,'gross_loss_r'):null,
    note:`${sample} closed trades; ${validRCount} valid R, ${missingRCount} missing, ${invalidRCount} invalid. Sources: ${sourceCounts.rMultiple} recorded / ${sourceCounts.dynamicR} dynamic / ${sourceCounts.normalizedR} normalized. ${conflicts} conflicting outcome/P&L/R records.`};
  });
 }
 const symbols=items('symbol'),playbooks=items('playbook');
 const best=(a:JournalExpectancyItem[])=>a.slice().sort((a,b)=>b.avgR-a.avgR||a.key.localeCompare(b.key)).slice(0,4);
 const weak=(a:JournalExpectancyItem[])=>a.slice().sort((a,b)=>a.avgR-b.avgR||a.key.localeCompare(b.key)).slice(0,4);
 const sampleTrades=count(overall,'sample'),validRCount=count(overall,'valid_r_count'),missingRCount=count(overall,'missing_r_count'),invalidRCount=count(overall,'invalid_r_count'),conflicts=count(overall,'conflicts');
 return {generatedAt:new Date().toISOString(),status:'available',sampleTrades,validRCount,missingRCount,invalidRCount,conflicts,
 bestSymbols:best(symbols),weakestSymbols:weak(symbols),bestPlaybooks:best(playbooks),weakestPlaybooks:weak(playbooks),
 notes:[`${sampleTrades} closed journal trades in 90 days: ${validRCount} valid R, ${missingRCount} missing R, ${invalidRCount} invalid R; ${conflicts} conflicting outcome/P&L/R records.`,
 'R uses the first non-null recorded, dynamic, then normalized field. A nonfinite selected field is excluded, not replaced. Sources may have different risk/cost bases; these are journal records, not independently verified fills.',
 'Win rate is positive R divided by all valid R, including zero R. Groups require two valid R values and are ordered by mean R; at most four per list. Overall counts include every eligible group.',
 validRCount<30?'Valid-R sample is thin; do not treat this as calibrated expectancy.': 'Historical journal expectancy is descriptive; overlapping trades and differing R bases can limit comparison.']};
}
export async function loadJournalExpectancy(workspaceId:string|null|undefined):Promise<JournalExpectancyDashboard> {
 if(!workspaceId) return unavailableJournalExpectancy('Journal expectancy unavailable: no operator workspace.');
 try {return journalExpectancyFromRows(await q(JOURNAL_EXPECTANCY_SQL,[workspaceId]));}
 catch(error){adminErrorText(error,'admin:journal-expectancy');return unavailableJournalExpectancy('Journal expectancy unavailable: the journal could not be read.');}
}
