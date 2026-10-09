import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { q } from '@/lib/db';
import { EVIDENCE_SQL } from '@/lib/admin/verifiedOutcomes';
import { LABELLER_FIX_AT, signedMoveSql } from '@/lib/admin/signalStats';
import { compareExpectancy, type ShadowRow } from '@/lib/admin/expectancyShadow';
import { adminErrorText } from '@/lib/admin/errorResponse';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:NextRequest){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({ok:false,error:'Unauthorized'},{status:403,headers});
 const symbol=(req.nextUrl.searchParams.get('symbol')??'').trim().toUpperCase();
 const playbook=(req.nextUrl.searchParams.get('playbook')??'').trim();
 const rawScore=req.nextUrl.searchParams.get('baseScore');
 const baseScore=rawScore==null||rawScore===''?null:Number(rawScore);
 if(!/^[A-Z0-9.^=-]{1,24}$/.test(symbol)||!playbook||playbook.length>120||
   (baseScore!=null&&(!Number.isFinite(baseScore)||baseScore<0||baseScore>100))){
  return NextResponse.json({ok:false,error:'Enter a symbol, exact playbook key (1–120 characters), and optional base score from 0 to 100.'},{status:400,headers});
 }
 try{
  // Matches the live loader eligibility including its legacy non-SHORT-as-LONG signing.
  const rows=await q<ShadowRow>(`SELECT id::text, symbol=$1 AS symbol_match,
   COALESCE(decision_trace->>'playbook','Unknown')=$2 AS playbook_match,
   ${signedMoveSql('pct_move_24h')} AS signed_move, outcome, signal_at, ${EVIDENCE_SQL}
   FROM ai_signal_log WHERE workspace_id='operator-terminal'
   AND (symbol=$1 OR COALESCE(decision_trace->>'playbook','Unknown')=$2)
   AND outcome IN ('correct','wrong','neutral') AND outcome_measured_at >= $3::timestamptz
   AND pct_move_24h IS NOT NULL AND ABS(pct_move_24h)<=100
   AND signal_at > NOW()-INTERVAL '120 days'
   ORDER BY id LIMIT 20001`,[symbol,playbook,LABELLER_FIX_AT]);
  if(rows.length>20000)return NextResponse.json({ok:false,error:'More than 20,000 matching records; no truncated comparison is shown.'},{status:422,headers});
  return NextResponse.json({ok:true,symbol,playbook,...compareExpectancy(rows,baseScore),
   definition:'Read-only 120-day shared-scan comparison. Current matches the live loader eligibility, rounding, weighted symbol/playbook blend and score-boost function. Verified uses the same math after validating recorded 24h evidence. Maximum profile count gates the boost; overlapping records still contribute to both weighted profiles. The optional base score must be the score before expectancy is added. No live score is fetched or changed.',
   limitation:'This compares recorded-method cohorts, not predictive performance or execution P&L. Unknown directions remain in the current baseline to preserve its behavior. A zero verified boost from insufficient evidence is not proof that the strategy has no edge. Playbook matching is case-sensitive and must match the current hit key; blank/unknown hit keys use Unknown. No provider calls.'
  },{headers});
 }catch(error){adminErrorText(error,'admin:expectancy-shadow');return NextResponse.json({ok:false,error:'Expectancy comparison unavailable.'},{status:503,headers});}
}
