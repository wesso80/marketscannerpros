import {runMomentumBatch} from '@/lib/admin/cryptoMomentumBatch';
import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import type {MomentumScan} from '@/lib/admin/cryptoVolumeMomentum';
import {stampMomentumVolume,unavailableFlowStamp} from '@/lib/admin/cryptoFlow';
export const runtime='nodejs';export const dynamic='force-dynamic';
const KEY='admin:crypto-markets:momentum-volume:v1';
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{
  const redis=getRedis();if(!redis)throw Error();
  const scan=await redis.get<MomentumScan>(KEY);
  if(scan?.rows.some(r=>r.stage==='MOMENTUM_VOLUME'&&!r.flowStamp)&&!await redis.get(`${KEY}:batch-lock`)){
   try{await stampMomentumVolume(scan.rows);scan.updatedAt=new Date().toISOString();await redis.set(KEY,scan,{ex:86400});}
   catch{for(const row of scan.rows)if(row.stage==='MOMENTUM_VOLUME'&&!row.flowStamp)row.flowStamp=unavailableFlowStamp();}
  }
  return NextResponse.json({scan});
 }catch{return NextResponse.json({error:'Saved momentum scan unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 return runMomentumBatch();
}
