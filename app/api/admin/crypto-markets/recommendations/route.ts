import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {createRecommendation,loadRecommendations,markRecommendation,saveRecommendations} from '@/lib/admin/cryptoRecommendations';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{const redis=getRedis();if(!redis)throw Error();return NextResponse.json({rows:await loadRecommendations(redis)});}
 catch{return NextResponse.json({error:'Recommendations unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{
  const redis=getRedis();if(!redis)throw Error();
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=='object')return NextResponse.json({error:'A recommendation is text only'},{status:400});
  if('apply' in body||body.action==='apply')return NextResponse.json({error:'Accepted does not edit code. No job applies a playbook change.'},{status:400});
  const rows=await loadRecommendations(redis);
  const next=body.action==='create'?createRecommendation(rows,body):body.action==='status'?markRecommendation(rows,body.id,body.status):null;
  if(!next)return NextResponse.json({error:'A recommendation is text only'},{status:400});
  await saveRecommendations(redis,next);
  return NextResponse.json({rows:next});
 }catch(error){
  const message=error instanceof Error&&error.message?error.message:'Recommendations unavailable';
  const rejected=/text|not found|Status must/.test(message);
  return NextResponse.json({error:message},{status:rejected?400:503});
 }
}
