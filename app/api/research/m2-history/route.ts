import {NextRequest,NextResponse} from 'next/server';
import {getSessionFromCookie} from '@/lib/auth';
import {resolvePublicQuotaAccess} from '@/lib/publicQuotaAccess';
import {m2ResearchEnabled} from '@/lib/publicDesign';
import {q} from '@/lib/db';
import {M2_HISTORY_BLOCS,historyWindow,projectM2History,type M2HistoryRow} from '@/lib/research/publicM2History';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie'}});
export async function GET(request:NextRequest){
 try {
  if(!m2ResearchEnabled())return json({error:'History unavailable'},404);
  const session=await getSessionFromCookie();
  if(!session?.workspaceId)return json({error:'Please sign in'},401);
  const access=await resolvePublicQuotaAccess(session);
  if(!access.bypass&&access.plan!=='pro')return json({error:'Pro is required for M2 history'},403);
  const bloc=request.nextUrl.searchParams.get('bloc')??'US';
  const months=Number(request.nextUrl.searchParams.get('months')??'12');
  if(!M2_HISTORY_BLOCS.some(b=>b[0]===bloc)||![12,36,60].includes(months))return json({error:'Choose a supported bloc and 12, 36 or 60 months'},400);
  if(!process.env.DATABASE_URL)return json({error:'Stored M2 history unavailable'},503);
  const now=new Date(),window=historyWindow(months,now);
  const rows=await q<M2HistoryRow>(`SELECT s.observed_on, s.value::text AS value, s.fetched_at, m.description
    FROM macro_series s LEFT JOIN macro_series_meta m ON m.series_key=s.series_key
    WHERE s.series_key=$1 AND s.observed_on >= $2::date AND s.observed_on < $3::date
    ORDER BY s.observed_on ASC`,['GM2_USD_'+bloc,window.start,window.end]);
  return json({data:projectM2History(bloc,months,rows,now)});
 }catch{return json({error:'Stored M2 history could not be loaded'},503);}
}
