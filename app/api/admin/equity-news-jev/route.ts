import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {NEWS_JEV,labelNewsOutcomes,newsLedger,scorePendingNews} from '@/lib/admin/equityNewsJev';
export const runtime='nodejs';export const dynamic='force-dynamic';
const LOCK='admin:equity-news-jev:refresh-lock';
/** GET: the ledger computed from saved stamps. POST {action:'score'|'label'}: run one step behind a cooldown. Nothing here edits a classification. */
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{return NextResponse.json({ledger:await newsLedger()});}
 catch{return NextResponse.json({error:'News verification ledger unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{
  const body=await req.json().catch(()=>null);
  const action=body&&typeof body==='object'?body.action:null;
  if(action!=='score'&&action!=='label')return NextResponse.json({error:'Only {action:"score"} or {action:"label"} is accepted'},{status:400});
  const redis=getRedis();
  if(redis&&!await redis.set(`${LOCK}:${action}`,'reserved',{nx:true,px:NEWS_JEV.cooldownMs}))return NextResponse.json({error:`${action} ran recently; showing the saved ledger`,ledger:await newsLedger()},{status:429});
  const result=action==='score'?await scorePendingNews():await labelNewsOutcomes();
  return NextResponse.json({result,ledger:await newsLedger()});
 }catch{return NextResponse.json({error:'News verification step failed; saved stamps unchanged'},{status:503});}
}
