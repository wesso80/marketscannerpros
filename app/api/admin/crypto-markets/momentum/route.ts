import {runMomentumBatch} from '@/lib/admin/cryptoMomentumBatch';
import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import type {MomentumScan} from '@/lib/admin/cryptoVolumeMomentum';
export const runtime='nodejs';export const dynamic='force-dynamic';
const KEY='admin:crypto-markets:momentum-volume:v1';
/** Stored observations only. Enrichment belongs to the coordinated batch writer. */
export async function GET(req:Request){
 const headers={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'};
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403,headers});
 try{
  const redis=getRedis();if(!redis)throw Error();
  const scan=await redis.get<MomentumScan>(KEY);
  return NextResponse.json({scan},{headers});
 }catch{return NextResponse.json({error:'Saved momentum scan unavailable'},{status:503,headers});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 return runMomentumBatch();
}
